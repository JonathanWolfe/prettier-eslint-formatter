// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ModuleResolver } from './copied/moduleResolver';
import { setGlobalState, setWorkspaceState } from './copied/stateUtils';
import formatter from './formatter';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	setGlobalState(context.globalState);
	setWorkspaceState(context.workspaceState);

	const moduleResolver = new ModuleResolver();

	const formattingProvider: vscode.DocumentRangeFormattingEditProvider = {
		async provideDocumentRangeFormattingEdits(document, range, options, token) {
			return formatter({ moduleResolver, document, range, options, token });
		},
	};

	const supportedLanguages = [
		"ansible",
		"graphql",
		"handlebars",
		"home-assistant",
		"html",
		"javascript",
		"javascriptreact",
		"json",
		"json5",
		"jsonc",
		"markdown",
		"mdx",
		"mongo",
		"typescript",
		"typescriptreact",
		"vue",
		"yaml",
	];

	supportedLanguages.forEach((language) => {
		vscode.languages.registerDocumentRangeFormattingEditProvider(language, formattingProvider);
	});
}

// this method is called when your extension is deactivated
export function deactivate() { }
