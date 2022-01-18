import type { CancellationToken, FormattingOptions, ProviderResult, TextDocument } from 'vscode';
import { TextEdit, Range } from 'vscode';

import loggingService from './copied/LoggingService';
import type { ModuleResolver } from './copied/moduleResolver';

export interface FormatterArgs {
    document: TextDocument,
    moduleResolver: ModuleResolver,
    range?: Range,
    token?: CancellationToken;
    options?: FormattingOptions,
}
export default async function formatter(args: FormatterArgs): Promise<ProviderResult<TextEdit[]>> {
    if (!args.range) {
        const firstLine = args.document.lineAt(0);
        const lastLine = args.document.lineAt(args.document.lineCount - 1);

        args.range = new Range(firstLine.range.start, lastLine.range.end);
    }

    try {
        const text = args.document.getText(args.range);
        const formatted = await format({
            text,
            filePath: args.document.fileName,
            moduleResolver: args.moduleResolver,
        });

        return [TextEdit.replace(args.range, formatted)];
    } catch (err) {
        loggingService.logError(`Error: ${(err as Error).message}`);
    }
};

export interface FormatArgs {
    text: string,
    filePath: string,
    moduleResolver: ModuleResolver,
}
export async function format(args: FormatArgs): Promise<string> {
    loggingService.logDebug('filePath', args.filePath);
    loggingService.logDebug('text', args.text);

    let prettiered = '';

    const prettier = await args.moduleResolver.getPrettierInstance(args.filePath);

    if (prettier) {
        loggingService.logDebug('starting prettier');

        const prettierConfig = (await prettier.resolveConfig(args.filePath)) || {};

        prettierConfig.filepath = args.filePath;

        prettiered = prettier.format(args.text, prettierConfig);

        loggingService.logDebug('prettierOutput', prettiered);
    }

    const eslint = await args.moduleResolver.getESLintInstance(args.filePath);

    if (eslint) {
        loggingService.logDebug('staring eslint');

        const eslintInstance = new eslint.ESLint({ cwd: args.filePath, fix: true, fixTypes: ['layout', 'problem', 'suggestion'] });

        const [eslinted] = await eslintInstance.lintText(prettiered || args.text, { warnIgnored: false });

        loggingService.logDebug('eslintOutput', eslinted);

        return eslinted?.output || eslinted?.source || args.text;
    }

    return args.text;
}