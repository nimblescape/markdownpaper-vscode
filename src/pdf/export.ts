// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The export of a Markdown file to a PDF file on the disk, for the command line and for the command "Export PDF" of
 * the extension ([R-PDF-001](../../docs/requirements.md#r-pdf-001)): the renderer makes the page with the files of
 * the disk, the PlantUML diagrams of nimblescape PlantUML ([R-REN-015](../../docs/requirements.md#r-ren-015)) and
 * Paged.js in the page, the browser prints it, and the PDF gets its metadata. The module uses no API of VS Code.
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Problem } from '../paper/layout';
import type { MarkdownPlugin } from '../paper/markdown';
import { type Extensions, type Reader, type Rendered, render } from '../paper/render';
import { findBrowser } from './browser';
import { finishPdf, printPdf } from './pdf';
import { commandLineOptions, type PlantUmlOptions, plantUmlParts } from './plantUml';

/** fileReader reads the files of the disk by their file URLs. */
export const fileReader: Reader = {
  async read(url) {
    if (!url.startsWith('file:')) {
      return undefined;
    }
    try {
      return await fs.promises.readFile(fileURLToPath(url));
    } catch {
      return undefined;
    }
  },
};

/** Assets are the files of the package that the renderer needs. */
export interface Assets {
  /** layouts is the path of the folder of the built-in layouts. */
  layouts: string;
  /** pagedJs is the path of the file paged.polyfill.js of Paged.js. */
  pagedJs: string;
  /** plantUml is the path of the folder with the files of the page of the npm package @nimblescape/plantuml. */
  plantUml: string;
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
 * folderUrl returns the file URL of a folder, with a slash at its end.
 * @param folder - The path of the folder.
 */
export const folderUrl = (folder: string): string => {
  const url = pathToFileURL(folder).href;
  return url.endsWith('/') ? url : `${url}/`;
};

/**
 * renderFile renders a Markdown file of the disk for the PDF: the page loads the files of the disk, and Paged.js is a
 * part of the page. The PlantUML diagrams come after the parts of the other Markdown extensions.
 * @param file - The path of the Markdown file.
 * @param options - The options.
 */
export async function renderFile(file: string, options: Pick<ExportOptions, 'assets' | 'text' | 'top' | 'extensions' | 'plantUml'>): Promise<Rendered> {
  const text = options.text ?? (await fs.promises.readFile(file, 'utf8'));
  const pagedJs = await fs.promises.readFile(options.assets.pagedJs, 'utf8');
  const plantUml = await plantUmlParts(file, options.assets.plantUml, options.plantUml ?? commandLineOptions(file));
  return render(
    {
      reader: fileReader,
      builtinLayouts: folderUrl(options.assets.layouts),
      ...(options.top ? { top: folderUrl(options.top) } : {}),
      resource: (url) => url,
      sources: 'file:',
      // A script element ends at the first "</script", which the code of Paged.js does not hold; the check keeps it so.
      scripts: [{ text: pagedJs.replace(/<\/script/gi, '<\\/script') }],
      extensions: { styles: [...(options.extensions?.styles ?? []), plantUml.style], scripts: [...(options.extensions?.scripts ?? []), plantUml.script] },
      nonce: randomBytes(16).toString('base64'),
    },
    pathToFileURL(file).href,
    text,
    [...(options.extensions?.plugins ?? []), plantUml.plugin],
    options.extensions?.env,
  );
}

/**
 * exportPdf writes the PDF of a Markdown file.
 * @param file - The path of the Markdown file.
 * @param options - The options.
 */
export async function exportPdf(file: string, options: ExportOptions): Promise<ExportResult> {
  const browser = findBrowser(options.browser);
  const rendered = await renderFile(file, options);
  const errors = rendered.problems.filter((problem) => problem.severity === 'error');
  const output = options.output ?? path.join(path.dirname(file), rendered.pdfName);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'markdownpaper-'));
  try {
    const html = path.join(folder, 'page.html');
    fs.writeFileSync(html, rendered.html, 'utf8');
    if (options.html) {
      fs.mkdirSync(path.dirname(options.html), { recursive: true });
      fs.copyFileSync(html, options.html);
    }
    const printed = await printPdf(browser, html);
    const pdf = await finishPdf(printed.pdf, {
      title: rendered.title,
      ...(rendered.frontMatter?.values.author ? { author: rendered.frontMatter.values.author } : {}),
      ...(rendered.frontMatter?.values.subtitle ? { subject: rendered.frontMatter.values.subtitle } : {}),
      language: rendered.layout.language,
    });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, pdf);
    return { pdf: output, rendered, problems: [...errors, ...rendered.problems.filter((problem) => problem.severity !== 'error')], messages: printed.messages };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
