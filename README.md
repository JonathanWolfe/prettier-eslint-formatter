# Prettier Eslint Formatter

Formats your file first through Prettier then with ESLint.

## Requirements

1. You must have Prettier (`>= v1.13.0`) and ESLint (`>= v7.0.0`) installed (either locally in your project, or globally).

## Usage

Set this plugin as the default formatter for your filetype(s) in your workspace's or user `settings.json`. Disable `editor.codeActionsOnSave` so that the eslint vscode plugin does not format your file twice. (If you find a better way of disabling eslint's code action please let me know!)

```json
{
  "[javascript]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll": false
    }
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll": false
    }
  },
  "[typescript]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll": false
    }
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll": false
    }
  },
  "[html]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll": false
    }
  },
  "[vue]": {
    "editor.defaultFormatter": "jonwolfe.prettier-eslint-formatter",
    "editor.codeActionsOnSave": {
      "source.fixAll": false
    }
  }
}
```

## FAQ

- _"Do I need the prettier extension installed too?"_
  - A: No, this plugin negates any need for the vscode-prettier plugin (and you can't use both simultaniously anyways)
- _"Do I need the eslint extension installed too?"_
  - A: No, but you should anyway
- _"Can I set options for prettier or eslint like in their respective plugins?"_
  - A: No, use config files like normal humans please. 👽

## Prior Art

- Most of this extension is shamelessly lifted from the prettier-vscode plugin: <https://github.com/prettier/prettier-vscode>
