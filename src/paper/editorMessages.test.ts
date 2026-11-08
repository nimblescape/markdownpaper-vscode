// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the messages of the lists of the special sections between the page of the editor and the extension
 * (R-REN-004): each side takes only a message of the right form.
 */

import { describe, expect, test } from 'vitest';
import { extensionMessage, pageMessage } from './editorMessages';

describe('the messages of the lists', () => {
  test('the extension takes a request of a list with its code, the text and a place in it', () => {
    expect(pageMessage({ type: 'list', request: 2, code: 'LOT', text: '# A', at: 3 })).toEqual({ type: 'list', request: 2, code: 'LOT', text: '# A', at: 3 });
    expect(pageMessage({ type: 'list', request: 2, code: 'BIB', text: '# A', at: 3 })).toBeUndefined();
    expect(pageMessage({ type: 'list', request: 2, code: 'TOC', text: '# A', at: -1 })).toBeUndefined();
    expect(pageMessage({ type: 'list', request: 2, code: 'TOC', at: 0 })).toBeUndefined();
  });

  test('the page takes a change with its range and the range of the heading, and an answer without a change', () => {
    const change = { from: 4, to: 4, text: '\n\n# Inhalt', heading: { from: 4, to: 10 } };
    expect(extensionMessage({ type: 'listChange', request: 1, change })).toEqual({ type: 'listChange', request: 1, change });
    expect(extensionMessage({ type: 'listChange', request: 1 })).toEqual({ type: 'listChange', request: 1 });
    expect(extensionMessage({ type: 'listChange', request: 1, change: { ...change, to: 2 } })).toEqual({ type: 'listChange', request: 1 });
    expect(extensionMessage({ type: 'listChange', request: 1, change: { ...change, heading: undefined } })).toEqual({ type: 'listChange', request: 1 });
  });
});
