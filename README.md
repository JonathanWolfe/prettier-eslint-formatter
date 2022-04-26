# Prettier Eslint Formatter

Formats your file first through Prettier then with ESLint.

## Requirements

1. You must have Prettier (`>= v1.13.0`) and ESLint (`>= v4.0.0`) installed (either locally in your project, or globally).

## 3rd Party Tools Used
1. `eslint_d`
    - <https://www.npmjs.com/package/eslint_d>
    - When the `useDaemons` option is turned on, this massively speeds up subsequent invocations of ESLint
2. `@fsouza/prettierd`
    - <https://www.npmjs.com/package/@fsouza/prettierd>
    - When the `useDaemons` option is turned on, this massively speeds up subsequent invocations of Prettier

## Usage

Set this plugin as the default formatter for your filetype(s) in your workspace's or user `settings.json`. Disable the eslint source action (`source.fixAll.eslint`) on `editor.codeActionsOnSave` so that the ESLint vscode plugin does not format your file twice.

```json
{
  "[javascript]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": false
    }
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": false
    }
  },
  "[typescript]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": false
    }
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": false
    }
  }
}
```

## FAQ

- _"Do I need the prettier extension installed too?"_
  - A: No, unless you want to use prettier by itself for some files (additional configuration like the provided example will need to be used)
- _"Do I need the eslint extension installed too?"_
  - A: No, but you should anyway
- _"Can I set options for prettier or eslint like in their respective plugins?"_
  - A: No, use config files like normal humans please. 👽
- _"Sometimes it doesn't work?"_
  - A: You might need to restart your vscode editor (`> Developer: Reload Window` in the command pallete). If the issue continues, then contact me.

## Prior Art

- Most of this extension is shamelessly lifted from the prettier-vscode plugin: <https://github.com/prettier/prettier-vscode>
