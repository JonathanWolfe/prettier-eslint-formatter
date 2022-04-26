import type { Options } from 'execa';
import type { ESLint } from 'eslint';
import { execa } from 'execa';

import type { Logger } from './logging';

/**
 * It returns an object that contains the options for the `execa` function
 * @param {string} cwd - The current working directory.
 */
export const execaOptions = (cwd: string) => ({
  cwd,
  cleanup: true,
  buffer: true,
  encoding: 'utf-8',
  preferLocal: true,
  localDir: cwd,
  windowsHide: true,
  env: {
    PRETTIERD_LOCAL_PRETTIER_ONLY: '1',
  },
  extendEnv: true,
} as Options);

/** @description Required info and externals for formatting */
interface FormatterParams {
  cwd: string;
  fileName: string;
  bin: string;
  isDaemon: boolean;
  text: string;
  logger: Logger;
}

/**
 * It runs prettier on the given text, and returns the formatted text
 * @param {FormatterParams} params - FormatterParams
 */
async function prettierRegular(params: FormatterParams): Promise<string> {
  const {
    bin, fileName, cwd, text, logger,
  } = params;

  const results = await execa(
    bin,
    [
      '--no-error-on-unmatched-pattern',
      '--ignore-unknown',
      '--stdin-filepath',
      fileName,
    ],
    { ...execaOptions(cwd), input: text },
  );

  logger.logDebug('prettier output:', results);

  if (results.exitCode !== 0) {
    logger.logError('Prettier STDERR: ', results.stderr);
    throw new Error('Prettier failed. Check above output for the reason.');
  }

  return results.stdout;
}

/**
 * It runs prettier on the given file, and returns the formatted output
 * @param {FormatterParams} params - FormatterParams
 */
async function prettierDaemon(params: FormatterParams): Promise<string> {
  const {
    bin, fileName, cwd, text, logger,
  } = params;

  const results = await execa(
    bin,
    [
      fileName,
    ],
    { ...execaOptions(cwd), input: text },
  );

  logger.logDebug('prettier output:', results);

  if (results.exitCode !== 0) {
    logger.logError('Prettier STDERR: ', results.stderr);
    throw new Error('Prettier failed. Check above output for the reason.');
  }

  return results.stdout;
}

/**
 * It calls either `prettierDaemon` or `prettierRegular` depending on whether the `isDaemon` parameter
 * is true or false
 * @param {FormatterParams} params - FormatterParams
 */
export async function doPrettier(params: FormatterParams): Promise<string> {
  return params.isDaemon ? prettierDaemon(params) : prettierRegular(params);
}

/**
 * It runs ESLint on the given text, and returns the fixed text
 * @param {FormatterParams} params - FormatterParams
 */
async function eslintRegular(params: FormatterParams): Promise<string> {
  const {
    bin, fileName, cwd, text, logger,
  } = params;

  const results = await execa(
    bin,
    [
      '--exit-on-fatal-error',
      '--no-error-on-unmatched-pattern',
      '--fix-dry-run',
      '--format=json',
      '--stdin',
      '--stdin-filename',
      fileName,
    ],
    { ...execaOptions(cwd), input: text },
  );

  logger.logDebug('ESLint output:', results);

  if (results.exitCode !== 0) {
    logger.logError('ESLint STDERR: ', results.stderr);
    throw new Error('ESLint failed. Check above output for the reason.');
  }

  const lintResults: ESLint.LintResult[] | ESLint.LintResult = JSON.parse(results.stdout);
  const output = Array.isArray(lintResults) ? lintResults[0] : lintResults;

  return output?.output || output?.source || text;
}

/**
 * It runs ESLint on the given text, and returns the fixed text
 * @param {FormatterParams} params - FormatterParams
 */
async function eslintDaemon(params: FormatterParams): Promise<string> {
  const {
    bin, fileName, cwd, text, logger,
  } = params;

  const results = await execa(
    bin,
    [
      '--fix-to-stdout',
      '--stdin',
      '--stdin-filename',
      fileName,
    ],
    { ...execaOptions(cwd), input: text },
  );

  logger.logDebug('ESLint output:', results);

  if (results.exitCode !== 0) {
    logger.logError('ESLint STDERR: ', results.stderr);
    throw new Error('ESLint failed. Check above output for the reason.');
  }

  return results.stdout || text;
}

/**
 * It runs ESLint in daemon mode if the `isDaemon` parameter is true, otherwise it runs ESLint in
 * regular mode
 * @param {FormatterParams} params - FormatterParams
 */
export async function doESLint(params: FormatterParams): Promise<string> {
  return params.isDaemon ? eslintDaemon(params) : eslintRegular(params);
}
