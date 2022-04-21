import type { Options } from 'execa';
import type { ESLint } from 'eslint';
import { execa } from 'execa';

import type { Logger } from './logging';

const execaOptions = (cwd: string) => ({
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

interface FormatterParams {
  cwd: string;
  fileName: string;
  bin: string;
  isDaemon: boolean;
  text: string;
  logger: Logger;
}

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

export async function doPrettier(params: FormatterParams): Promise<string> {
  return params.isDaemon ? prettierDaemon(params) : prettierRegular(params);
}

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

export async function doESLint(params: FormatterParams): Promise<string> {
  return params.isDaemon ? eslintDaemon(params) : eslintRegular(params);
}
