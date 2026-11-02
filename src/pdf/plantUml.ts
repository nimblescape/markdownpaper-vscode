// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The PlantUML diagrams of the PDF ([R-REN-015](../../docs/requirements.md#r-ren-015)), in VS Code and on the command
 * line: the renderer of the extension nimblescape PlantUML, from its npm package `@nimblescape/plantuml`, draws them as
 * the Markdown preview of VS Code shows them with the extension. Its markdown-it plugin writes each PlantUML block
 * with the settings of the extension and the files that its diagrams include; the script of its page renders the
 * diagrams as SVG with the engine of the package, in the page of the PDF; the page copies them out of their shadow
 * roots before Paged.js makes the pages (media/paperHandlers.js). The build copies the files of the page of the package
 * into the folder `plantuml` of the assets (esbuild.mjs). The module uses no API of VS Code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extendMarkdownIt, readIncludedFiles, readSettings, type Settings } from '@nimblescape/plantuml';
import type { MarkdownPlugin } from '../paper/markdown';
import { rewriteCss, type Script } from '../paper/render';
import { workspaceFolderOf } from './workspace';

/** PlantUmlOptions are the settings of nimblescape PlantUML and the folders of the files that the diagrams include. */
export interface PlantUmlOptions {
  settings: Readonly<Settings>;
  /**
   * folders are the folders whose files the diagrams may include besides the folder of the document, as nimblescape
   * PlantUML reads the files of the workspace folders of VS Code only.
   */
  folders: readonly string[];
}

/** PlantUmlParts are the parts of the page of the PDF for the PlantUML diagrams. */
export interface PlantUmlParts {
  plugin: MarkdownPlugin;
  /** style is the style sheet of the blocks. */
  style: string;
  /** script is the script of the page, which renders the diagrams of the blocks. */
  script: Script;
}

/**
 * commandLineOptions returns the options of nimblescape PlantUML on the command line: the settings of the file
 * `.vscode/settings.json` of the workspace folder of the document, whose files the diagrams may include.
 * @param file - The path of the Markdown file.
 */
export function commandLineOptions(file: string): PlantUmlOptions {
  const folder = workspaceFolderOf(file);
  return { settings: readSettings(folder), folders: [folder] };
}

/**
 * plantUmlParts returns the markdown-it plugin, the style sheet and the script of nimblescape PlantUML for the page of
 * the PDF of a Markdown file.
 * @param file - The path of the Markdown file.
 * @param folder - The path of the folder with the files of the page of the package: markdownPreview.js,
 *   markdownPreview.css and the folder engine/.
 * @param options - The settings and the folders of the included files.
 */
export async function plantUmlParts(file: string, folder: string, options: PlantUmlOptions): Promise<PlantUmlParts> {
  const css = path.join(folder, 'markdownPreview.css');
  return {
    plugin: (md) =>
      extendMarkdownIt(
        md,
        () => options.settings,
        (_rendering, source) => readIncludedFiles(file, source, options.folders),
      ),
    style: rewriteCss(await fs.promises.readFile(css, 'utf8'), pathToFileURL(css).href, (url) => url),
    script: { src: pathToFileURL(path.join(folder, 'markdownPreview.js')).href, module: true },
  };
}
