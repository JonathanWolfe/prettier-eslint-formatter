import type {
  CancellationToken,
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  FormattingOptions,
  Range,
  TextDocument,
  TextEdit,
} from 'vscode';

import type { ExtensionFormattingOptions } from './types';

export class FormatterProvider implements DocumentRangeFormattingEditProvider, DocumentFormattingEditProvider {
  constructor(
    private provideEdits: (
      document: TextDocument,
      options: ExtensionFormattingOptions
    ) => Promise<TextEdit[]>,
  ) { }

  public provideDocumentRangeFormattingEdits = async (
    document: TextDocument,
    range: Range,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: FormattingOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ): Promise<TextEdit[]> => this.provideEdits(document, {
    rangeEnd: document.offsetAt(range.end),
    rangeStart: document.offsetAt(range.start),
    force: false,
  });

  public provideDocumentFormattingEdits = async (
    document: TextDocument,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: FormattingOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ): Promise<TextEdit[]> => this.provideEdits(document, {
    force: false,
  });
}
