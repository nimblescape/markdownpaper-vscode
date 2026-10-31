// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The script of the page of the PDF that draws the diagrams of Mermaid on the command line
 * ([R-REN-016](../../docs/requirements.md#r-ren-016)), which has no Mermaid extension of VS Code. It draws them as the
 * Mermaid extension of VS Code draws them in the Markdown preview with a light theme, so that the PDF of
 * `mp build` shows the diagrams as "Export PDF" in VS Code does: the same version of Mermaid, the same
 * layouts (ELK and tidy tree), the theme "vscode" from the colors of the theme on the page, the same IDs, and the
 * message of an error in an element `pre.mermaid-error`. It has neither the diagrams of ZenUML nor the icon packs
 * `logos` and `mdi` of the extension: the package of ZenUML holds React and other packages without their notices,
 * and the icon packs have more than 10 MB. The markdown-it plugin of src/pdf/mermaid.ts writes
 * the elements `.mermaid` with the text of the diagrams, and a script before this one gives the settings in
 * `window.paperMermaid`. esbuild bundles this script with Mermaid into the folder `mermaid/` of the npm package, in
 * parts that the script loads when a diagram needs them.
 */

import elkLayouts from '@mermaid-js/layout-elk';
import tidyTreeLayouts from '@mermaid-js/layout-tidy-tree';
import mermaid from 'mermaid';

/** Settings are the settings of the Mermaid extension of VS Code that the page uses. */
interface Settings {
  /** lightModeTheme is the theme of Mermaid for a light theme of VS Code; "vscode" takes the colors of the theme. */
  lightModeTheme: string;
  /** maxTextSize is the largest number of characters of a diagram. */
  maxTextSize: number;
}

const settings: Settings = { lightModeTheme: 'vscode', maxTextSize: 50000, ...(window as { paperMermaid?: Partial<Settings> }).paperMermaid };

/**
 * hexColor returns a color of CSS as `#rrggbb` or `#rrggbbaa`, as the browser computes it, or undefined.
 * @param value - The color, for example `var(--vscode-foreground)`.
 */
function hexColor(value: string): string | undefined {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = value;
  document.body.appendChild(probe);
  try {
    const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(getComputedStyle(probe).color);
    if (!match) {
      return undefined;
    }
    const hex = (part: number) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, '0');
    const alpha = match[4] === undefined ? 255 : Math.round(Number.parseFloat(match[4]) * 255);
    return `#${hex(Number(match[1]))}${hex(Number(match[2]))}${hex(Number(match[3]))}${alpha < 255 ? hex(alpha) : ''}`;
  } finally {
    probe.remove();
  }
}

/**
 * variableOf returns the value of a CSS variable of the page, or an empty text.
 * @param name - The name of the variable.
 */
const variableOf = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * themeVariables returns the variables of the theme "base" of Mermaid from the colors of the theme of VS Code on the
 * page, as the Mermaid extension of VS Code sets them for its theme "vscode": each variable takes the first color of
 * its list that the page has.
 */
function themeVariables(): Record<string, string | boolean> {
  const variables: Record<string, string | boolean> = {
    darkMode: document.body.classList.contains('vscode-dark') || (document.body.classList.contains('vscode-high-contrast') && !document.body.classList.contains('vscode-high-contrast-light')),
  };
  const set = (name: string, ...colors: string[]) => {
    for (const color of colors) {
      const value = variableOf(color) ? hexColor(`var(${color})`) : undefined;
      if (value) {
        variables[name] = value;
        return;
      }
    }
  };
  set('background', '--vscode-editor-background');
  set('textColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground');
  set('lineColor', '--vscode-chart-line', '--vscode-charts-lines', '--vscode-editor-foreground', '--vscode-foreground');
  set('primaryColor', '--vscode-editorWidget-background');
  set('primaryTextColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground');
  set('primaryBorderColor', '--vscode-chart-line', '--vscode-editorWidget-border', '--vscode-focusBorder');
  set('mainBkg', '--vscode-editorWidget-background');
  set('nodeBorder', '--vscode-chart-line', '--vscode-editorWidget-border', '--vscode-focusBorder');
  set('secondaryColor', '--vscode-input-background', '--vscode-editorWidget-background');
  set('secondaryTextColor', '--vscode-input-foreground', '--vscode-foreground');
  set('secondaryBorderColor', '--vscode-input-border', '--vscode-editorWidget-border');
  set('tertiaryColor', '--vscode-textBlockQuote-background', '--vscode-input-background');
  set('tertiaryTextColor', '--vscode-foreground');
  set('tertiaryBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');
  set('clusterBkg', '--vscode-textBlockQuote-background', '--vscode-input-background');
  set('clusterBorder', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');
  set('noteBkgColor', '--vscode-textBlockQuote-background', '--vscode-editorWidget-background');
  set('noteTextColor', '--vscode-foreground');
  set('noteBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');
  set('errorBkgColor', '--vscode-inputValidation-errorBackground', '--vscode-editorError-background');
  set('errorTextColor', '--vscode-editorError-foreground', '--vscode-foreground');
  set('titleColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground');
  set('edgeLabelBackground', '--vscode-editor-background');
  const charts = ['--vscode-charts-blue', '--vscode-charts-green', '--vscode-charts-orange', '--vscode-charts-red', '--vscode-charts-purple', '--vscode-charts-yellow'];
  charts.forEach((color, index) => {
    set(`pie${index + 1}`, color);
    set(`cScale${index}`, color);
  });
  const fontFamily = variableOf('--vscode-font-family');
  if (fontFamily) {
    variables.fontFamily = fontFamily;
  }
  const fontSize = variableOf('--vscode-font-size');
  if (fontSize) {
    variables.fontSize = fontSize;
  }
  return variables;
}

/**
 * hashOf returns the hash of the text of a diagram, as 8 hexadecimal digits.
 * @param text - The text.
 */
function hashOf(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash &= hash;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * messageOf returns the message of an error of Mermaid.
 * @param error - The error.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const { message, str } = error as { message?: unknown; str?: unknown };
    if (typeof message === 'string' && message) {
      return message;
    }
    if (typeof str === 'string' && str) {
      return str;
    }
  }
  return String(error);
}

/** draw draws every diagram of the page: the SVG of Mermaid in the element, or the message of its error. */
async function draw(): Promise<void> {
  const theme = settings.lightModeTheme === 'vscode' ? { theme: 'base' as const, themeVariables: themeVariables() } : { theme: settings.lightModeTheme as 'default', themeVariables: {} };
  mermaid.initialize({ startOnLoad: false, ...theme, maxTextSize: settings.maxTextSize });
  mermaid.registerLayoutLoaders(elkLayouts);
  mermaid.registerLayoutLoaders(tidyTreeLayouts);
  const ids = new Set<string>();
  const drawings = Array.from(document.querySelectorAll<HTMLElement>('.mermaid')).map(async (element) => {
    const source = (element.textContent ?? '').trim();
    if (!source) {
      return;
    }
    let id = `mermaid-${hashOf(source)}`;
    for (let count = 1; ids.has(id); count++) {
      id = `mermaid-${hashOf(source)}-${count}`;
    }
    ids.add(id);
    element.id = id;
    element.innerHTML = '';
    try {
      await mermaid.parse(source);
      const { svg, bindFunctions } = await mermaid.render(`d${id}`, source);
      // The Mermaid extension of VS Code puts the diagram into an area for the movement and the zoom, which the style
      // sheet of the drawings of the page keeps still.
      element.innerHTML = `<div class="mermaid-wrapper"><div class="mermaid-content">${svg}</div></div>`;
      bindFunctions?.(element);
    } catch (error) {
      const message = document.createElement('pre');
      message.className = 'mermaid-error';
      message.innerText = messageOf(error);
      element.replaceChildren(message);
    }
  });
  await Promise.all(drawings);
}

void draw();
