import {
  Disposable,
  DocumentFilter,
  languages,
  Range,
  TextDocument,
  TextEdit,
  TextEditor,
  Uri,
  window,
  workspace,
} from "vscode";
import { getParserFromLanguageId } from "./languageFilters";
import { LoggingService } from "./LoggingService";
import { RESTART_TO_ENABLE } from "./message";
import { PrettierEditProvider as EditProvider } from "./EditProvider";
import { FormatterStatus, StatusBar } from "./StatusBar";
import type {
  ExtensionFormattingOptions,
  PrettierBuiltInParserName,
  PrettierFileInfoResult,
  PrettierOptions,
  RangeFormattingOptions,
} from "./types";
import { getConfig } from "./util";
import type { ModuleResolver } from './ModuleResolver';

interface ISelectors {
  rangeLanguageSelector: ReadonlyArray<DocumentFilter>;
  languageSelector: ReadonlyArray<DocumentFilter>;
}

/**
 * Prettier reads configuration from files
 */
const PRETTIER_CONFIG_FILES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  "package.json",
  "prettier.config.js",
  "prettier.config.cjs",
  ".editorconfig",
] as const;
const ESLINT_CONFIG_FILES = [
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.json5",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintrc.toml",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  "package.json",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs",
] as const;
const COMBINED_CONFIG_FILES = Array.from(new Set([...PRETTIER_CONFIG_FILES, ...ESLINT_CONFIG_FILES]));

export default class PrettierEditService implements Disposable {
  private formatterHandler: undefined | Disposable;
  private rangeFormatterHandler: undefined | Disposable;
  private registeredWorkspaces = new Set<string>();

  private allLanguages: string[] = [];
  private allExtensions: string[] = [];
  private allRangeLanguages: string[] = [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "json",
    "graphql",
    "handlebars",
  ];

  constructor(
    private moduleResolver: ModuleResolver,
    private loggingService: LoggingService,
    private statusBar: StatusBar
  ) { }

