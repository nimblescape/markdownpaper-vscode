// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The browser that prints the PDF ([R-PDF-002](../../docs/requirements.md#r-pdf-002)): the search of
 * `@nimblescape/markdownlayout` for an installed Google Chrome, Chromium, Microsoft Edge or Brave, with the environment
 * variable MARKDOWNPAPER_BROWSER, else the Chromium of an earlier download ([download.ts](download.ts)). Without one,
 * the error NoBrowserError says where to get Chrome, which setting or option names another program, and how the
 * command downloads Chromium; the extension asks before its download. The module uses no API of VS Code.
 */

import { findBrowser as findInstalled, NoBrowserError as NoInstalledBrowserError } from '@nimblescape/markdownlayout/pdf';
import { downloadedBrowser, type Place } from './download';

/** NoBrowserError is the error of a computer without an installed or downloaded browser. */
export class NoBrowserError extends NoInstalledBrowserError {}

/** browserVariable is the environment variable that names the program of the browser. */
export const browserVariable = 'MARKDOWNPAPER_BROWSER';

/**
 * findBrowser returns the path of the program of the browser: the configured path, else the environment variable
 * MARKDOWNPAPER_BROWSER, else the first installed browser of the search, else the downloaded Chromium.
 * @param configured - The path of the setting or of the option, or empty.
 * @param place - The place of the download of Chromium.
 * @throws When the configured program does not exist; a NoBrowserError when no browser is installed or downloaded.
 */
export function findBrowser(configured = '', place?: Place): string {
  try {
    return findInstalled(configured, browserVariable);
  } catch (error) {
    if (!(error instanceof NoInstalledBrowserError)) {
      throw error;
    }
  }
  const downloaded = downloadedBrowser(place);
  if (!downloaded) {
    throw new NoBrowserError(
      'No Google Chrome, Chromium or Microsoft Edge was found for the PDF. Install Google Chrome (https://www.google.com/chrome/), ' +
        `name the program of the browser in the setting "nimblescape.markdownPaper.browserPath", the option --browser, or the environment variable ${browserVariable}, ` +
        'or let Markdown Paper download Chromium once: "Export PDF" in VS Code asks, and the command has the option --download-browser.',
    );
  }
  return downloaded;
}
