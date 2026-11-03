// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The bundle `dist/editorPlugins.js` of the plugins of this extension for the editor of rendered Markdown of nimblescape
 * Markdown ([R-EDIT-001](../../docs/requirements.md#r-edit-001)). The package.json names it in the contribution point
 * `nimblescape.markdown.extensions`, so that the page of an editor that loads the plugins of other extensions, for
 * example the editor of a whole file of nimblescape Markdown Notes, loads it before the editor starts. The bundle holds
 * no copy of Tiptap, ProseMirror or the libraries of nimblescape Markdown: the plugin of esbuild `sharedModulesPlugin`
 * of `@nimblescape/markdowneditor/bundle` makes it use the modules of the page (esbuild.mjs).
 */

import { registerPlugin } from '@nimblescape/markdowneditor/bundle';
import { paperPlugin } from './paperPlugin';

registerPlugin(paperPlugin);
