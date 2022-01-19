import { commands, ExtensionContext, workspace } from "vscode";
import { LoggingService } from "./LoggingService";
import { ModuleResolver } from "./ModuleResolver";
import EditService from "./EditService";
import { StatusBar } from "./StatusBar";
import { getConfig } from "./util";
import { RESTART_TO_ENABLE, EXTENSION_DISABLED } from "./message";
import { setGlobalState, setWorkspaceState } from "./stateUtils";

export function activate(context: ExtensionContext) {
  const loggingService = new LoggingService();

  const { enable, enableDebugLogs } = getConfig();

  if (enableDebugLogs) {
    loggingService.setOutputLevel("DEBUG");
  }

  if (!enable) {
    loggingService.logInfo(EXTENSION_DISABLED);
    context.subscriptions.push(
      workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("prettier-eslint-formatter.enable")) {
          loggingService.logWarning(RESTART_TO_ENABLE);
        }
      })
    );
    return;
  }

  setGlobalState(context.globalState);
  setWorkspaceState(context.workspaceState);

  const moduleResolver = new ModuleResolver(loggingService);

  const statusBar = new StatusBar();

  const editService = new EditService(
    moduleResolver,
    loggingService,
    statusBar
  );

  const openOutputCommand = commands.registerCommand(
    "prettier-eslint-formatter.openOutput",
    () => {
      loggingService.show();
    }
  );
  const forceFormatDocumentCommand = commands.registerCommand(
    "prettier-eslint-formatter.forceFormatDocument",
    editService.forceFormatDocument
  );

  context.subscriptions.push(
    editService,
    openOutputCommand,
    forceFormatDocumentCommand,
    ...editService.registerDisposables()
  );
}
