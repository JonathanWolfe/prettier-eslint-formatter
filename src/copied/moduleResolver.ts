/**
 * Taken from prettier vs-code extension
 * https://github.com/prettier/prettier-vscode/blob/v9.1.0/src/ModuleResolver.ts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import findUp from "find-up";
import resolve from "resolve";
import { commands, TextDocument, workspace } from "vscode";

import { resolveGlobalNodePath, resolveGlobalYarnPath } from "./Files";
import loggingService from "./LoggingService";
import {
    FAILED_TO_LOAD_MODULE_MESSAGE,
    INVALID_PRETTIER_CONFIG,
    INVALID_PRETTIER_PATH_MESSAGE,
    OUTDATED_ESLINT_VERSION_MESSAGE,
    OUTDATED_PRETTIER_VERSION_MESSAGE
} from "./message";
import { getFromWorkspaceState, updateWorkspaceState } from "./stateUtils";
import type {
    ModuleResolverInterface,
    PackageManagers,
    PrettierModule,
    PrettierOptions,
    PrettierResolveConfigOptions,
    PrettierVSCodeConfig,
} from "./types";
import { getWorkspaceRelativePath } from "./util";

const minPrettierVersion = "1.13.0";
const minESLintVersion = "7.32.0";

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __webpack_require__: typeof require;
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __non_webpack_require__: typeof require;

export type PrettierNodeModule = typeof import('prettier');
export type ESLintNodeModule = typeof import('eslint');

const globalPaths: {
    [key: string]: { cache: string | undefined; get(): string | undefined; };
} = {
    npm: {
        cache: undefined,
        get(): string | undefined {
            return resolveGlobalNodePath();
        },
    },
    pnpm: {
        cache: undefined,
        get(): string {
            const pnpmPath = execSync("pnpm root -g").toString().trim();
            return pnpmPath;
        },
    },
    yarn: {
        cache: undefined,
        get(): string | undefined {
            return resolveGlobalYarnPath();
        },
    },
};

function globalPathGet(packageManager: PackageManagers): string | undefined {
    const pm = globalPaths[packageManager];
    if (pm) {
        if (pm.cache === undefined) {
            pm.cache = pm.get();
        }
        return pm.cache;
    }
    return undefined;
}

const CACHE_KEY_PRETTIER = 'PRETTIER' as const;
const CACHE_KEY_ESLINT = 'ESLINT' as const;
type CacheKeys = typeof CACHE_KEY_PRETTIER | typeof CACHE_KEY_ESLINT;
type CacheValues = PrettierNodeModule | ESLintNodeModule;
const cache = new Map<CacheKeys, CacheValues>();

export class ModuleResolver implements ModuleResolverInterface {
    private path2Module = new Map<string, PrettierNodeModule | ESLintNodeModule>();

    constructor() { }
    getGlobalPrettierInstance(): PrettierModule {
        throw new Error("Method not implemented.");
    }

    /**
     * Returns an instance of the prettier module.
     * @param fileName The path of the file to use as the starting point. If none provided, the bundled prettier will be used.
     */
    public async getPrettierInstance(
        fileName: string
    ): Promise<PrettierNodeModule | undefined> {
        const cached = cache.get(CACHE_KEY_PRETTIER) as PrettierNodeModule | undefined;
        if (cached) { return cached; }

        if (!workspace.isTrusted) {
            loggingService.logError('Untrusted Workspace, doing nothing');
        }

        // Look for local module
        let modulePath: string | undefined = undefined;

        try {
            modulePath = this.findPkg(fileName, "prettier");
        } catch (error) {
            let moduleDirectory = "";
            if (!modulePath && error instanceof Error) {
                // If findPkg threw an error from `resolve.sync`, attempt to parse the
                // directory it failed on to provide a better error message
                const resolveSyncPathRegex = /Cannot find module '.*' from '(.*)'/;
                const resolveErrorMatches = resolveSyncPathRegex.exec(error.message);
                if (resolveErrorMatches && resolveErrorMatches[1]) {
                    moduleDirectory = resolveErrorMatches[1];
                }
            }

            loggingService.logInfo(
                `Attempted to load Prettier module from ${modulePath || moduleDirectory || "package.json"
                }`
            );
            loggingService.logError(FAILED_TO_LOAD_MODULE_MESSAGE, error);

            // Return here because there is a local module, but we can't resolve it.
            // Must do NPM install for prettier to work.
            return undefined;
        }

        // If global modules allowed, look for global module
        if (!modulePath) {
            const packageManager = (await commands.executeCommand<
                "npm" | "pnpm" | "yarn"
            >("npm.packageManager"))!;
            const resolvedGlobalPackageManagerPath = globalPathGet(packageManager);
            if (resolvedGlobalPackageManagerPath) {
                const globalModulePath = path.join(
                    resolvedGlobalPackageManagerPath,
                    "prettier"
                );
                if (fs.existsSync(globalModulePath)) {
                    modulePath = globalModulePath;
                }
            }
        }

        let moduleInstance: PrettierNodeModule | undefined = undefined;
        if (modulePath !== undefined) {
            // First check module cache
            moduleInstance = this.path2Module.get(modulePath) as PrettierNodeModule;
            if (moduleInstance) {
                return moduleInstance;
            } else {
                try {
                    moduleInstance = this.loadNodeModule<PrettierNodeModule>(modulePath);
                    if (moduleInstance) {
                        this.path2Module.set(modulePath, moduleInstance);
                    }
                } catch (error) {
                    loggingService.logInfo(
                        `Attempted to load Prettier module from ${modulePath || "package.json"
                        }`
                    );
                    loggingService.logError(FAILED_TO_LOAD_MODULE_MESSAGE, error);

                    // Returning here because module didn't load.
                    return undefined;
                }
            }
        }

        if (moduleInstance) {
            // If the instance is missing `format`, it's probably
            // not an instance of Prettier
            const isPrettierInstance = !!moduleInstance.format;
            const isValidVersion =
                moduleInstance.version &&
                !!moduleInstance.getSupportInfo &&
                !!moduleInstance.getFileInfo &&
                !!moduleInstance.resolveConfig &&
                parseFloat(moduleInstance.version) >= parseFloat(minPrettierVersion);

            if (!isPrettierInstance) {
                loggingService.logError(INVALID_PRETTIER_PATH_MESSAGE);
                return undefined;
            }

            if (!isValidVersion) {
                loggingService.logInfo(
                    `Attempted to load Prettier module from ${modulePath}`
                );
                loggingService.logError(OUTDATED_PRETTIER_VERSION_MESSAGE);
                return undefined;
            }

            cache.set(CACHE_KEY_PRETTIER, moduleInstance);
            return moduleInstance;
        } else {
            loggingService.logError('No Prettier Found');
        }
    }

    /**
     * Returns an instance of the eslint module.
     * @param fileName The path of the file to use as the starting point. If none provided, the bundled eslint will be used.
     */
    public async getESLintInstance(
        fileName: string
    ): Promise<ESLintNodeModule | undefined> {
        const cached = cache.get(CACHE_KEY_ESLINT) as ESLintNodeModule | undefined;
        if (cached) { return cached; }

        if (!workspace.isTrusted) {
            loggingService.logError('Untrusted Workspace, doing nothing');
        }

        // Look for local module
        let modulePath: string | undefined = undefined;

        try {
            modulePath = this.findPkg(fileName, "eslint");
        } catch (error) {
            let moduleDirectory = "";
            if (!modulePath && error instanceof Error) {
                // If findPkg threw an error from `resolve.sync`, attempt to parse the
                // directory it failed on to provide a better error message
                const resolveSyncPathRegex = /Cannot find module '.*' from '(.*)'/;
                const resolveErrorMatches = resolveSyncPathRegex.exec(error.message);
                if (resolveErrorMatches && resolveErrorMatches[1]) {
                    moduleDirectory = resolveErrorMatches[1];
                }
            }

            const from = modulePath || moduleDirectory || "package.json";

            loggingService.logInfo(`Attempted to load ESLint module from ${from}`);
            loggingService.logError(FAILED_TO_LOAD_MODULE_MESSAGE, error);

            // Return here because there is a local module, but we can't resolve it.
            // Must do NPM install for eslint to work.
            return undefined;
        }

        // If global modules allowed, look for global module
        if (!modulePath) {
            type PackageManagers = "npm" | "pnpm" | "yarn";
            const packageManager = (await commands.executeCommand<PackageManagers>("npm.packageManager"))!;
            const resolvedGlobalPackageManagerPath = globalPathGet(packageManager);
            if (resolvedGlobalPackageManagerPath) {
                const globalModulePath = path.join(
                    resolvedGlobalPackageManagerPath,
                    "eslint"
                );
                if (fs.existsSync(globalModulePath)) {
                    modulePath = globalModulePath;
                }
            }
        }

        let moduleInstance: ESLintNodeModule | undefined = undefined;
        if (modulePath !== undefined) {
            // First check module cache
            moduleInstance = this.path2Module.get(modulePath) as ESLintNodeModule;
            if (moduleInstance) {
                return moduleInstance;
            } else {
                try {
                    moduleInstance = this.loadNodeModule<ESLintNodeModule>(modulePath);
                    if (moduleInstance) {
                        this.path2Module.set(modulePath, moduleInstance);
                    }
                } catch (error) {
                    const from = modulePath || "package.json";
                    loggingService.logInfo(`Attempted to load ESLint module from ${from}`);
                    loggingService.logError(FAILED_TO_LOAD_MODULE_MESSAGE, error);

                    // Returning here because module didn't load.
                    return undefined;
                }
            }
        }

        if (moduleInstance) {
            // If the instance is missing `format`, it's probably
            // not an instance of ESLint
            const isESLintInstance = !!moduleInstance.ESLint;
            // const isValidVersion = parseFloat(moduleInstance.version) >= parseFloat(minESLintVersion);
            const isValidVersion = true;

            if (!isESLintInstance) {
                loggingService.logError("Can't find ESLint");
                return undefined;
            }

            if (!isValidVersion) {
                loggingService.logInfo(
                    `Attempted to load ESLint module from ${modulePath}`
                );
                loggingService.logError(OUTDATED_ESLINT_VERSION_MESSAGE);
                return undefined;
            }

            cache.set(CACHE_KEY_ESLINT, moduleInstance);
            return moduleInstance;
        } else {
            loggingService.logError('No ESLint Found');
        }
    }

    public async getResolvedConfig(
        { fileName, uri }: TextDocument,
        vscodeConfig: PrettierVSCodeConfig
    ): Promise<"error" | "disabled" | PrettierOptions | null> {
        const isVirtual = uri.scheme !== "file";
        const prettier = await this.getPrettierInstance(fileName);

        let configPath: string | undefined;
        try {
            if (!isVirtual && prettier) {
                configPath = (await prettier.resolveConfigFile(fileName)) ?? undefined;
            }
        } catch (error) {
            loggingService.logError(
                `Error resolving prettier configuration for ${fileName}`,
                error
            );

            return "error";
        }

        const resolveConfigOptions: PrettierResolveConfigOptions = {
            config: isVirtual
                ? undefined
                : vscodeConfig.configPath
                    ? getWorkspaceRelativePath(fileName, vscodeConfig.configPath)
                    : configPath,
            editorconfig: isVirtual ? undefined : vscodeConfig.useEditorConfig,
        };

        let resolvedConfig: PrettierOptions | null;
        try {
            resolvedConfig = isVirtual || !prettier
                ? null
                : await prettier.resolveConfig(fileName, resolveConfigOptions);
        } catch (error) {
            loggingService.logError(
                "Invalid prettier configuration file detected.",
                error
            );
            loggingService.logError(INVALID_PRETTIER_CONFIG);

            return "error";
        }
        if (resolveConfigOptions.config) {
            loggingService.logInfo(
                `Using config file at '${resolveConfigOptions.config}'`
            );
        }

        if (!isVirtual && !resolvedConfig && vscodeConfig.requireConfig) {
            loggingService.logInfo(
                "Require config set to true and no config present. Skipping file."
            );
            return "disabled";
        }
        return resolvedConfig;
    }

    /**
     * Clears the module and config cache
     */
    public async dispose() {
        this.path2Module.forEach((module) => {
            try {
                // @ts-expect-error eslint doesn't have this method
                module.clearConfigCache();
            } catch (error) {
                loggingService.logError("Error clearing module cache.", error);
            }
        });
        this.path2Module.clear();
    }

    // Source: https://github.com/microsoft/vscode-eslint/blob/master/server/src/eslintServer.ts
    private loadNodeModule<T>(moduleName: string): T | undefined {
        const r =
            typeof __webpack_require__ === "function"
                ? __non_webpack_require__
                : require;
        try {
            return r(moduleName);
        } catch (error) {
            loggingService.logError(
                `Error loading node module '${moduleName}'`,
                error
            );
        }
        return undefined;
    }

    private isInternalTestRoot(dir: string): boolean {
        if (process.env.NODE_ENV !== "production") {
            // This is for testing purposes only. This code is removed in the
            // shipped version of this extension so do not use this in your
            // project. It won't work.
            return fs.existsSync(path.join(dir, ".do-not-use-prettier-vscode-root"));
        } else {
            return false;
        }
    }

    /**
     * Recursively search upwards for a given module definition based on
     * package.json or node_modules existence
     * @param {string} fsPath file system path to start searching from
     * @param {string} pkgName package's name to search for
     * @returns {string} resolved path to module
     */
    private findPkg(fsPath: string, pkgName: string): string | undefined {
        const stateKey = `module-path:${fsPath}:${pkgName}`;
        const packagePathState = getFromWorkspaceState(stateKey, false);
        if (packagePathState) {
            return packagePathState;
        }

        // Only look for a module definition outside of any `node_modules` directories
        const splitPath = fsPath.split("/");
        let finalPath = fsPath;
        const nodeModulesIndex = splitPath.indexOf("node_modules");

        if (nodeModulesIndex > 1) {
            finalPath = splitPath.slice(0, nodeModulesIndex).join("/");
        }

        // First look for an explicit package.json dep
        const packageJsonResDir = findUp.sync(
            (dir) => {
                if (fs.existsSync(path.join(dir, "package.json"))) {
                    let packageJson;
                    try {
                        packageJson = JSON.parse(
                            fs.readFileSync(path.join(dir, "package.json"), "utf8")
                        );
                    } catch (e) {
                        // Swallow, if we can't read it we don't want to resolve based on it
                    }

                    if (
                        packageJson &&
                        ((packageJson.dependencies && packageJson.dependencies[pkgName]) ||
                            (packageJson.devDependencies &&
                                packageJson.devDependencies[pkgName]))
                    ) {
                        return dir;
                    }
                }

                if (this.isInternalTestRoot(dir)) {
                    return findUp.stop;
                }
            },
            { cwd: finalPath, type: "directory" }
        );

        if (packageJsonResDir) {
            const packagePath = resolve.sync(pkgName, { basedir: packageJsonResDir });
            updateWorkspaceState(stateKey, packagePath);
            return packagePath;
        }

        // If no explicit package.json dep found, instead look for implicit dep
        const nodeModulesResDir = findUp.sync(
            (dir) => {
                if (fs.existsSync(path.join(dir, "node_modules", pkgName))) {
                    return dir;
                }

                if (this.isInternalTestRoot(dir)) {
                    return findUp.stop;
                }
            },
            { cwd: finalPath, type: "directory" }
        );

        if (nodeModulesResDir) {
            const packagePath = resolve.sync(pkgName, { basedir: nodeModulesResDir });
            updateWorkspaceState(stateKey, packagePath);
            return packagePath;
        }

        return;
    }
}
