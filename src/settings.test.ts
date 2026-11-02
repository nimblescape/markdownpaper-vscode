// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { expect, test } from 'vitest';
import { checkedSettings, defaults } from './settings';

test('a missing value or a value of a wrong type gives the default, and the pause stays between 100 and 10000 ms', () => {
  expect(checkedSettings(() => undefined)).toEqual(defaults);
  expect(checkedSettings((key) => ({ browserPath: 3, previewDelay: 'fast', openPdf: 'yes', zoteroGroups: 'thesis' })[key])).toEqual(defaults);
  expect(checkedSettings((key) => ({ browserPath: '/bin/chrome', previewDelay: 20, openPdf: false, zoteroGroups: [] })[key])).toEqual({
    browserPath: '/bin/chrome',
    previewDelay: 100,
    openPdf: false,
    zoteroGroups: [],
  });
  expect(checkedSettings((key) => (key === 'previewDelay' ? 60_000 : undefined)).previewDelay).toBe(10_000);
});

test('a group library of Zotero is its number, also as a text or in its address on zotero.org; another value is left out (decision 50)', () => {
  const groups = [1234567, ' 7654321 ', 'https://www.zotero.org/groups/2345678/pht_thesis', 'https://zotero.org/groups/1234567', 'thesis', 0, 1.5, null, 'https://example.org/groups/3'];
  expect(checkedSettings((key) => (key === 'zoteroGroups' ? groups : undefined)).zoteroGroups).toEqual(['1234567', '7654321', '2345678']);
});
