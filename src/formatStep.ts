// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The format step of the paper in VS Code ([R-CLI-002](../docs/requirements.md#r-cli-002)): the extension adds the
 * steps of the paper to the formatter of Markdown Notes through `registerFormatStep` of its interface
 * ([R-GEN-003](../docs/requirements.md#r-gen-003)), so "Format Document" and the format on save run all steps in one
 * change. The step writes the lists of the special sections of a paper document
 * ([R-REN-004](../docs/requirements.md#r-ren-004)).
 *
 * The formatter of Markdown Notes calls a step at once, and a layout is read from the disk. So the step keeps the
 * layout of each open paper document, read when the document opens and when its front matter or a file of a layout
 * changes. A paper document whose layout is not read yet gets no step; the next format writes its lists.
 */

import * as vscode from 'vscode';
import { notesApi, notesExtensionId } from './notesApi';
import { type FrontMatter, isPaperDocument, readFrontMatter } from './paper/frontMatter';
import type { Layout } from './paper/layout';
import { writeLists } from './paper/lists';
import { documentLayout } from './paper/render';
import { searchHost } from './workspaceHost';

/** FormatStep is a step of the formatter of Markdown Notes, as its src/formatter.ts defines it. */
export interface FormatStep {
  /** applies tells whether the step formats a file. */
  applies(lines: readonly string[], file: vscode.Uri): boolean;
  /** format returns the formatted lines of a file. */
  format(lines: readonly string[], file: vscode.Uri): readonly string[];
}

/** Entry is the layout of a document in the cache, with the key of the front matter that it was read for. */
interface Entry {
  key: string;
  layout?: Layout;
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
    documentLayout(searchHost(this.extension, document.uri), name, frontMatter).then(
      (found) => {
        entry.layout = found.layout;
      },
      () => {
        // Without a layout the step formats nothing; the checks report the problem.
      },
    );
  }

  /**
   * layoutOf returns the layout of a paper document for its lines, when the cache has it.
   * @param lines - The lines of the file.
   * @param file - The URI of the file.
   */
  private layoutOf(lines: readonly string[], file: vscode.Uri): Layout | undefined {
    const text = lines.join('\n');
    if (!isPaperDocument(text)) {
      return undefined;
    }
    const entry = this.layouts.get(file.toString());
    return entry?.key === keyOf(readFrontMatter(text)) ? entry.layout : undefined;
  }

  applies(lines: readonly string[], file: vscode.Uri): boolean {
    return this.layoutOf(lines, file) !== undefined;
  }

  format(lines: readonly string[], file: vscode.Uri): readonly string[] {
    const layout = this.layoutOf(lines, file);
    return layout ? writeLists(lines, layout) : lines;
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}

/**
 * registerFormatStep adds the step to the formatter of Markdown Notes, when Markdown Notes is installed and has the
 * function. Without it, the step does nothing; the command line has `markdownpaper format`.
 * @param step - The step.
 * @returns The registration, which removes the step when it is disposed.
 */
export function registerFormatStep(step: FormatStep): vscode.Disposable {
  let registration: vscode.Disposable | undefined;
  let disposed = false;
  const extension = vscode.extensions.getExtension(notesExtensionId);
  void Promise.resolve(extension?.isActive ? undefined : extension?.activate()).then(
    () => {
      const register = notesApi()?.registerFormatStep;
      if (!disposed && register) {
        registration = register(step);
      }
    },
    () => {
      // Markdown Notes did not start: the paper has no format step in VS Code.
    },
  );
  return new vscode.Disposable(() => {
    disposed = true;
    registration?.dispose();
  });
}
