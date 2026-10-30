// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { expect, test } from 'vitest';
import { checkedSettings, defaults } from './settings';

test('a missing value or a value of a wrong type gives the default, and the pause stays between 100 and 10000 ms', () => {
  expect(checkedSettings(() => undefined)).toEqual(defaults);
  expect(checkedSettings((key) => ({ browserPath: 3, previewDelay: 'fast', openPdf: 'yes' })[key])).toEqual(defaults);
  expect(checkedSettings((key) => ({ browserPath: '/bin/chrome', previewDelay: 20, openPdf: false })[key])).toEqual({ browserPath: '/bin/chrome', previewDelay: 100, openPdf: false });
  expect(checkedSettings((key) => (key === 'previewDelay' ? 60_000 : undefined)).previewDelay).toBe(10_000);
});
