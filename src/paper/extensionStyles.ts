// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The style of the drawings of the Markdown extensions of VS Code on the pages
 * ([R-PRV-005](../../docs/requirements.md#r-prv-005), [R-REN-010](../../docs/requirements.md#r-ren-010)):
 *
 * - The colors of the theme of VS Code, which the scripts of the extensions read for their drawings, for example the
 *   diagrams of Mermaid with its theme "vscode". The pages are white paper, so the values are those of the theme
 *   "Light Modern" of VS Code.
 * - The diagrams of Mermaid without the parts for the screen: Mermaid puts a diagram into an area that the mouse moves
 *   and zooms, moved to the middle of the width at the time of the drawing, with buttons. On a page the diagram stands
 *   in the middle of the text, as wide as the text at most, without the buttons.
 *
 * The page of the PDF gets this style sheet; the Markdown preview gets the same rules from media/paperPreview.css,
 * which a test compares with this module.
 */

/** lightThemeColors are the CSS variables of the theme with their values. */
export const lightThemeColors: Readonly<Record<string, string>> = {
  '--vscode-foreground': '#3b3b3b',
  '--vscode-editor-background': '#ffffff',
  '--vscode-editor-foreground': '#3b3b3b',
  '--vscode-editorWidget-background': '#f8f8f8',
  '--vscode-editorWidget-border': '#c8c8c8',
  '--vscode-focusBorder': '#005fb8',
  '--vscode-editorError-foreground': '#e51400',
  '--vscode-editorError-background': 'transparent',
  '--vscode-input-background': '#ffffff',
  '--vscode-input-border': '#cecece',
  '--vscode-input-foreground': '#3b3b3b',
  '--vscode-inputValidation-errorBackground': '#f2dede',
  '--vscode-textBlockQuote-background': '#f8f8f8',
  '--vscode-textBlockQuote-border': '#e5e5e5',
  '--vscode-charts-foreground': '#3b3b3b',
  '--vscode-charts-lines': 'rgba(59, 59, 59, 0.5)',
  '--vscode-chart-line': '#616161',
  '--vscode-charts-red': '#e51400',
  '--vscode-charts-blue': '#1a85ff',
  '--vscode-charts-yellow': '#bf8803',
  '--vscode-charts-orange': '#d18616',
  '--vscode-charts-green': '#388a34',
  '--vscode-charts-purple': '#652d90',
};

/** drawingsCss are the rules for the diagrams of Mermaid on a page. */
export const drawingsCss = `.mermaid-wrapper {
  height: auto !important;
  overflow: visible !important;
}
.mermaid-content {
  transform: none !important;
  text-align: center;
}
.mermaid-zoom-controls,
.mermaid-resize-handle {
  display: none !important;
}`;

/** extensionCss is the style sheet of the drawings of the extensions for the page of the PDF. */
export const extensionCss = `:root {\n${Object.entries(lightThemeColors)
  .map(([name, value]) => `  ${name}: ${value};`)
  .join('\n')}\n}\n${drawingsCss}`;
