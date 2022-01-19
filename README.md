# Prettier Eslint Formatter

Formats your file first through Prettier then with ESLint.

## Requirements
1. Your __workspace__ must have Prettier (`>= v1.13.0`) and ESLint (`>= 7.0.0`) installed.
   - Run `npm install -D eslint prettier` to do that


## Usage

Set this plugin as the default formatter for your filetype(s) in your workspace's or user `settings.json`

```json
{
   "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
   "[javascript]": {
       "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter"
   },
   "[javascriptreact]": {
       "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter"
   },
   "[typescript]": {
       "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter"
   },
   "[typescriptreact]": {
       "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter"
   },
   "[html]": {
       "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter"
   },
   "[vue]": {
       "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter"
   },
}
```

## FAQ

- *"Do I need the prettier extension installed too?"*
  - A: No
- *"Do I need the eslint extension installed too?"*
  - A: No, but you should anyway

## Prior Art
- Most of this extension is shamelessly lifted from the prettier-vscode plugin: <https://github.com/prettier/prettier-vscode>