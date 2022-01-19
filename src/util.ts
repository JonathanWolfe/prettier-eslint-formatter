import * as os from "os";
import * as path from "path";
import { Uri, workspace } from "vscode";
import type { ExtensionVSCodeConfig } from "./types";

export function getWorkspaceRelativePath(
  filePath: string,
  pathToResolve: string
) {
  // In case the user wants to use ~/.prettierrc on Mac
  if (
    process.platform === "darwin" &&
    pathToResolve.indexOf("~") === 0 &&
    os.homedir()
  ) {
    return pathToResolve.replace(/^~(?=$|\/|\\)/, os.homedir());
  }

  if (workspace.workspaceFolders) {
    const folder = workspace.getWorkspaceFolder(Uri.file(filePath));
    return folder
      ? path.isAbsolute(pathToResolve)
        ? pathToResolve
        : path.join(folder.uri.fsPath, pathToResolve)
      : undefined;
  }
}

export function getConfig(uri?: Uri): ExtensionVSCodeConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = workspace.getConfiguration(
    "prettier-eslint-formatter",
    uri
  ) as unknown as ExtensionVSCodeConfig;

  // Some settings are disabled for untrusted workspaces
  // because they can be used for bad things.
  if (!workspace.isTrusted) {
    const newConfig = {
      ...config,
      documentSelectors: [],
      useEditorConfig: false,
      withNodeModules: false,
      resolveGlobalModules: false,
    };
    return newConfig;
  }

  return config;
}
