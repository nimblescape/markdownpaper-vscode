// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of nimblescape Markdown Paper: the activation starts the checks of the front matter, the context
 * key of paper documents, the format step of the paper in the formatter of Markdown Notes
 * ([formatStep.ts](formatStep.ts)) and the commands, and returns the export of the extension: the markdown-it plugin
 * of the pages in the Markdown preview of VS Code ([markdownPreview.ts](markdownPreview.ts)), which VS Code reads, and
 * the functions that the tests in VS Code read.
 */

import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { exportPdfCommand, newDocumentCommand, newLayoutCommand, newProjectCommand } from './commands';
import { type FormatStep, PaperFormatStep, registerFormatStep } from './formatStep';
import { FrontMatterChecks } from './frontMatterChecks';
import { PaperPreview } from './markdownPreview';
import { PaperDocuments } from './paperDocuments';
import { checkedSettings, type Settings, settingsSection } from './settings';

/** extensionId is the ID of the extension. */
export const extensionId = 'nimblescape.nimblescape-markdownpaper';

/** commands are the IDs of the commands of the extension. */
export const commands = {
  showPagePreview: 'nimblescape.markdownPaper.showPagePreview',
  exportPdf: 'nimblescape.markdownPaper.exportPdf',
  newProject: 'nimblescape.markdownPaper.newProject',
  newDocument: 'nimblescape.markdownPaper.newDocument',
  newLayout: 'nimblescape.markdownPaper.newLayout',
};

/** Api is the export of the extension: the plugin for the Markdown preview of VS Code, and a function for the tests. */
export interface Api {
  /** extendMarkdownIt adds the pages of paper documents to the markdown-it instance of the Markdown preview. */
  extendMarkdownIt(md: MarkdownIt): MarkdownIt;
  /** problemsOf returns the warnings of the checks of a file. */
  problemsOf(file: vscode.Uri): readonly vscode.Diagnostic[];
  /** formatStep is the format step of the paper, which the formatter of Markdown Notes runs. */
  formatStep: FormatStep;
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
  const formatStep = new PaperFormatStep(context.extensionUri);
  const preview = new PaperPreview(
    context.extensionUri,
    () => readSettings().previewDelay,
    (file, problems) => checks.report(file, problems),
  );
  const commandContext = {
    extension: context.extensionUri,
    browserPath: () => readSettings().browserPath,
    openPdf: () => readSettings().openPdf,
    previewFile: () => preview.fileOfActive(),
  };
  context.subscriptions.push(
    checks,
    papers,
    preview,
    formatStep,
    registerFormatStep(formatStep),
    // "Show Page Preview": the Markdown preview of VS Code beside the text editor, which shows the pages of a paper.
    vscode.commands.registerCommand(commands.showPagePreview, async (uri?: unknown) => {
      const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showWarningMessage('Show Page Preview: open a Markdown file first.');
        return;
      }
      await vscode.commands.executeCommand('markdown.showPreviewToSide', target);
    }),
    vscode.commands.registerCommand(commands.exportPdf, (uri?: unknown) => exportPdfCommand(commandContext, uri)),
    vscode.commands.registerCommand(commands.newProject, (uri?: unknown) => newProjectCommand(commandContext, uri)),
    vscode.commands.registerCommand(commands.newDocument, (uri?: unknown) => newDocumentCommand(commandContext, uri)),
    vscode.commands.registerCommand(commands.newLayout, (uri?: unknown) => newLayoutCommand(commandContext, uri)),
  );
  return {
    extendMarkdownIt: (md) => preview.extendMarkdownIt(md),
    problemsOf: (file) => checks.problemsOf(file),
    formatStep,
  };
}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
