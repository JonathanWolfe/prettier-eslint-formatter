import type { ExtensionContext } from 'vscode';
import { commands } from 'vscode';

import { FormatterService } from './formatterService';
import { Logger } from './logging';
import { SettingsManager } from './settingsManager';
import { StatusBar } from './statusBar';

/**
 * Initializes the extension
 * @param {ExtensionContext} context - ExtensionContext - This is the context of the extension. It's
 * used to register commands and subscriptions.
 */
export async function activate(context: ExtensionContext) {
  const statusBar = new StatusBar();
  const settingsManager = new SettingsManager();
  const logger = new Logger({ settingsManager, statusBar });

  logger.logInfo('Starting up');

  settingsManager.logger = logger;

  logger.logInfo('activating settings manager');

  settingsManager.activate(context);
  await settingsManager.update();

  const formatterService = new FormatterService({ settingsManager, statusBar, logger });

  logger.logInfo('Registering commands');

  const openOutputCommand = commands.registerCommand(
    'prettier-eslint-formatter.openOutput',
    () => {
      logger.show();
    },
  );

  const forceFormatDocumentCommand = commands.registerCommand(
    'prettier-eslint-formatter.forceFormatDocument',
    formatterService.forceFormatDocument,
  );

  const restartDaemonsCommand = commands.registerCommand(
    'prettier-eslint-formatter.restartDaemons',
    async () => {
      if (settingsManager.useDaemons) {
        if (settingsManager.daemonPathEslint || settingsManager.daemonPathPrettier) {
          await formatterService.resolver.setupDaemons(settingsManager);
        }

        await formatterService.resolver.restartDaemons(settingsManager);
      }
    },
  );

  logger.logInfo('Settings subscriptions');

  context.subscriptions.push(
    formatterService,
    openOutputCommand,
    forceFormatDocumentCommand,
    restartDaemonsCommand,
    ...formatterService.registerDisposables(),
  );
}
