/**
 * Taken from prettier vs-code extension
 * https://github.com/prettier/prettier-vscode/blob/v9.1.0/src/ModuleResolver.ts
 */

import * as os from "os";
import * as path from "path";
import { Uri, workspace } from "vscode";
import { PrettierVSCodeConfig } from "./types";

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
