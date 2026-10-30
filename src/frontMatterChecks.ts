// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The checks of the front matter in the text editor ([R-DOC-002](../docs/requirements.md#r-doc-002) and
 * [R-DOC-003](../docs/requirements.md#r-doc-003)): a Markdown file whose front matter names a layout gets a warning
 * for a layout that does not exist or cannot be read, and for each missing required field, after a pause in typing.
 * The pointer on the key of a field shows its description from `layout.json`. A document of the clean editing view of
 * Markdown Notes gets the checks of its file: the warnings show on the file, and the hover in the view.
 */

import * as vscode from 'vscode';
import { cleanScheme, fileOf } from './notesApi';
import { checkDocument } from './paper/checks';
import type { Problem } from './paper/layout';
import { searchHost } from './workspaceHost';

/** checkDelay is the pause in milliseconds after a change before the checks run. */
const checkDelay = 500;

/**
 * diagnosticOf returns the diagnostic of a problem.
 * @param problem - The problem.
 */
export function diagnosticOf(problem: Problem): vscode.Diagnostic {
  const line = problem.line ?? 0;
  const column = problem.column ?? 0;
  const range = new vscode.Range(line, column, line, column + (problem.length ?? 0));
  const diagnostic = new vscode.Diagnostic(range, problem.message, problem.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
  diagnostic.source = 'Markdown Paper';
  return diagnostic;
}

/** FrontMatterChecks runs the checks of the open Markdown files and shows the descriptions of the fields. */
export class FrontMatterChecks implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('markdownPaper');
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [this.collection];
  /** rendered holds the problems of the renderer of each file, which the page preview reports. */
  private readonly rendered = new Map<string, readonly Problem[]>();
  private readonly checked = new Map<string, readonly Problem[]>();

  constructor(private readonly extension: vscode.Uri) {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.schedule(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.schedule(event.document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.schedule(document)),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.scheme !== cleanScheme) {
          this.collection.delete(document.uri);
          this.checked.delete(document.uri.toString());
          this.rendered.delete(document.uri.toString());
        }
      }),
      vscode.languages.registerHoverProvider({ language: 'markdown' }, { provideHover: (document, position) => this.hover(document, position) }),
    );
    for (const document of vscode.workspace.textDocuments) {
      this.schedule(document);
    }
  }

  /**
   * schedule checks a Markdown document after a pause.
   * @param document - The document.
   */
  private schedule(document: vscode.TextDocument): void {
    if (document.languageId !== 'markdown') {
      return;
    }
    const file = fileOf(document.uri);
    const key = file.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.check(file);
      }, checkDelay),
    );
  }

  /**
   * check checks a file and shows its problems.
   * @param file - The URI of the file.
   */
  async check(file: vscode.Uri): Promise<readonly Problem[]> {
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === file.toString());
    if (!document) {
      return [];
    }
    const checked = await checkDocument(searchHost(this.extension, file), file.toString(), document.getText());
    this.checked.set(file.toString(), checked.problems);
    this.show(file);
    return checked.problems;
  }

  /**
   * report keeps the problems of the renderer of a file, for example a file of the layout that does not exist.
   * @param file - The URI of the file.
   * @param problems - The problems.
   */
  report(file: vscode.Uri, problems: readonly Problem[]): void {
    this.rendered.set(file.toString(), problems);
    this.show(file);
  }

  /**
   * show shows the problems of the checks and of the renderer of a file, each once: a problem that both report has the
   * same message at the same place, and the same message at another place is another problem.
   * @param file - The URI of the file.
   */
  private show(file: vscode.Uri): void {
    const key = file.toString();
    const seen = new Set<string>();
    const problems = [...(this.checked.get(key) ?? []), ...(this.rendered.get(key) ?? [])].filter((problem) => {
      const id = `${problem.file ?? ''}:${problem.line ?? ''}:${problem.column ?? ''}:${problem.message}`;
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
    this.collection.set(file, problems.map(diagnosticOf));
  }

  /**
   * hover returns the description of the field of the front matter under the pointer.
   * @param document - The document.
   * @param position - The position of the pointer.
   */
  private async hover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const file = fileOf(document.uri);
    const checked = await checkDocument(searchHost(this.extension, file), file.toString(), document.getText());
    const frontMatter = checked.frontMatter;
    if (!frontMatter || position.line > frontMatter.end) {
      return undefined;
    }
    const field = frontMatter.fields.find((candidate) => candidate.line === position.line && position.character >= candidate.column && position.character <= candidate.column + candidate.key.length);
    if (!field) {
      return undefined;
    }
    const range = new vscode.Range(field.line, field.column, field.line, field.column + field.key.length);
    if (field.key === 'layout') {
      return checked.layout ? new vscode.Hover(new vscode.MarkdownString(`**Layout ${checked.layout.name}** (${checked.layout.language})`), range) : undefined;
    }
    const spec = checked.layout?.fields[field.key];
    if (!spec) {
      return undefined;
    }
    const text = new vscode.MarkdownString();
    text.appendMarkdown(`**${field.key}**${spec.required ? ' (required)' : ''}\n\n`);
    text.appendText(spec.description);
    if (spec.values) {
      text.appendMarkdown(`\n\nValues: ${spec.values.map((value) => `\`${value}\``).join(', ')}`);
    }
    if (spec.default !== undefined) {
      text.appendMarkdown(`\n\nDefault: \`${spec.default}\``);
    }
    return new vscode.Hover(text, range);
  }

  /**
   * problemsOf returns the shown problems of a file, for the tests.
   * @param file - The URI of the file.
   */
  problemsOf(file: vscode.Uri): readonly vscode.Diagnostic[] {
    return this.collection.get(file) ?? [];
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
