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
  /**
   * zoteroGroups are the numbers of the group libraries of Zotero that `/cite` and "Update Sources from Zotero" read
   * besides the personal library (decision 50).
   */
  zoteroGroups: string[];
}

/** defaults are the defaults of the settings, the same as in package.json. */
export const defaults: Settings = { browserPath: '', previewDelay: 800, openPdf: true, zoteroGroups: [] };

/**
 * groupNumber returns the number of a group library of Zotero from a value of the setting `zoteroGroups`: the number,
 * also as a text, or the address of the group on zotero.org, for example `https://www.zotero.org/groups/1234567/thesis`.
 * @param value - The value.
 * @returns The number as a text, or undefined for another value.
 */
function groupNumber(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return /^\s*(\d+)\s*$/.exec(value)?.[1] ?? /^\s*https:\/\/(?:www\.)?zotero\.org\/groups\/(\d+)(?:[/?#]\S*)?\s*$/i.exec(value)?.[1];
}

/**
 * checkedSettings returns the settings with the default for each value that is missing or of a wrong type.
 * @param get - The value of a setting by its key.
 */
export function checkedSettings(get: (key: keyof Settings) => unknown): Settings {
  const browserPath = get('browserPath');
  const previewDelay = get('previewDelay');
  const openPdf = get('openPdf');
  const zoteroGroups = get('zoteroGroups');
  return {
    browserPath: typeof browserPath === 'string' ? browserPath : defaults.browserPath,
    previewDelay: typeof previewDelay === 'number' && Number.isFinite(previewDelay) ? Math.min(Math.max(previewDelay, 100), 10_000) : defaults.previewDelay,
    openPdf: typeof openPdf === 'boolean' ? openPdf : defaults.openPdf,
    // A value that names no group is left out, and each group counts once.
    zoteroGroups: Array.isArray(zoteroGroups) ? [...new Set(zoteroGroups.map(groupNumber).filter((group) => group !== undefined))] : defaults.zoteroGroups,
  };
}
