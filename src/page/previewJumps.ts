// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The way back after a jump on the pages of the Markdown preview ([R-PRV-004](../../docs/requirements.md#r-prv-004)),
 * the bundle `dist/previewJumps.js` of `markdown.previewScripts`: a click on a link to a place of the document that
 * moves the pages, for example an entry of the table of contents, a cross reference, a citation or a footnote, keeps the
 * place before the click, and Go Back and Go Forward return through the places, with the keys of Go Back and Go Forward
 * of VS Code, with the back and forward buttons of the mouse and with the buttons "Back" and "Forward" at the bottom
 * right of the preview, which show while there is a place in their direction (`installPageJumps` of
 * `@nimblescape/markdownrender/jumps`). Without a place, a key goes on to VS Code. On Windows, VS Code gives the mouse
 * buttons to its own commands Go Back and Go Forward, so the preview leaves them to VS Code. The places belong to the
 * file of the preview and stay over a load of the page again. Markdown Notes installs the same jumps in the preview,
 * and the page keeps one set of them.
 */

import { installPageJumps, platformOf, vscodeJumpKeys } from '@nimblescape/markdownrender/jumps';

/** previewSource returns the URI of the file of the preview from the data of the page of VS Code. */
function previewSource(): string | undefined {
  const data = document.getElementById('vscode-markdown-preview-data')?.getAttribute('data-settings');
  try {
    const source: unknown = data ? (JSON.parse(data) as { source?: unknown }).source : undefined;
    return typeof source === 'string' ? source : undefined;
  } catch {
    return undefined;
  }
}

let source = previewSource();
// VS Code sends a new content, also of another file, with the message updateContent.
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data as { type?: unknown; source?: unknown } | null;
  if (message?.type === 'updateContent' && typeof message.source === 'string') {
    source = message.source;
  }
});

const platform = platformOf(navigator);
installPageJumps(window, { keys: vscodeJumpKeys(platform), mouseButtons: platform !== 'windows', platform, key: () => source });
