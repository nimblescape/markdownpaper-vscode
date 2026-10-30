// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The settings of the extension, their defaults, and the check of their values. The module uses no API of VS Code:
 * the extension passes the values of the configuration.
 */

/** settingsSection is the section of the settings of the extension. */
export const settingsSection = 'nimblescape.markdownPaper';

/** Settings are the settings of the extension. */
export interface Settings {
  /** browserPath is the program of the browser that prints the PDF; empty searches an installed browser. */
  browserPath: string;
  /** previewDelay is the pause in typing in milliseconds after which the page preview shows the changed text. */
  previewDelay: number;
  /** openPdf is true when "Export PDF" opens the written PDF with the program of the system. */
  openPdf: boolean;
}

/** defaults are the defaults of the settings, the same as in package.json. */
export const defaults: Settings = { browserPath: '', previewDelay: 800, openPdf: true };

/**
 * checkedSettings returns the settings with the default for each value that is missing or of a wrong type.
 * @param get - The value of a setting by its key.
 */
export function checkedSettings(get: (key: keyof Settings) => unknown): Settings {
  const browserPath = get('browserPath');
  const previewDelay = get('previewDelay');
  const openPdf = get('openPdf');
  return {
    browserPath: typeof browserPath === 'string' ? browserPath : defaults.browserPath,
    previewDelay: typeof previewDelay === 'number' && Number.isFinite(previewDelay) ? Math.min(Math.max(previewDelay, 100), 10_000) : defaults.previewDelay,
    openPdf: typeof openPdf === 'boolean' ? openPdf : defaults.openPdf,
  };
}
