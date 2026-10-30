// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The instructions for AI agents ([R-CLI-003](../../docs/requirements.md#r-cli-003)): `markdownpaper instructions
 * <topic>` prints the rules of a topic, so that an agent reads the rules of the installed version without web access.
 * The texts are the documents of docs/, which the build puts into the bundle, so the documents on GitHub and the
 * printed rules are the same text. The module uses no API of VS Code.
 */

import documentRules from '../../docs/document.md?raw';
import layoutRules from '../../docs/layout.md?raw';
import renderRules from '../../docs/render.md?raw';

/** Topic is a topic of the instructions. */
export interface Topic {
  name: string;
  summary: string;
  text: string;
}

/**
 * withoutHeader returns a document without its comment of the license at its start.
 * @param text - The document.
 */
const withoutHeader = (text: string): string => text.replace(/^<!--[\s\S]*?-->\s*/, '');

/** topics are the topics of the instructions, in the order of the list. */
export const topics: readonly Topic[] = [
  { name: 'document', summary: 'writing a document: front matter, headings, generated lists, figures, tables, footnotes, appendix, notes', text: withoutHeader(documentRules) },
  { name: 'layout', summary: 'the layout folder and layout.json, also made from a Word template', text: withoutHeader(layoutRules) },
  { name: 'render', summary: 'making the PDF of a document and checking its pages', text: withoutHeader(renderRules) },
];

/**
 * topicList returns the list of the topics, for `markdownpaper instructions` without a topic.
 * @param command - The command that prints a topic.
 */
export const topicList = (command: string): string =>
  ['Topics of the instructions:', '', ...topics.map((topic) => `  ${topic.name.padEnd(10)} ${topic.summary}`), '', `Print one: ${command} instructions <topic>`].join('\n');
