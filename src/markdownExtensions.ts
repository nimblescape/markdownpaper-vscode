// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The Markdown extensions of VS Code in the PDF ([R-REN-010](../docs/requirements.md#r-ren-010)): the extensions that
 * contribute to the Markdown preview give the PDF what they give the preview, for example the diagrams of Mermaid and
 * the math of KaTeX. The extension collects, as the Markdown preview of VS Code does:
 *
 * - the markdown-it plugins of the extensions with `markdown.markdownItPlugins`, from `extendMarkdownIt` of their
 *   export after their activation;
 * - their style sheets of `markdown.previewStyles`, as texts whose addresses name the files of the disk;
 * - their scripts of `markdown.previewScripts`, also ECMAScript modules.
 *
 * It leaves out the Markdown extension of VS Code itself, whose style sheets are those of the preview, Markdown Notes,
 * because the PDF shows no notes ([R-REN-002](../docs/requirements.md#r-ren-002)), and this extension.
 */

import * as vscode from 'vscode';
import { notesExtensionId } from './notesApi';
import type { MarkdownPlugin } from './paper/markdown';
import { rewriteCss, type Script } from './paper/render';
import type { MarkdownExtensions } from './pdf/export';

/** markdownExtensionId is the ID of the Markdown extension of VS Code, which holds the Markdown preview. */
const markdownExtensionId = 'vscode.markdown-language-features';

/** Contributes is the part of the manifest of an extension that adds to the Markdown preview. */
interface Contributes {
  'markdown.markdownItPlugins'?: boolean;
  'markdown.previewStyles'?: string[];
  'markdown.previewScripts'?: (string | { path: string; type?: string })[];
}

/** MarkdownExports is the export of an extension with a markdown-it plugin. */
interface MarkdownExports {
  extendMarkdownIt?: MarkdownPlugin;
}

const decoder = new TextDecoder();

/**
 * markdownExtensions returns the markdown-it plugins, the style sheets and the scripts of the Markdown extensions of
 * VS Code for the PDF. An extension that does not start or a file that cannot be read is left out.
 * @param own - The folder of this extension, which is left out.
 */
export async function markdownExtensions(own: vscode.Uri): Promise<MarkdownExtensions> {
  const plugins: MarkdownPlugin[] = [];
  const styles: string[] = [];
  const scripts: Script[] = [];
  for (const extension of vscode.extensions.all) {
    if (extension.id === markdownExtensionId || extension.id === notesExtensionId || extension.extensionUri.toString() === own.toString()) {
      continue;
    }
    const contributes = ((extension.packageJSON as { contributes?: Contributes }).contributes ?? {}) satisfies Contributes;
    if (contributes['markdown.markdownItPlugins']) {
      try {
        const exports = (extension.isActive ? extension.exports : await extension.activate()) as MarkdownExports | undefined;
        const extend = exports?.extendMarkdownIt;
        if (typeof extend === 'function') {
          plugins.push((md) => extend.call(exports, md));
        }
      } catch {
        // An extension that does not start gives nothing, as in the Markdown preview.
      }
    }
    for (const style of contributes['markdown.previewStyles'] ?? []) {
      const file = vscode.Uri.joinPath(extension.extensionUri, style);
      try {
        styles.push(rewriteCss(decoder.decode(await vscode.workspace.fs.readFile(file)), file.toString(), (url) => url));
      } catch {
        // A missing file gives nothing.
      }
    }
    for (const script of contributes['markdown.previewScripts'] ?? []) {
      const relative = typeof script === 'string' ? script : script.path;
      scripts.push({ src: vscode.Uri.joinPath(extension.extensionUri, relative).toString(), module: typeof script !== 'string' && script.type === 'module' });
    }
  }
  return { plugins, styles, scripts };
}