  public registerDisposables(): Disposable[] {
    const packageWatcher = workspace.createFileSystemWatcher("**/package.json");
    packageWatcher.onDidChange(this.resetFormatters);
    packageWatcher.onDidCreate(this.resetFormatters);
    packageWatcher.onDidDelete(this.resetFormatters);

    const configurationWatcher = workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("prettier-eslint-formatter.enable")) {
        this.loggingService.logWarning(RESTART_TO_ENABLE);
      } else if (event.affectsConfiguration("prettier") || event.affectsConfiguration('eslint') || event.affectsConfiguration('prettier-eslint-formatter')) {
        this.resetFormatters();
      }
    });

    const prettierConfigWatcher = workspace.createFileSystemWatcher(
      `**/{${COMBINED_CONFIG_FILES.join(",")}}`
    );
    prettierConfigWatcher.onDidChange(this.configChanged);
    prettierConfigWatcher.onDidCreate(this.configChanged);
    prettierConfigWatcher.onDidDelete(this.configChanged);

    const textEditorChange = window.onDidChangeActiveTextEditor(
      this.handleActiveTextEditorChanged
    );

    this.handleActiveTextEditorChanged(window.activeTextEditor);

    return [
      packageWatcher,
      configurationWatcher,
      prettierConfigWatcher,
      textEditorChange,
    ];
  }

  public forceFormatDocument = async () => {
    try {
      const editor = window.activeTextEditor;
      if (!editor) {
        this.loggingService.logInfo(
          "No active document. Nothing was formatted."
        );
        return;
      }

      this.loggingService.logInfo(
        "Forced formatting will not use ignore files."
      );

      const edits = await this.provideEdits(editor.document, { force: true });
      if (edits.length !== 1) {
        return;
      }

      await editor.edit((editBuilder) => {
        editBuilder.replace(edits[0].range, edits[0].newText);
      });
    } catch (e) {
      this.loggingService.logError("Error formatting document", e);
    }
  };

  private configChanged = async (uri: Uri) => this.resetFormatters(uri);

  private resetFormatters = async (uri?: Uri) => {
    if (uri) {
      const workspaceFolder = workspace.getWorkspaceFolder(uri);
      this.registeredWorkspaces.delete(workspaceFolder?.uri.fsPath ?? "global");
    } else {
      // VS Code config change, reset everything
      this.registeredWorkspaces.clear();
    }
    this.statusBar.update(FormatterStatus.Ready);
  };

  private handleActiveTextEditorChanged = async (
    textEditor: TextEditor | undefined
  ) => {
    if (!textEditor) {
      this.statusBar.hide();
      return;
    }
    const { document } = textEditor;

    if (document.uri.scheme !== "file") {
      // We set as ready for untitled documents,
      // but return because these will always
      // use the global registered formatter.
      this.statusBar.update(FormatterStatus.Ready);
      return;
    }
    const workspaceFolder = workspace.getWorkspaceFolder(document.uri);

    if (!workspaceFolder) {
      // Do nothing, this is only for registering formatters in workspace folder.
      return;
    }

    const prettierInstance = await this.moduleResolver.getPrettierInstance(
      workspaceFolder.uri.fsPath
    );

    const eslintInstance = await this.moduleResolver.getESLintInstance(
      workspaceFolder.uri.fsPath
    );

    const isRegistered = this.registeredWorkspaces.has(
      workspaceFolder.uri.fsPath
    );

    // If there isn't an instance here, it is because the module
    // could not be loaded either locally or globably when specified
    if (!prettierInstance || !eslintInstance) {
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    const selectors = await this.getSelectors(
      prettierInstance,
      workspaceFolder.uri
    );

    if (!isRegistered) {
      this.registerDocumentFormatEditorProviders(selectors);
      this.registeredWorkspaces.add(workspaceFolder.uri.fsPath);
      this.loggingService.logDebug(
        `Enabling Prettier Eslint Formatter for Workspace ${workspaceFolder.uri.fsPath}`,
        selectors
      );
    }

    const score = languages.match(selectors.languageSelector, document);
    if (score > 0) {
      this.statusBar.update(FormatterStatus.Ready);
    } else {
      this.statusBar.update(FormatterStatus.Disabled);
    }
  };

  public dispose = () => {
    this.moduleResolver.dispose();
    this.formatterHandler?.dispose();
    this.rangeFormatterHandler?.dispose();
    this.formatterHandler = undefined;
    this.rangeFormatterHandler = undefined;
  };

  private registerDocumentFormatEditorProviders({
    languageSelector,
    rangeLanguageSelector,
  }: ISelectors) {
    this.dispose();
    const editProvider = new EditProvider(this.provideEdits);
    this.rangeFormatterHandler =
      languages.registerDocumentRangeFormattingEditProvider(
        rangeLanguageSelector,
        editProvider
      );
    this.formatterHandler = languages.registerDocumentFormattingEditProvider(
      languageSelector,
      editProvider
    );
  }

  /**
   * Build formatter selectors
   */
  private getSelectors = async (
    prettierInstance: typeof import('prettier'),
    uri?: Uri
  ): Promise<ISelectors> => {
    const { languages } = prettierInstance.getSupportInfo();

    languages.forEach((lang) => {
      if (lang && lang.vscodeLanguageIds) {
        this.allLanguages.push(...lang.vscodeLanguageIds);
      }
    });
    this.allLanguages = this.allLanguages.filter((value, index, self) => {
      return self.indexOf(value) === index;
    });

    languages.forEach((lang) => {
      if (lang && lang.extensions) {
        this.allExtensions.push(...lang.extensions);
      }
    });
    this.allExtensions = this.allExtensions.filter((value, index, self) => {
      return self.indexOf(value) === index;
    });

    const { documentSelectors } = getConfig();

    // Language selector for file extensions
    const extensionLanguageSelector: DocumentFilter[] = uri
      ? this.allExtensions.length === 0
        ? []
        : [
          {
            pattern: `${uri.fsPath}/**/*.{${this.allExtensions
              .map((e) => e.substring(1))
              .join(",")}}`,
            scheme: "file",
          },
        ]
      : [];

    const customLanguageSelectors: DocumentFilter[] = uri
      ? documentSelectors.map((pattern) => ({
        pattern: `${uri.fsPath}/${pattern}`,
        scheme: "file",
      }))
      : [];

    const defaultLanguageSelectors: DocumentFilter[] = [
      ...this.allLanguages.map((language) => ({ language })),
      { language: "jsonc", scheme: "vscode-userdata" }, // Selector for VSCode settings.json
    ];

    const languageSelector = [
      ...customLanguageSelectors,
      ...extensionLanguageSelector,
      ...defaultLanguageSelectors,
    ];

    const rangeLanguageSelector: DocumentFilter[] = [
      ...this.allRangeLanguages.map((language) => ({
        language,
      })),
    ];
    return { languageSelector, rangeLanguageSelector };
  };

  private provideEdits = async (
    document: TextDocument,
    options: ExtensionFormattingOptions
  ): Promise<TextEdit[]> => {
    const startTime = new Date().getTime();
    const result = await this.format(document.getText(), document, options);
    if (!result) {
      // No edits happened, return never so VS Code can try other formatters
      return [];
    }
    const duration = new Date().getTime() - startTime;
    this.loggingService.logInfo(
      `Formatting completed in ${duration / 1000}ms.`
    );
    return [TextEdit.replace(this.fullDocumentRange(document), result)];
  };

  /**
   * Format the given text with user's configuration.
   * @param text Text to format
   * @param path formatting file's path
   * @returns {string} formatted text
   */
  private async format(
    text: string,
    doc: TextDocument,
    options: ExtensionFormattingOptions
  ): Promise<string | undefined> {
    const { fileName, uri, languageId } = doc;

    this.loggingService.logInfo(`Formatting ${uri}`);

    const vscodeConfig = getConfig(uri);

    const resolvedConfig = await this.moduleResolver.getResolvedPrettierConfig(
      doc,
      vscodeConfig
    );
    if (resolvedConfig === "error") {
      this.statusBar.update(FormatterStatus.Error);
      return;
    }
    if (resolvedConfig === "disabled") {
      this.statusBar.update(FormatterStatus.Disabled);
      return;
    }

    const prettierInstance = await this.moduleResolver.getPrettierInstance(
      fileName
    );

    if (!prettierInstance) {
      this.loggingService.logError(
        "Prettier could not be loaded. See previous logs for more information."
      );
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const eslintInstance = await this.moduleResolver.getESLintInstance(
      fileName
    );

    if (!eslintInstance) {
      this.loggingService.logError(
        "ESLint could not be loaded. See previous logs for more information."
      );
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    let fileInfo: PrettierFileInfoResult | undefined;
    if (fileName) {
      fileInfo = await prettierInstance.getFileInfo(fileName, {
        resolveConfig: true,
        withNodeModules: vscodeConfig.withNodeModules,
      });
      this.loggingService.logInfo("File Info:", fileInfo);
    }

    if (!options.force && fileInfo && fileInfo.ignored) {
      this.loggingService.logInfo("File is ignored, skipping.");
      this.statusBar.update(FormatterStatus.Ignore);
      return;
    }

    let parser: PrettierBuiltInParserName | string | undefined;
    if (fileInfo && fileInfo.inferredParser) {
      parser = fileInfo.inferredParser;
    } else if (languageId !== "plaintext") {
      // Don't attempt VS Code language for plaintext because we never have
      // a formatter for plaintext and most likely the reason for this is
      // somebody has registered a custom file extension without properly
      // configuring the parser in their prettier config.
      this.loggingService.logWarning(
        `Parser not inferred, trying VS Code language.`
      );
      const languages = prettierInstance.getSupportInfo().languages;
      parser = getParserFromLanguageId(languages, uri, languageId);
    }

    if (!parser) {
      this.loggingService.logError(
        `Failed to resolve a parser, skipping file. If you registered a custom file extension, be sure to configure the parser.`
      );
      this.statusBar.update(FormatterStatus.Error);
      return;
    }

    const prettierOptions = this.getPrettierOptions(
      fileName,
      parser as PrettierBuiltInParserName,
      {},
      resolvedConfig,
      options
    );

    this.loggingService.logDebug("Prettier Options:", prettierOptions);

    try {
      const prettied = prettierInstance.format(text, prettierOptions);

      const eslintService = new eslintInstance.ESLint({
        fix: true,
        fixTypes: ['layout', 'problem', 'suggestion'],
      });

      const eslintConfig = await eslintService.calculateConfigForFile(fileName);

      this.loggingService.logDebug("ESLint Options:", eslintConfig);

      const [eslinted] = await eslintService.lintText(prettied || text, { filePath: fileName, warnIgnored: false });

      this.loggingService.logDebug("ESLint Resp:", eslinted);
      const formattedText = eslinted?.output || eslinted?.source || text;

      this.statusBar.update(FormatterStatus.Success);

      return formattedText;
    } catch (error) {
      this.loggingService.logError("Error formatting document.", error);
      this.statusBar.update(FormatterStatus.Error);

      return text;
    }
  }

  private getPrettierOptions(
    fileName: string,
    parser: PrettierBuiltInParserName,
    vsCodeConfig: PrettierOptions,
    configOptions: PrettierOptions | null,
    extentionFormattingOptions: ExtensionFormattingOptions
  ): Partial<PrettierOptions> {
    let rangeFormattingOptions: RangeFormattingOptions | undefined;
    if (
      extentionFormattingOptions.rangeEnd &&
      extentionFormattingOptions.rangeStart
    ) {
      rangeFormattingOptions = {
        rangeEnd: extentionFormattingOptions.rangeEnd,
        rangeStart: extentionFormattingOptions.rangeStart,
      };
    }

    const options: PrettierOptions = {
      ...{
        /* cspell: disable-next-line */
        filepath: fileName,
        parser: parser as PrettierBuiltInParserName,
      },
      ...(rangeFormattingOptions || {}),
      ...(configOptions || {}),
    };

    if (extentionFormattingOptions.force && options.requirePragma === true) {
      options.requirePragma = false;
    }

    return options;
  }

  private fullDocumentRange(document: TextDocument): Range {
    const lastLineId = document.lineCount - 1;
    return new Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length);
  }
}