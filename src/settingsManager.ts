import type { Disposable, ExtensionContext } from 'vscode';
import { workspace } from 'vscode';

import type { Logger } from './logging';
import { Resolver } from './resolver';

interface Settings {
  isEnabled: Readonly<boolean>;

  enableDebugLogs: Readonly<boolean>;

  useDaemons: Readonly<boolean>;

  daemonPathEslint: Readonly<string>;

  daemonPathPrettier: Readonly<string>;

  logger?: Logger;

  resolver?: Resolver;
}

export class SettingsManager implements Settings {
  public isEnabled: Readonly<boolean> = false;

  public enableDebugLogs: Readonly<boolean> = false;

  public useDaemons: Readonly<boolean> = true;

  public daemonPathEslint: Readonly<string> = '';

  public daemonPathPrettier: Readonly<string> = '';

  settingsWatcher: Disposable;

  private _logger?: Logger;

  resolver: Resolver | undefined;

  constructor() {
    this.settingsWatcher = workspace.onDidChangeConfiguration((event) => {
      // Check if a language configuration is changed for a text document
      if (event.affectsConfiguration('prettier-eslint-formatter')) {
        this.update();
      }
    });

    if (this.logger) this.resolver = new Resolver({ logger: this.logger });
  }

  // eslint-disable-next-line no-underscore-dangle
  public get logger() { return this._logger; }

  public set logger(value: Logger | undefined) {
    // eslint-disable-next-line no-underscore-dangle
    this._logger = value;
    if (value) this.resolver = new Resolver({ logger: value });
  }

  /** @description Updating all settings. */
  update = async () => {
    const settings = workspace.getConfiguration('prettier-eslint-formatter');

    this.logger?.logDebug('settings: ', settings);

    const isEnabled = Boolean(settings.get('isEnabled') ?? true);
    const enableDebugLogs = Boolean(settings.get('enableDebugLogs') ?? false);
    const useDaemons = Boolean(settings.get('useDaemons') ?? true);

    this.isEnabled = isEnabled;
    this.enableDebugLogs = enableDebugLogs;
    this.useDaemons = useDaemons;
  };

  /** @description Override a specific setting until the next `.update()` */
  set = <T extends keyof Settings>(key: T, value: Settings[T]) => {
    // @ts-expect-error I don't know how to fix this type error
    this[key] = value;
  };

  /** @description Adding the settingsWatcher to the context.subscriptions array. */
  activate = (context: ExtensionContext) => {
    context.subscriptions.push(this.settingsWatcher);
  };

  /** @description Removing the settingsWatcher from the context.subscriptions array. */
  deactivate = (context: ExtensionContext) => {
    context.subscriptions.splice(context.subscriptions.indexOf(this.settingsWatcher), 1);
  };
}
