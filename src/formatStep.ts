// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The format step of the paper in VS Code ([R-CLI-002](../docs/requirements.md#r-cli-002)): the extension adds the
 * steps of the paper to the formatter of Markdown Notes through `registerFormatStep` of its interface
 * ([R-GEN-003](../docs/requirements.md#r-gen-003)), so "Format Document" and the format on save run all steps in one
 * change. The step writes the text of the citations and the reference list of a paper document in the citation
 * style of its layout ([R-CITE-004](../docs/requirements.md#r-cite-004)), and then the lists of its special sections
 * ([R-REN-004](../docs/requirements.md#r-ren-004)).
 *
 * The formatter of Markdown Notes calls a step at once, and a layout is read from the disk. So the step keeps the
 * layout of each open paper document and its citation style, read when the document opens and when its front matter
 * or a file of a layout changes. A paper document whose layout is not read yet gets no step; the next format writes
 * its citations and lists.
 */

import * as vscode from 'vscode';
import { registerWithNotes } from './notesApi';
import { type CitationStyle, citationStyleOf } from './paper/csl';
import { formatPaper } from './paper/format';
import { type FrontMatter, isPaperDocument, readFrontMatter } from './paper/frontMatter';
import type { Layout } from './paper/layout';
import { documentLayout } from './paper/render';
import { searchHost } from './workspaceHost';

/** FormatStep is a step of the formatter of Markdown Notes, as its src/formatter.ts defines it. */
export interface FormatStep {
  /** applies tells whether the step formats a file. */
  applies(lines: readonly string[], file: vscode.Uri): boolean;
  /** format returns the formatted lines of a file. */
  format(lines: readonly string[], file: vscode.Uri): readonly string[];
}

/** Entry is the layout of a document and its citation style in the cache, with the key of the front matter that they were read for. */
interface Entry {
  key: string;
  layout?: Layout;
  style?: CitationStyle;
}

/**
 * keyOf returns the key of the fields of a front matter that choose the layout.
 * @param frontMatter - The front matter.
 */
const keyOf = (frontMatter: FrontMatter | undefined): string => `${frontMatter?.values.layout?.trim() ?? ''}\n${frontMatter?.values.lang?.trim() ?? ''}`;

/** PaperFormatStep is the format step of the paper, with the layouts of the open paper documents. */
export class PaperFormatStep implements FormatStep, vscode.Disposable {
  private readonly layouts = new Map<string, Entry>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extension: vscode.Uri) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/layouts/**');
    const reload = () => {
      this.layouts.clear();
      for (const document of vscode.workspace.textDocuments) {
        this.read(document);
      }
    };
    this.disposables.push(
      watcher,
      watcher.onDidChange(reload),
      watcher.onDidCreate(reload),
      watcher.onDidDelete(reload),
      vscode.workspace.onDidOpenTextDocument((document) => this.read(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.read(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.layouts.delete(document.uri.toString())),
    );
    for (const document of vscode.workspace.textDocuments) {
      this.read(document);
    }
  }

  /**
   * read reads the layout of a paper document into the cache when its front matter chooses another layout.
   * @param document - The document.
   */
  private read(document: vscode.TextDocument): void {
    if (document.languageId !== 'markdown' || document.uri.scheme !== 'file') {
      return;
    }
    const name = document.uri.toString();
    const text = document.getText();
    if (!isPaperDocument(text)) {
      this.layouts.delete(name);
      return;
    }
    const frontMatter = readFrontMatter(text);
    const key = keyOf(frontMatter);
    if (this.layouts.get(name)?.key === key) {
      return;
    }
    const entry: Entry = { key };
    this.layouts.set(name, entry);
    const host = searchHost(this.extension, document.uri);
    documentLayout(host, name, frontMatter)
      .then(async (found) => ({ layout: found.layout, style: (await citationStyleOf((url) => host.reader.read(url), found.layout)).style }))
      .then(
      (found) => {
        entry.style = found.style;
        entry.layout = found.layout;
      },
      () => {
        // Without a layout the step formats nothing; the checks report the problem.
      },
    );
  }

  /**
   * entryOf returns the layout of a paper document for its lines and its citation style, when the cache has them; also
   * for the text of a new citation of `/cite`.
   * @param lines - The lines of the file.
   * @param file - The URI of the file.
   */
  entryOf(lines: readonly string[], file: vscode.Uri): { layout: Layout; style: CitationStyle } | undefined {
    const text = lines.join('\n');
    if (!isPaperDocument(text)) {
      return undefined;
    }
    const entry = this.layouts.get(file.toString());
    return entry?.key === keyOf(readFrontMatter(text)) && entry.layout && entry.style ? { layout: entry.layout, style: entry.style } : undefined;
  }

  applies(lines: readonly string[], file: vscode.Uri): boolean {
    return this.entryOf(lines, file) !== undefined;
  }

  format(lines: readonly string[], file: vscode.Uri): readonly string[] {
    const entry = this.entryOf(lines, file);
    return entry ? formatPaper(lines, entry.layout, entry.style) : lines;
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}

/**
 * registerFormatStep adds the step to the formatter of Markdown Notes, when Markdown Notes is installed and has the
 * function. Without it, the step does nothing; the command line has `mp format`.
 * @param step - The step.
 * @returns The registration, which removes the step when it is disposed.
 */
export function registerFormatStep(step: FormatStep): vscode.Disposable {
  return registerWithNotes((api) => api.registerFormatStep?.(step));
}
