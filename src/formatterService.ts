import type {
  Disposable,
  DocumentFilter,
  TextDocument,
  TextEditor,
} from 'vscode';

import path from 'path';
import {
  languages,
  Range,
  TextEdit,
  window,
  workspace,
} from 'vscode';

import type { Logger } from './logging';
import type { SettingsManager } from './settingsManager';
import type { StatusBar } from './statusBar';
import { FormatterProvider } from './formatterProvider';
import { Resolver } from './resolver';
import { FormatterStatus } from './statusBar';
import { doESLint, doPrettier } from './formatter';

interface ISelectors {
  rangeLanguageSelector: ReadonlyArray<DocumentFilter>;
  languageSelector: ReadonlyArray<DocumentFilter>;
}

export class FormatterService implements Disposable {
  private formatterHandler: undefined | Disposable;

  private rangeFormatterHandler: undefined | Disposable;

  private registeredWorkspaces = new Set<string>();

  private settingsManager: SettingsManager;

  private logger: Logger;

  statusBar: StatusBar;

  resolver: Resolver;

  constructor(props: { settingsManager: SettingsManager, statusBar: StatusBar, logger: Logger; }) {
    this.settingsManager = props.settingsManager;
    this.statusBar = props.statusBar;
    this.logger = props.logger;

    this.resolver = new Resolver({ logger: props.logger });
  }

  /** @description Registering the `handleActiveTextEditorChanged` function to be called when the active text editor changes. */
  public registerDisposables = (): Disposable[] => {
    const textEditorChange = window.onDidChangeActiveTextEditor(
      this.handleActiveTextEditorChanged,
    );

    this.handleActiveTextEditorChanged(window.activeTextEditor);

    return [
      textEditorChange,
    ];
  };

  /** @description Registering the document editor providers for the workspace. */
  private handleActiveTextEditorChanged = async (textEditor: TextEditor | undefined) => {
    if (!textEditor) return;

    const { document } = textEditor;

    // We set as ready for untitled documents,
    // but return because these will always
    // use the global registered formatter.
    if (document.uri.scheme !== 'file') {
      // this.logger.logError('Cannot operate on un-saved files');
      return;
    }

    const workspaceFolder = workspace.getWorkspaceFolder(document.uri);

    // Do nothing, this is only for registering formatters in workspace folder.
    if (!workspaceFolder) {
      this.logger.logError('How did you get here?');
      return;
    }

    const isRegistered = this.registeredWorkspaces.has(workspaceFolder.uri.fsPath);

    if (!isRegistered) {
      this.logger.logDebug('Registering document editor providers');

      this.registerDocumentFormatEditorProviders({
        languageSelector: [
          { language: 'javascript' },
          { language: 'javascriptreact' },
          { language: 'typescript' },
          { language: 'typescriptreact' },
        ],
        rangeLanguageSelector: [
          { language: 'javascript' },
          { language: 'javascriptreact' },
          { language: 'typescript' },
          { language: 'typescriptreact' },
        ],
      });

      this.registeredWorkspaces.add(workspaceFolder.uri.fsPath);

      this.logger.logDebug(
        `Enabling for Workspace ${workspaceFolder.uri.fsPath}`,
      );
    }
  };

  /** @description Disposing the formatterHandler and rangeFormatterHandler. */
  public dispose = () => {
    this.formatterHandler?.dispose();
    this.rangeFormatterHandler?.dispose();
    this.formatterHandler = undefined;
    this.rangeFormatterHandler = undefined;
  };

  /** @description Registering the document editor providers for the workspace. */
  private registerDocumentFormatEditorProviders = ({ languageSelector, rangeLanguageSelector }: ISelectors) => {
    this.dispose();

    const editProvider = new FormatterProvider(this.provideEdits);

    this.rangeFormatterHandler = languages.registerDocumentRangeFormattingEditProvider(
      rangeLanguageSelector,
      editProvider,
    );

    this.formatterHandler = languages.registerDocumentFormattingEditProvider(
      languageSelector,
      editProvider,
    );
  };

  /** @description A function that is called when the user wants to format a document. */
  private provideEdits = async (document: TextDocument): Promise<TextEdit[]> => {
    // No edits happened, return never so VS Code can try other formatters
    if (!this.settingsManager.isEnabled) {
      this.logger.logInfo('PEF is not enabled');
      this.statusBar.update(FormatterStatus.Disabled);
      return [];
    }

    const startTime = new Date().getTime();

    const result = await this.format(document.getText(), document);

    if (!result) {
      // No edits happened, return never so VS Code can try other formatters
      this.statusBar.update(FormatterStatus.Error);
      return [];
    }

    const duration = new Date().getTime() - startTime;

    this.logger.logInfo(`Formatting completed in ${duration / 1000}ms.`);

    this.statusBar.update(FormatterStatus.Success);

    return [TextEdit.replace(this.fullDocumentRange(document), result)];
  };

  /** @description Format the given text with user's configuration. */
  private format = async (text: string, doc: TextDocument): Promise<string | undefined> => {
    const { fileName, uri } = doc;

    const cwd = path.dirname(fileName);

    this.logger.logInfo(`Formatting ${uri}`);

    let prettier = '';
    let eslint = '';

    if (this.settingsManager.useDaemons) {
      if (!this.settingsManager.daemonPathEslint || !this.settingsManager.daemonPathPrettier) {
        await this.resolver.setupDaemons(this.settingsManager, cwd);
      }

      /* TODO: Get prettierd fixed so it correctly parses cli args */
      prettier = this.settingsManager.daemonPathPrettier;
      eslint = this.settingsManager.daemonPathEslint;
    }

    if (!prettier) prettier = await this.resolver.find('prettier', cwd);
    if (!eslint) eslint = await this.resolver.find('eslint', cwd);

    if (!prettier) {
      this.logger.logError(
        'Prettier could not be loaded. See previous logs for more information.',
      );
      return text;
    }

    if (!eslint) {
      this.logger.logError(
        'ESLint could not be loaded. See previous logs for more information.',
      );
      return text;
    }

    this.logger.logDebug('prettier path: ', prettier);
    this.logger.logDebug('eslint path: ', eslint);

    try {
      const prettied = await doPrettier({
        cwd,
        fileName,
        text,
        bin: prettier,
        isDaemon: this.settingsManager.useDaemons,
        logger: this.logger,
      });

      const eslinted = await doESLint({
        cwd,
        fileName,
        text: prettied,
        bin: eslint,
        isDaemon: this.settingsManager.useDaemons,
        logger: this.logger,
      });

      return eslinted || prettied || text;
    } catch (error) {
      this.logger.logError('Error formatting document.', error);

      return text;
    }
  };

  /** @description Getting the range of the document. */
  private fullDocumentRange = (document: TextDocument): Range => {
    const lastLineId = document.lineCount - 1;
    return new Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length);
  };

  /** @description Forces a document to be formatted by us */
  public forceFormatDocument = async () => {
    try {
      const editor = window.activeTextEditor;
      if (!editor) {
        this.logger.logInfo(
          'No active document. Nothing was formatted.',
        );
        return;
      }

      const edits = await this.provideEdits(editor.document);

      if (edits.length !== 1) return;

      await editor.edit((editBuilder) => {
        editBuilder.replace(edits[0]!.range, edits[0]!.newText);
      });

      this.statusBar.update(FormatterStatus.Success);
    } catch (err) {
      this.logger.logError('Error formatting document', err);
    }
  };
}
