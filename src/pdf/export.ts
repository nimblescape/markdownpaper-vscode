// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The export of a Markdown file to a PDF file on the disk, for the command line and for the command "Export PDF" of
 * the extension ([R-PDF-001](../../docs/requirements.md#r-pdf-001)): the renderer makes the page with the files of
 * the disk, the PlantUML diagrams of nimblescape PlantUML ([R-REN-015](../../docs/requirements.md#r-ren-015)), on the
 * command line the diagrams of Mermaid ([R-REN-016](../../docs/requirements.md#r-ren-016)), and Paged.js in the page,
 * and `printPage` of `@nimblescape/markdownlayout/pdf` prints it with the browser and gives the PDF its metadata
 * ([R-GEN-010](../../docs/requirements.md#r-gen-010)). The module uses no API of VS Code.
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Problem } from '@nimblescape/markdownlayout';
import { fileReader, folderUrl, printPage } from '@nimblescape/markdownlayout/pdf';
import type { MarkdownPlugin } from '../paper/markdown';
import { type Extensions, type Rendered, render } from '../paper/render';
import { findBrowser, NoBrowserError } from './browser';
import { type MermaidParts, mermaidParts, mermaidSettingsOf } from './mermaid';
import { commandLineOptions, type PlantUmlOptions, type PlantUmlParts, plantUmlParts } from './plantUml';
import { workspaceFolderOf, workspaceSettings } from './workspace';

export { fileReader, folderUrl } from '@nimblescape/markdownlayout/pdf';

/** Assets are the files of the package that the renderer needs. */
export interface Assets {
  /** layouts is the path of the folder of the built-in layouts. */
  layouts: string;
  /** pagedJs is the path of the file paged.polyfill.js of Paged.js. */
  pagedJs: string;
  /** plantUml is the path of the folder with the files of the page of the npm package @nimblescape/plantuml. */
  plantUml: string;
  /**
   * mermaid is the path of the folder with the script of the page that draws the diagrams of Mermaid, for a PDF
   * without the Markdown extensions of VS Code; the command line has it, the extension not.
   */
  mermaid?: string;
}

/**
 * MarkdownExtensions are the parts of the Markdown extensions of VS Code for the PDF
 * ([R-REN-010](../../docs/requirements.md#r-ren-010)): their markdown-it plugins, style sheets and scripts.
 */
export interface MarkdownExtensions extends Extensions {
  plugins: readonly MarkdownPlugin[];
  /**
   * env holds the values that the plugins find in the environment of markdown-it, as in the Markdown preview of
   * VS Code: `currentDocument`, the URI of the document, by which nimblescape PlantUML finds its settings and the files
   * that its diagrams include.
   */
  env?: Readonly<Record<string, unknown>>;
}

/** ExportOptions are the options of an export. */
export interface ExportOptions {
  assets: Assets;
  /** text is the text of the Markdown file, with unsaved changes; undefined reads the file. */
  text?: string;
  /** output is the path of the PDF file; undefined writes it beside the Markdown file, with the name of the layout. */
  output?: string;
  /** html is the path of a file for the HTML page, for a look at the page; undefined keeps none. */
  html?: string;
  /** browser is the path of the program of the browser; empty searches an installed browser. */
  browser?: string;
  /**
   * download gets a browser when none is installed or downloaded, for example after a question, and returns its
   * program, or undefined when the person does not want the download ([R-PDF-002](../../docs/requirements.md#r-pdf-002)).
   */
  download?: () => Promise<string | undefined>;
  /** top is the path of the top folder of the search for a layout. */
  top?: string;
  /** extensions are the parts of the Markdown extensions of VS Code; the command line has none. */
  extensions?: MarkdownExtensions;
  /**
   * plantUml are the settings of nimblescape PlantUML and the folders of the files that its diagrams include, in
   * VS Code those of the workspace; undefined reads them as the command line does (`commandLineOptions`).
   */
  plantUml?: PlantUmlOptions;
}

/** ExportResult is the result of an export. */
export interface ExportResult {
  pdf: string;
  rendered: Rendered;
  problems: Problem[];
  /** messages are the errors and warnings of the page. */
  messages: string[];
}

/**
 * pagePlugins returns the markdown-it plugins of the page of the PDF: those of the Markdown extensions of VS Code, then
 * the one of the diagrams of Mermaid of the command line, if any, then the one of the PlantUML diagrams. The pages of
 * the Markdown preview take the same plugins ([R-PRV-005](../../docs/requirements.md#r-prv-005)).
 * @param extensions - The parts of the Markdown extensions of VS Code, if any.
 * @param plantUml - The parts of the PlantUML diagrams.
 * @param mermaid - The parts of the diagrams of Mermaid of the command line, if any.
 */
export function pagePlugins(extensions: MarkdownExtensions | undefined, plantUml: PlantUmlParts, mermaid?: MermaidParts): MarkdownPlugin[] {
  return [...(extensions?.plugins ?? []), ...(mermaid ? [mermaid.plugin] : []), plantUml.plugin];
}

/**
 * pageExtensions returns the style sheets and the scripts of the extensions in the page of the PDF: those of the
 * Markdown extensions of VS Code, then those of the diagrams of Mermaid of the command line, if any, and of the
 * PlantUML diagrams. The pages of the Markdown preview take the same style sheets.
 * @param extensions - The parts of the Markdown extensions of VS Code, if any.
 * @param plantUml - The parts of the PlantUML diagrams.
 * @param mermaid - The parts of the diagrams of Mermaid of the command line, if any.
 */
export function pageExtensions(extensions: MarkdownExtensions | undefined, plantUml: PlantUmlParts, mermaid?: MermaidParts): Extensions {
  return {
    styles: [...(extensions?.styles ?? []), plantUml.style],
    scripts: [...(extensions?.scripts ?? []), ...(mermaid?.scripts ?? []), plantUml.script],
  };
}

/**
 * renderFile renders a Markdown file of the disk for the PDF: the page loads the files of the disk, and Paged.js is a
 * part of the page. The PlantUML diagrams come after the parts of the other Markdown extensions. Without these
 * extensions, as on the command line, the page draws the diagrams of Mermaid itself, with the settings of the
 * workspace folder of the document.
 * @param file - The path of the Markdown file.
 * @param options - The options.
 */
export async function renderFile(file: string, options: Pick<ExportOptions, 'assets' | 'text' | 'top' | 'extensions' | 'plantUml'>): Promise<Rendered> {
  const text = options.text ?? (await fs.promises.readFile(file, 'utf8'));
  const pagedJs = await fs.promises.readFile(options.assets.pagedJs, 'utf8');
  const plantUml = await plantUmlParts(file, options.assets.plantUml, options.plantUml ?? commandLineOptions(file));
  const mermaid = !options.extensions && options.assets.mermaid ? mermaidParts(options.assets.mermaid, mermaidSettingsOf(workspaceSettings(workspaceFolderOf(file)))) : undefined;
  return render(
    {
      reader: fileReader,
      builtinLayouts: folderUrl(options.assets.layouts),
      ...(options.top ? { top: folderUrl(options.top) } : {}),
      resource: (url) => url,
      sources: 'file:',
      scripts: [{ text: pagedJs }],
      extensions: pageExtensions(options.extensions, plantUml, mermaid),
      nonce: randomBytes(16).toString('base64'),
    },
    pathToFileURL(file).href,
    text,
    pagePlugins(options.extensions, plantUml, mermaid),
    options.extensions?.env,
  );
}

/**
 * exportPdf writes the PDF of a Markdown file.
 * @param file - The path of the Markdown file.
 * @param options - The options.
 */
export async function exportPdf(file: string, options: ExportOptions): Promise<ExportResult> {
  let browser: string;
  try {
    browser = findBrowser(options.browser);
  } catch (error) {
    const downloaded = error instanceof NoBrowserError && options.download ? await options.download() : undefined;
    if (!downloaded) {
      throw error;
    }
    browser = downloaded;
  }
  const rendered = await renderFile(file, options);
  const errors = rendered.problems.filter((problem) => problem.severity === 'error');
  const output = options.output ?? path.join(path.dirname(file), rendered.pdfName);
  const printed = await printPage(rendered.page, {
    browser,
    ...(options.html ? { html: options.html } : {}),
    creator: 'nimblescape Markdown Paper',
    producer: 'nimblescape Markdown Paper with Paged.js and Chromium',
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, printed.pdf);
  return { pdf: output, rendered, problems: [...errors, ...rendered.problems.filter((problem) => problem.severity !== 'error')], messages: printed.messages };
}
