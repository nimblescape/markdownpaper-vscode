// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The diagrams of Mermaid in the PDF of the command line ([R-REN-016](../../docs/requirements.md#r-ren-016)), which has
 * no Mermaid extension of VS Code: the page gets what that extension gives the Markdown preview. The markdown-it
 * plugin writes a fenced code block whose language is one of the setting `markdown-mermaid.languages`, and a container
 * `::: mermaid`, as the extension writes them; the script of the page (src/page/mermaid.ts, built into the folder
 * `mermaid/` of the npm package) draws them with the same version of Mermaid and the same theme. The settings
 * `markdown-mermaid.*` come from the file `.vscode/settings.json` of the workspace folder of the document. The module
 * uses no API of VS Code.
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type MarkdownIt from 'markdown-it';
import type { MarkdownPlugin } from '../paper/markdown';
import type { Script } from '../paper/render';

/** MermaidSettings are the settings of the Mermaid extension of VS Code that the PDF uses. */
export interface MermaidSettings {
  /** lightModeTheme is the theme of Mermaid for a light theme; "vscode" takes the colors of the theme of VS Code. */
  lightModeTheme: string;
  /** languages are the languages of the fenced code blocks that are diagrams of Mermaid. */
  languages: readonly string[];
  /** maxTextSize is the largest number of characters of a diagram. */
  maxTextSize: number;
}

/** mermaidSection is the section of the settings of the Mermaid extension of VS Code. */
const mermaidSection = 'markdown-mermaid';

/** themes are the values of the setting `markdown-mermaid.lightModeTheme`. */
const themes = ['vscode', 'base', 'forest', 'dark', 'default', 'neutral'];

/** defaultMermaidSettings are the defaults of the Mermaid extension of VS Code. */
export const defaultMermaidSettings: Readonly<MermaidSettings> = { lightModeTheme: 'vscode', languages: ['mermaid'], maxTextSize: 50000 };

/**
 * mermaidSettingsOf reads the settings `markdown-mermaid.*` from settings of VS Code, as the parsed object of a file
 * `settings.json`. A missing or invalid value gets its default.
 * @param values - The settings of VS Code.
 */
export function mermaidSettingsOf(values: Readonly<Record<string, unknown>>): MermaidSettings {
  const theme = values[`${mermaidSection}.lightModeTheme`];
  const languages = values[`${mermaidSection}.languages`];
  const maxTextSize = values[`${mermaidSection}.maxTextSize`];
  return {
    lightModeTheme: typeof theme === 'string' && themes.includes(theme) ? theme : defaultMermaidSettings.lightModeTheme,
    languages: Array.isArray(languages) && languages.every((language) => typeof language === 'string') ? languages : defaultMermaidSettings.languages,
    maxTextSize: typeof maxTextSize === 'number' && maxTextSize > 0 ? maxTextSize : defaultMermaidSettings.maxTextSize,
  };
}

/**
 * escapeDiagram returns the text of a diagram for an element, as the Mermaid extension of VS Code writes it: escaped,
 * without the line breaks at its end and the white space at its start.
 * @param text - The text.
 */
const escapeDiagram = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n+$/, '').trimStart();

/**
 * containerRule is the block rule of a container `::: mermaid` up to its line `:::`, which the Mermaid extension of
 * VS Code writes as an element `div.mermaid`.
 */
const containerRule: Parameters<MarkdownIt['block']['ruler']['before']>[2] = (state, startLine, endLine, silent) => {
  let start = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.src.charCodeAt(start) !== 0x3a) {
    return false;
  }
  let position = start + 1;
  while (position <= max && state.src[position] === ':') {
    position++;
  }
  const length = position - start;
  if (length < 3) {
    return false;
  }
  const markup = state.src.slice(start, position);
  const info = state.src.slice(position, max);
  if (info.trim().split(' ')[0].toLowerCase() !== 'mermaid') {
    return false;
  }
  if (silent) {
    return true;
  }
  let next = startLine;
  let closed = false;
  for (;;) {
    next++;
    if (next >= endLine) {
      break;
    }
    start = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    if (start < max && state.sCount[next] < state.blkIndent) {
      break;
    }
    if (state.src.charCodeAt(start) !== 0x3a || state.sCount[next] - state.blkIndent >= 4) {
      continue;
    }
    position = start + 1;
    while (position <= max && state.src[position] === ':') {
      position++;
    }
    if (position - start < length || state.skipSpaces(position) < max) {
      continue;
    }
    closed = true;
    break;
  }
  const token = state.push('mermaidContainer', 'div', 1);
  token.markup = markup;
  token.block = true;
  token.info = info;
  token.map = [startLine, next];
  token.content = state.getLines(startLine + 1, next, state.blkIndent, true);
  state.line = next + (closed ? 1 : 0);
  return true;
};

/**
 * mermaidPlugin returns the markdown-it plugin of the diagrams of Mermaid, which writes them as the Mermaid extension
 * of VS Code writes them: a fenced code block of one of the languages as `<pre class="mermaid" style="all: unset;">`,
 * and a container `::: mermaid` as `<div class="mermaid">`.
 * @param settings - The settings.
 */
export function mermaidPlugin(settings: Readonly<MermaidSettings>): MarkdownPlugin {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const languages = new RegExp(`\\b(${settings.languages.map(escape).join('|')})\\b`, 'i');
  return (md) => {
    md.block.ruler.before('fence', 'mermaidContainer', containerRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
    md.renderer.rules.mermaidContainer = (tokens, index) => `<div class="mermaid">${escapeDiagram(tokens[index].content)}</div>`;
    const highlight = md.options.highlight;
    md.options.highlight = (code, language, attributes) =>
      language && settings.languages.length > 0 && languages.test(language)
        ? `<pre class="mermaid" style="all: unset;">${escapeDiagram(code)}</pre>`
        : (highlight?.(code, language, attributes) ?? '');
    return md;
  };
}

/** MermaidParts are the parts of the page of the PDF for the diagrams of Mermaid. */
export interface MermaidParts {
  plugin: MarkdownPlugin;
  /** scripts are the settings for the script of the page, and that script, which draws the diagrams. */
  scripts: Script[];
}

/**
 * mermaidParts returns the markdown-it plugin and the scripts of the diagrams of Mermaid for the page of the PDF.
 * @param folder - The path of the folder with the script of the page, mermaid.js, and its parts.
 * @param settings - The settings.
 */
export function mermaidParts(folder: string, settings: Readonly<MermaidSettings>): MermaidParts {
  const page = { lightModeTheme: settings.lightModeTheme, maxTextSize: settings.maxTextSize };
  return {
    plugin: mermaidPlugin(settings),
    scripts: [{ text: `window.paperMermaid = ${JSON.stringify(page).replace(/</g, '\\u003c')};` }, { src: pathToFileURL(path.join(folder, 'mermaid.js')).href, module: true }],
  };
}
