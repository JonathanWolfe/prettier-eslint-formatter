import { execSync } from "child_process";
import * as findUp from "find-up";
import * as fs from "fs";
import * as path from "path";

import resolve from "resolve";

import { commands, TextDocument, workspace } from "vscode";

import { resolveGlobalNodePath, resolveGlobalYarnPath } from "./Files";
import { LoggingService } from "./LoggingService";
import {
  FAILED_TO_LOAD_ESLINT_MODULE_MESSAGE,
  FAILED_TO_LOAD_PRETTIER_MODULE_MESSAGE,
  INVALID_ESLINT_PATH_MESSAGE,
  INVALID_PRETTIER_CONFIG,
  INVALID_PRETTIER_PATH_MESSAGE,
  OUTDATED_ESLINT_VERSION_MESSAGE,
  OUTDATED_PRETTIER_VERSION_MESSAGE,
} from "./message";
import { getFromWorkspaceState, updateWorkspaceState } from "./stateUtils";
import type {
  PackageManagers,
  PrettierOptions,
  PrettierResolveConfigOptions,
  ExtensionVSCodeConfig,
  PrettierModule,
  ESLintModule,
} from "./types";

const minPrettierVersion = "1.13.0";
const minESLintVersion = "7.0.0";

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __webpack_require__: typeof require;
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __non_webpack_require__: typeof require;


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

export class ModuleResolver {
  public prettierPath2Module = new Map<string, PrettierModule>();
  public eslintPath2Module = new Map<string, ESLintModule>();

  constructor(private loggingService: LoggingService) { }

  public moduleToRoot(path: string) {
    return path.substring(0, path.lastIndexOf('node_modules') - 1);
  }

  public getEslintPathForInstance(instance: ESLintModule): string {
    if (!instance) {
      return '';
    }

    const keys = Array.from(this.eslintPath2Module.keys());

    for (const key of keys) {
      const instancePath = this.eslintPath2Module.get(key);

      if (instancePath === instance) {
        return this.moduleToRoot(key);
      }
    }

    return '';
  }

