import type * as prettier from "prettier";
import type * as eslint from "eslint";

type PrettierSupportLanguage = {
  vscodeLanguageIds?: string[];
  extensions?: string[];
  parsers: string[];
};
type PrettierFileInfoResult = {
  ignored: boolean;
  inferredParser?: PrettierBuiltInParserName | null;
};
type PrettierBuiltInParserName = string;
type PrettierResolveConfigOptions = prettier.ResolveConfigOptions;
type PrettierOptions = prettier.Options;
type PrettierFileInfoOptions = prettier.FileInfoOptions;

type PrettierModule = typeof prettier;
type ESLintModule = typeof eslint;


export type PackageManagers = "npm" | "yarn" | "pnpm";

/**
 * prettier-vscode specific configuration
 */
interface IExtensionConfig {
  /**
   * If true, take into account the .editorconfig file when resolving configuration.
   */
  useEditorConfig: boolean;
  /**
   * If true, this extension will attempt to use global npm or yarn modules.
   */
  resolveGlobalModules: boolean;
  /**
   * If true, this extension will process files in node_modules
   */
  withNodeModules: boolean;
  /**
   * Additional file patterns to register for formatting
   */
  documentSelectors: string[];
  /**
   * If true, this extension will be enabled
   */
  enable: boolean;
  /**
   * If true, enabled debug logs
   */
  enableDebugLogs: boolean;
}
/**
 * Configuration for prettier-vscode
 */
export type ExtensionVSCodeConfig = IExtensionConfig;

export interface RangeFormattingOptions {
  rangeStart: number;
  rangeEnd: number;
}

export interface ExtensionFormattingOptions {
  rangeStart?: number;
  rangeEnd?: number;
  force: boolean;
}
