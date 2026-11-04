// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { browserVariable, findBrowser, NoBrowserError } from './browser';
import { headlessShell, type Place } from './download';

/** nowhere is the place of a download in a new empty folder, so that no downloaded Chromium is there. */
function nowhere(): Place {
  return { cache: fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-test-')), platform: 'linux64', release: headlessShell };
}

describe('the browser of the PDF (R-PDF-002)', () => {
  const saved = { variable: process.env[browserVariable], path: process.env.PATH };

  afterEach(() => {
    for (const [key, value] of [[browserVariable, saved.variable], ['PATH', saved.path]] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test('the environment variable MARKDOWNPAPER_BROWSER names the program, and the setting comes before it', () => {
    process.env[browserVariable] = process.execPath;
    expect(findBrowser('', nowhere())).toBe(process.execPath);
    process.env[browserVariable] = path.join(os.tmpdir(), 'no-such-browser');
    expect(() => findBrowser('', nowhere())).toThrow(/does not exist or cannot be run/);
    expect(findBrowser(process.execPath, nowhere())).toBe(process.execPath);
  });

  test.skipIf(process.platform !== 'linux')('without an installed browser, the downloaded Chromium prints, else the error names the setting and the download', () => {
    delete process.env[browserVariable];
    process.env.PATH = '';
    const place = nowhere();
    const error = (() => {
      try {
        findBrowser('', place);
      } catch (thrown) {
        return thrown;
      }
      return undefined;
    })();
    // A computer with Chrome in /opt/google/chrome or a snap of Chromium finds it without the PATH.
    if (error === undefined) {
      return;
    }
    expect(error).toBeInstanceOf(NoBrowserError);
    expect((error as Error).message).toMatch(/nimblescape\.markdownPaper\.browserPath.*--browser.*MARKDOWNPAPER_BROWSER.*--download-browser/);
    const program = path.join(place.cache, 'chrome-headless-shell', headlessShell.version, 'linux64', 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    fs.mkdirSync(path.dirname(program), { recursive: true });
    fs.writeFileSync(program, '#!/bin/sh\n', { mode: 0o755 });
    expect(findBrowser('', place)).toBe(program);
  });
});
