module.exports = {
  root: true,
  env: {
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    tsconfigRootDir: __dirname,
    project: [
      './tsconfig.json',
    ],
  },
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'airbnb-base',
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    'out',
    'dist',
  ],
  rules: {
    'max-len': 'off',
    'no-restricted-syntax': 'off',
    'class-methods-use-this': 'off',

    'import/prefer-default-export': 'off',

    '@typescript-eslint/consistent-type-exports': 'warn',
    '@typescript-eslint/consistent-type-imports': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
};
