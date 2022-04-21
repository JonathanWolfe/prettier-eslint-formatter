import type { StatusBarItem } from 'vscode';
import { ThemeColor, StatusBarAlignment, window } from 'vscode';

export enum FormatterStatus {
  Ready = 'run',
  Success = 'check',
  Ignore = 'x',
  Warn = 'warning',
  Error = 'alert',
  Disabled = 'circle-slash',
}

export class StatusBar {
  private statusBarItem: StatusBarItem;

  constructor() {
    // Setup the statusBarItem
    this.statusBarItem = window.createStatusBarItem(
      'prettier-eslint-formatter.status',
      StatusBarAlignment.Right,
      -1,
    );
    this.statusBarItem.name = 'PEF';
    this.statusBarItem.text = 'PEF';
    this.statusBarItem.command = 'prettier-eslint-formatter.openOutput';
    this.update(FormatterStatus.Ready);
    this.statusBarItem.show();
  }

  /**
   * Update the statusBarItem message and show the statusBarItem
   */
  public update(result: FormatterStatus): void {
    this.statusBarItem.text = `$(${result.toString()}) PEF`;
    if (result === FormatterStatus.Error) {
      this.statusBarItem.backgroundColor = new ThemeColor(
        'statusBarItem.errorBackground',
      );
    } else {
      this.statusBarItem.backgroundColor = new ThemeColor(
        'statusBarItem.fourgroundBackground',
      );
    }
    this.statusBarItem.show();
  }

  public hide() {
    this.statusBarItem.hide();
  }
}
