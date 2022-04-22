import path from 'path';
import { execaSync } from 'execa';
import npmWhich from 'npm-which';
// import { silent as resolveFrom } from 'resolve-from';
// import { silent as resolveGlobal } from 'resolve-global';

import type { Logger } from './logging';
import type { SettingsManager } from './settingsManager';

interface CacheMapping {
  eslint?: string;
  eslint_d?: string;
  prettier?: string;
  prettierd?: string;
}

const pkgInstallMappings: Record<string, string | undefined> = {
  prettierd: '@fsouza/prettierd',
};

export class Resolver {
  cache = new Map<`${string}-${keyof CacheMapping}`, string>();

  logger: Logger;

  constructor(props: { logger: Logger; }) {
    this.logger = props.logger;
  }

  /** @description Finding the path to the package. */
  find = async (pkg: keyof CacheMapping, cwd: string): Promise<string> => {
    const cached = this.cache.get(`${cwd}-${pkg}`);

    if (cached) {
      this.logger.logDebug(`Found ${pkg} bin in cache: ${cached}`);
      return cached;
    }

    this.logger.logDebug(`Looking for ${pkg} bin`);

    // const normalized = pkgMappings[pkg] ?? pkg;

    let pkgPath = '';

    try {
      let dir = path.resolve(cwd);
      const parsed = path.parse(dir);

      while (!pkgPath && dir.toLowerCase() !== parsed.root.toLowerCase()) {
        const which = npmWhich(dir);
        try {
          pkgPath = which.sync(pkg);
        } catch (err) {
          this.logger.logDebug(`Did not find ${pkg} in ${dir}, trying higher up`);
        }

        dir = path.resolve(dir, '..');
      }
    } catch (err) {
      debugger;
      pkgPath = '';
    }

    if (!pkgPath) {
      this.logger.logError(`Could not find package: ${pkg}`);
      throw new Error(`Could not find package: ${pkg}`);
    }

    this.cache.set(`${cwd}-${pkg}`, pkgPath);

    this.logger.logDebug(`Found ${pkg} bin`);

    return pkgPath;
  };

  /** @description Installing the daemon if it is not already installed. */
  getOrInstallDaemon = async (pkg: 'eslint_d' | 'prettierd', cwd: string) => {
    const installName = pkgInstallMappings[pkg] || pkg;
    const out = execaSync('npm', ['install', '--global', `${installName}@latest`], {
      cleanup: true,
      buffer: true,
      encoding: 'utf-8',
      preferLocal: true,
      localDir: cwd,
      windowsHide: true,
    });

    this.logger?.logDebug(`Output from installing ${pkg}: `, out);

    return this.find(pkg, cwd);
  };

  /** @description Performs setup of all daemons */
  setupDaemons = async (settingsManager: SettingsManager, cwd?: string) => {
    this.logger?.logInfo('Installing daemons if needed');

    const root = cwd || path.resolve('.');

    if (!settingsManager.daemonPathEslint) {
      try {
        const daemonPathEslint = await this.getOrInstallDaemon('eslint_d', root);

        settingsManager.set('daemonPathEslint', daemonPathEslint);
      } catch (err) {
        this.logger?.logError('Failed to setup eslint daemon', err);
      }
    }

    if (!settingsManager.daemonPathPrettier) {
      try {
        const daemonPathPrettier = await this.getOrInstallDaemon('prettierd', root);

        settingsManager.set('daemonPathPrettier', daemonPathPrettier);
      } catch (err) {
        this.logger?.logError('Failed to setup prettier daemon', err);
      }
    }
  };
}