  /**
   * Returns an instance of the prettier module.
   * @param fileName The path of the file to use as the starting point. If none provided, the bundled prettier will be used.
   */
  public async getPrettierInstance(
    fileName: string
  ): Promise<PrettierModule | undefined> {
    if (!workspace.isTrusted) {
      this.loggingService.logError('UNTRUSTED WORKSPACE');
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

      this.loggingService.logInfo(
        `Attempted to load Prettier module from ${modulePath || moduleDirectory || "package.json"}`
      );
      this.loggingService.logError(FAILED_TO_LOAD_PRETTIER_MODULE_MESSAGE, error);

      // Return here because there is a local module, but we can't resolve it.
      // Must do NPM install for prettier to work.
      return undefined;
    }

    // If global modules allowed, look for global module
    if (!modulePath) {
      const packageManager = (await commands.executeCommand<PackageManagers>("npm.packageManager"))!;
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

    let moduleInstance: PrettierModule | undefined = undefined;
    if (modulePath !== undefined) {
      // First check module cache
      moduleInstance = this.prettierPath2Module.get(modulePath);
      if (moduleInstance) {
        return moduleInstance;
      } else {
        try {
          moduleInstance = this.loadNodeModule<PrettierModule>(modulePath);
          if (moduleInstance) {
            this.prettierPath2Module.set(modulePath, moduleInstance);
          }
        } catch (error) {
          this.loggingService.logInfo(
            `Attempted to load Prettier module from ${modulePath || "package.json"}`
          );
          this.loggingService.logError(FAILED_TO_LOAD_PRETTIER_MODULE_MESSAGE, error);

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
        this.loggingService.logError(INVALID_PRETTIER_PATH_MESSAGE);
        return undefined;
      }

      if (!isValidVersion) {
        this.loggingService.logInfo(
          `Attempted to load Prettier module from ${modulePath}`
        );
        this.loggingService.logError(OUTDATED_PRETTIER_VERSION_MESSAGE);
        return undefined;
      }
      return moduleInstance;
    }

    return undefined;
  }

  /**
   * Returns an instance of the ESLint module.
   * @param fileName The path of the file to use as the starting point. If none provided, the bundled ESLint will be used.
   */
  public async getESLintInstance(
    fileName: string
  ): Promise<ESLintModule | undefined> {
    if (!workspace.isTrusted) {
      this.loggingService.logDebug('UNTRUSTED WORKSPACE');
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

      this.loggingService.logInfo(
        `Attempted to load ESLint module from ${modulePath || moduleDirectory || "package.json"}`
      );
      this.loggingService.logError(FAILED_TO_LOAD_ESLINT_MODULE_MESSAGE, error);

      // Return here because there is a local module, but we can't resolve it.
      // Must do NPM install for ESLint to work.
      return undefined;
    }

    // If global modules allowed, look for global module
    if (!modulePath) {
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

    let moduleInstance: ESLintModule | undefined = undefined;
    if (modulePath !== undefined) {
      // First check module cache
      moduleInstance = this.eslintPath2Module.get(modulePath);
      if (moduleInstance) {
        return moduleInstance;
      } else {
        try {
          moduleInstance = this.loadNodeModule<ESLintModule>(modulePath);
          if (moduleInstance) {
            this.eslintPath2Module.set(modulePath, moduleInstance);
          }
        } catch (error) {
          this.loggingService.logInfo(
            `Attempted to load ESLint module from ${modulePath || "package.json"}`
          );
          this.loggingService.logError(FAILED_TO_LOAD_PRETTIER_MODULE_MESSAGE, error);

          // Returning here because module didn't load.
          return undefined;
        }
      }
    }

    if (moduleInstance) {
      // If the instance is missing `format`, it's probably
      // not an instance of ESLint
      const isESLintInstance = !!moduleInstance.ESLint.outputFixes;
      const isValidVersion =
        moduleInstance.ESLint.version &&
        parseFloat(moduleInstance.ESLint.version) >= parseFloat(minESLintVersion);

      if (!isESLintInstance) {
        this.loggingService.logError(INVALID_ESLINT_PATH_MESSAGE, moduleInstance);
        return undefined;
      }

      if (!isValidVersion) {
        this.loggingService.logInfo(
          `Attempted to load ESLint module from ${modulePath}`
        );
        this.loggingService.logError(OUTDATED_ESLINT_VERSION_MESSAGE);
        return undefined;
      }

      this.loggingService.logDebug('eslint instance', moduleInstance);
      return moduleInstance;
    }

    return undefined;
  }

  public async getResolvedPrettierConfig(
    { fileName, uri }: TextDocument,
    vscodeConfig: ExtensionVSCodeConfig
  ): Promise<"error" | "disabled" | PrettierOptions | null> {
    const isVirtual = uri.scheme !== "file";
    const prettier = await this.getPrettierInstance(fileName);

    let configPath: string | undefined;
    try {
      if (!isVirtual) {
        configPath = (await prettier?.resolveConfigFile(fileName)) ?? undefined;
      }
    } catch (error) {
      this.loggingService.logError(
        `Error resolving prettier configuration for ${fileName}`,
        error
      );

      return "error";
    }

    const resolveConfigOptions: PrettierResolveConfigOptions = {
      config: isVirtual ? undefined : configPath,
      editorconfig: isVirtual ? undefined : vscodeConfig.useEditorConfig,
    };

    let resolvedConfig: PrettierOptions | null | undefined;
    try {
      resolvedConfig = isVirtual
        ? null
        : await prettier?.resolveConfig(fileName, resolveConfigOptions);
    } catch (error) {
      this.loggingService.logError(
        "Invalid prettier configuration file detected.",
        error
      );
      this.loggingService.logError(INVALID_PRETTIER_CONFIG);

      return "error";
    }
    if (resolveConfigOptions.config) {
      this.loggingService.logInfo(
        `Using config file at '${resolveConfigOptions.config}'`
      );
    }

    if (!isVirtual && !resolvedConfig) {
      this.loggingService.logInfo(
        "Require config set to true and no config present. Skipping file."
      );
      return "disabled";
    }

    return resolvedConfig || null;
  }

  /**
   * Clears the module and config cache
   */
  public async dispose() {
    this.prettierPath2Module.forEach((module) => {
      try {
        module.clearConfigCache();
      } catch (error) {
        this.loggingService.logError("Error clearing module cache.", error);
      }
    });

    this.prettierPath2Module.clear();
    this.eslintPath2Module.clear();
  }

  // Source: https://github.com/microsoft/vscode-eslint/blob/master/server/src/eslintServer.ts
  private loadNodeModule<T>(moduleName: string): T | undefined {
    const origCWD = process.cwd();

    const r =
      typeof __webpack_require__ === "function"
        ? __non_webpack_require__
        : require;

    try {
      process.chdir(this.moduleToRoot(moduleName));
      const instance = r(moduleName);
      process.chdir(origCWD);

      return instance;
    } catch (error) {
      process.chdir(origCWD);
      this.loggingService.logError(
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
            (
              (
                packageJson.dependencies &&
                packageJson.dependencies[pkgName]
              )
              ||
              (
                packageJson.devDependencies &&
                packageJson.devDependencies[pkgName]
              )
            )
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
