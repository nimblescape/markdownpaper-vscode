// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The browser that prints the PDF ([R-PDF-002](../../docs/requirements.md#r-pdf-002)): an installed Google Chrome,
 * Chromium or Microsoft Edge. The extension and the command line download no browser: Windows has Edge, and the
 * message of a missing browser says where to get Chrome and which setting or option names another program. The
 * module uses no API of VS Code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** browserVariable is the environment variable that names the program of the browser. */
export const browserVariable = 'MARKDOWNPAPER_BROWSER';

/**
 * candidates returns the places of the programs of the browsers on a system, in the order of the search.
 * @param platform - The platform, as `process.platform` names it.
 * @param env - The environment variables.
 */
export function candidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((root): root is string => !!root);
    return [
      ...roots.map((root) => path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...roots.map((root) => path.win32.join(root, 'Chromium', 'Application', 'chrome.exe')),
      ...roots.map((root) => path.win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ];
  }
  if (platform === 'darwin') {
    const apps = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Brave Browser.app/Contents/MacOS/Brave Browser'];
    return [...apps.map((app) => `/Applications/${app}`), ...(env.HOME ? apps.map((app) => path.posix.join(env.HOME as string, 'Applications', app)) : [])];
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser'];
  const folders = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return [...names.flatMap((name) => folders.map((folder) => path.posix.join(folder, name))), '/opt/google/chrome/chrome', '/snap/bin/chromium'];
}

/**
 * isProgram tells whether a file exists and can be run.
 * @param file - The path of the file.
 */
function isProgram(file: string): boolean {
  try {
    fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * findBrowser returns the path of the program of the browser: the configured path, else the environment variable
 * MARKDOWNPAPER_BROWSER, else the first installed browser of the search.
 * @param configured - The path of the setting or of the option, or empty.
 * @throws When the configured program does not exist, or no browser is installed.
 */
export function findBrowser(configured = ''): string {
  const named = configured.trim() || (process.env[browserVariable] ?? '').trim();
  if (named) {
    if (!isProgram(named)) {
      throw new Error(`The browser program ${named} does not exist or cannot be run.`);
    }
    return named;
  }
  const found = candidates(process.platform, process.env).find(isProgram);
  if (!found) {
    throw new Error(
      'No Google Chrome, Chromium or Microsoft Edge was found for the PDF. Install Google Chrome (https://www.google.com/chrome/), ' +
        `or name the program of the browser in the setting "nimblescape.markdownPaper.browserPath", the option --browser, or the environment variable ${browserVariable}.`,
    );
  }
  return found;
}
