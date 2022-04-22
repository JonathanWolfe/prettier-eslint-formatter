import { window } from 'vscode';
import type { SettingsManager } from './settingsManager';
import type { StatusBar } from './statusBar';
import { FormatterStatus } from './statusBar';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE';

export class Logger {
  private outputChannel = window.createOutputChannel('Prettier ESLint Formatter');

  private settingsManager: SettingsManager;

  statusBar: StatusBar;

  constructor(props: { settingsManager: SettingsManager; statusBar: StatusBar; }) {
    this.settingsManager = props.settingsManager;
    this.statusBar = props.statusBar;
  }

  public logLevel = (): LogLevel => (this.settingsManager.enableDebugLogs ? 'DEBUG' : 'WARN');

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param {string} message The message to append to the output channel
   */
  public logDebug = (message: string, data?: unknown): void => {
    if (
      this.logLevel() === 'NONE'
      || this.logLevel() === 'INFO'
      || this.logLevel() === 'WARN'
      || this.logLevel() === 'ERROR'
    ) {
      return;
    }

    this.logMessage(message, 'DEBUG');

    if (data) {
      this.logObject(data);
    }
  };

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param {string} message The message to append to the output channel
   */
  public logInfo = (message: string, data?: unknown): void => {
    if (
      this.logLevel() === 'NONE'
      || this.logLevel() === 'WARN'
      || this.logLevel() === 'ERROR'
    ) {
      return;
    }

    this.logMessage(message, 'INFO');

    if (data) {
      this.logObject(data);
    }
  };

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param {string} message The message to append to the output channel
   */
  public logWarning = (message: string, data?: unknown): void => {
    if (this.logLevel() === 'NONE' || this.logLevel() === 'ERROR') {
      return;
    }

    this.statusBar.update(FormatterStatus.Warn);

    this.logMessage(message, 'WARN');

    if (data) {
      this.logObject(data);
    }
  };

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param {string} message The message to append to the output channel
   * @param {Error} [error] Error object to be logged
   */
  public logError = (message: string, error?: unknown) => {
    if (this.logLevel() === 'NONE') {
      return;
    }

    this.statusBar.update(FormatterStatus.Error);

    this.logMessage(message, 'ERROR');

    if (typeof error === 'string') {
      // Errors as a string usually only happen with
      // plugins that don't return the expected error.
      this.outputChannel.appendLine(error);
    } else if (error instanceof Error) {
      if (error?.message) {
        this.logMessage(error.message, 'ERROR');
      }

      if (error?.stack) {
        this.outputChannel.appendLine(error.stack);
      }
    } else if (error) {
      this.logObject(error);
    }
  };

  /** @description Shows the output channel. */
  public show = () => {
    this.outputChannel.show();
  };

  private logObject = (data: unknown): void => {
    // const message = JSON.parser
    //   .format(JSON.stringify(data, null, 2), {
    //     parser: "json",
    //   })
    //   .trim();
    const message = JSON.stringify(data, null, 2); // dont use prettrer to keep it simple

    this.outputChannel.appendLine(message);
  };

  /**
   * Append messages to the output channel and format it with a title
   *
   * @param {string} message The message to append to the output channel
   */
  private logMessage = (message: string, level: LogLevel): void => {
    const title = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`["${level}" - ${title}] ${message}`);
  };
}
