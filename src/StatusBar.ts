import { StatusBarAlignment, StatusBarItem, window } from "vscode";

export enum FormatterStatus {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Ready = "check-all",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Success = "check",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Ignore = "x",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Warn = "warning",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Error = "alert",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Disabled = "circle-slash",
}

export class StatusBar {
  private statusBarItem: StatusBarItem;
  constructor() {
    // Setup the statusBarItem
    this.statusBarItem = window.createStatusBarItem(
      "prettier-eslint-formatter.status",
      StatusBarAlignment.Right,
      -1
    );
    this.statusBarItem.name = "PEF";
    this.statusBarItem.text = "PEF";
    this.statusBarItem.command = "prettier-eslint-formatter.openOutput";
    this.update(FormatterStatus.Ready);
    this.statusBarItem.show();
  }

  /**
   * Update the statusBarItem message and show the statusBarItem
   *
   * @param icon The the icon to use
   */
  public update(result: FormatterStatus): void {
    this.statusBarItem.text = `$(${result.toString()}) PEF`;
    // Waiting for VS Code 1.53: https://github.com/microsoft/vscode/pull/116181
    // if (result === FormattingResult.Error) {
    //   this.statusBarItem.backgroundColor = new ThemeColor(
    //     "statusBarItem.errorBackground"
    //   );
    // } else {
    //   this.statusBarItem.backgroundColor = new ThemeColor(
    //     "statusBarItem.fourgroundBackground"
    //   );
    // }
    this.statusBarItem.show();
  }

  public hide() {
    this.statusBarItem.hide();
  }
}
