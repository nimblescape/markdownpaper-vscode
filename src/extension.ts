// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of nimblescape Markdown Paper: the activation starts the checks of the front matter, the page
 * previews and the commands, and returns the export of the extension, which the tests in VS Code read.
 */

import * as vscode from 'vscode';
import { exportPdfCommand, newDocumentCommand, newLayoutCommand, newProjectCommand } from './commands';
import { FrontMatterChecks } from './frontMatterChecks';
import { fileOf } from './notesApi';
import { PagePreviews } from './pagePreview';
import { PaperDocuments } from './paperDocuments';
import { checkedSettings, type Settings, settingsSection } from './settings';

/** extensionId is the ID of the extension. */
export const extensionId = 'nimblescape.nimblescape-markdownpaper';

/** commands are the IDs of the commands of the extension. */
export const commands = {
  showPagePreview: 'nimblescape.markdownPaper.showPagePreview',
  togglePagePreview: 'nimblescape.markdownPaper.togglePagePreview',
  openPreview: 'nimblescape.markdownPaper.openPreview',
  exportPdf: 'nimblescape.markdownPaper.exportPdf',
  newProject: 'nimblescape.markdownPaper.newProject',
  newDocument: 'nimblescape.markdownPaper.newDocument',
  newLayout: 'nimblescape.markdownPaper.newLayout',
};

/** Api is the export of the extension, for the tests in VS Code. */
export interface Api {
  /** pagesOf returns the number of the pages of the page preview of a file, or undefined without a preview. */
  pagesOf(file: vscode.Uri): number | undefined;
  /** problemsOf returns the warnings of the checks of a file. */
  problemsOf(file: vscode.Uri): readonly vscode.Diagnostic[];
}

/**
 * readSettings reads the settings of the extension.
 * @param scope - The document of the settings, or undefined for the window.
 */
export function readSettings(scope?: vscode.Uri): Settings {
  const configuration = vscode.workspace.getConfiguration(settingsSection, scope);
  return checkedSettings((key) => configuration.get(key));
}

/**
 * activate starts the extension.
 * @param context - The context of the extension.
 * @returns The export of the extension.
 */
export function activate(context: vscode.ExtensionContext): Api {
  const checks = new FrontMatterChecks(context.extensionUri);
  const papers = new PaperDocuments();
  const previews = new PagePreviews(
    context.extensionUri,
    () => readSettings().previewDelay,
    (file, problems) => checks.report(file, problems),
  );
  const commandContext = {
    extension: context.extensionUri,
    browserPath: () => readSettings().browserPath,
    openPdf: () => readSettings().openPdf,
    previewFile: () => previews.fileOfActive(),
  };
  /** The text document from which Ctrl+Shift+V opened the page preview of a file, to which the key goes back. */
  const toggledFrom = new Map<string, vscode.Uri>();
  context.subscriptions.push(
    checks,
    papers,
    previews,
    vscode.commands.registerCommand(commands.showPagePreview, async (uri?: unknown) => {
      const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showWarningMessage('Show Page Preview: open a Markdown file first.');
        return;
      }
      await previews.show(fileOf(target));
    }),
    // Ctrl+Shift+V of a paper document: the page preview in the group of the text editor, and back to the text.
    vscode.commands.registerCommand(commands.togglePagePreview, async () => {
      const shown = previews.fileOfActive();
      if (shown) {
        const back = toggledFrom.get(shown.toString()) ?? shown;
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(back), { viewColumn: vscode.ViewColumn.Active });
        return;
      }
      const target = vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        return;
      }
      toggledFrom.set(fileOf(target).toString(), target);
      await previews.show(target, 'active');
    }),
    // "Open Preview" of the context menus, while the extension hides the item of VS Code: the page preview of a paper
    // document, and the Markdown preview of VS Code for another file.
    vscode.commands.registerCommand(commands.openPreview, async (uri?: unknown) => {
      const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        return;
      }
      if (await papers.isPaper(fileOf(target))) {
        await previews.show(target, 'active');
      } else {
        await vscode.commands.executeCommand('markdown.showPreview', target);
      }
    }),
    vscode.commands.registerCommand(commands.exportPdf, (uri?: unknown) => exportPdfCommand(commandContext, uri)),
    vscode.commands.registerCommand(commands.newProject, (uri?: unknown) => newProjectCommand(commandContext, uri)),
    vscode.commands.registerCommand(commands.newDocument, (uri?: unknown) => newDocumentCommand(commandContext, uri)),
    vscode.commands.registerCommand(commands.newLayout, (uri?: unknown) => newLayoutCommand(commandContext, uri)),
  );
  return {
    pagesOf: (file) => previews.pagesOf(file),
    problemsOf: (file) => checks.problemsOf(file),
  };
}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
