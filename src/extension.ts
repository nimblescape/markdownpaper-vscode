// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of nimblescape Markdown Paper: the activation starts the checks of the front matter, the context
 * key of paper documents, the format step of the paper in the formatter of Markdown Notes
 * ([formatStep.ts](formatStep.ts)), the parts of the paper in the editor of Markdown Notes
 * ([notesParts.ts](notesParts.ts)) and in its editor of a whole file ([editorParts.ts](editorParts.ts)), the citations from
 * the editor and from Zotero ([cite.ts](cite.ts)), the slash commands of the lists of the special sections
 * ([listCommands.ts](listCommands.ts)), the command mp
 * in the terminals of VS Code ([terminal.ts](terminal.ts)) and the commands, and returns the export of the extension: the markdown-it plugin
 * of the pages in the Markdown preview of VS Code ([markdownPreview.ts](markdownPreview.ts)), which VS Code reads, and
 * the functions that the tests in VS Code read.
 */

import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { citeCommand, citeContext, citeNarrativeCommand, connectZoteroCommand, updateSourcesCommand } from './cite';
import { exportPdfCommand, getCommand, newDocumentCommand, newLayoutCommand, newProjectCommand, openRepositoryCommand } from './commands';
import { registerEditorParts, registerFrontMatterRules } from './editorParts';
import { type FormatStep, PaperFormatStep, registerFormatStep } from './formatStep';
import { FrontMatterChecks } from './frontMatterChecks';
import { ReferenceLinks, referenceLinkSelector } from './referenceLinks';
import { PaperPreview } from './markdownPreview';
import { type SlashCommand } from './notesApi';
import { listCommands } from './listCommands';
import { registerNotesParts, researchCommand } from './notesParts';
import { PaperDocuments } from './paperDocuments';
import { checkedSettings, type Settings, settingsSection } from './settings';
import { setUpTerminals } from './terminal';

/** extensionId is the ID of the extension. */
export const extensionId = 'nimblescape.nimblescape-markdownpaper';

/** commands are the IDs of the commands of the extension. */
export const commands = {
  showPagePreview: 'nimblescape.markdownPaper.showPagePreview',
  exportPdf: 'nimblescape.markdownPaper.exportPdf',
  newProject: 'nimblescape.markdownPaper.newProject',
  newDocument: 'nimblescape.markdownPaper.newDocument',
  newLayout: 'nimblescape.markdownPaper.newLayout',
  getLayoutsAndRepositories: 'nimblescape.markdownPaper.getLayoutsAndRepositories',
  openRepository: 'nimblescape.markdownPaper.openRepository',
  connectZotero: 'nimblescape.markdownPaper.connectZotero',
  updateSources: 'nimblescape.markdownPaper.updateSourcesFromZotero',
};

/** Api is the export of the extension: the plugin for the Markdown preview of VS Code, and a function for the tests. */
export interface Api {
  /** extendMarkdownIt adds the pages of paper documents to the markdown-it instance of the Markdown preview. */
  extendMarkdownIt(md: MarkdownIt): MarkdownIt;
  /** problemsOf returns the warnings of the checks of a file. */
  problemsOf(file: vscode.Uri): readonly vscode.Diagnostic[];
  /** formatStep is the format step of the paper, which the formatter of Markdown Notes runs. */
  formatStep: FormatStep;
  /** research is the slash command `/research`, which Markdown Notes offers on selected text. */
  research: SlashCommand;
  /** cite is the slash command `/cite`, which Markdown Notes offers in the text editor. */
  cite: SlashCommand;
  /** citeNarrative is the slash command `/citenarrative`, a citation in the sentence, which Markdown Notes offers in the text editor. */
  citeNarrative: SlashCommand;
  /** lists are the slash commands `/toc`, `/lof`, `/lot` and `/lol`, which Markdown Notes offers in the text editor. */
  lists: SlashCommand[];
  /** terminalFolder is the folder of the script mp, at the end of the PATH of the terminals, or undefined. */
  terminalFolder?: string;
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
  let terminalFolder: string | undefined;
  try {
    terminalFolder = setUpTerminals(context);
  } catch (error) {
    console.error(`nimblescape Markdown Paper: the command mp in the terminals: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    version: (context.extension.packageJSON as { version?: string }).version,
  };
  const citations = citeContext(context, formatStep);
  const cite = citeCommand(citations);
  const citeNarrative = citeNarrativeCommand(citations);
  const lists = listCommands(formatStep);
  context.subscriptions.push(
    checks,
    papers,
    preview,
    formatStep,
    registerFormatStep(formatStep),
    registerNotesParts([cite, citeNarrative, ...lists]),
    // The part in this extension of the plugin of the paper in the editor of a whole file of Markdown Notes.
    registerEditorParts({ extension: context.extensionUri, citations, openRepository: commands.openRepository }),
    // The rules of the front matter of a paper for the clean editing view of Markdown Notes.
    registerFrontMatterRules(context.extensionUri),
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
    vscode.commands.registerCommand(commands.getLayoutsAndRepositories, (uri?: unknown) => getCommand(commandContext, uri)),
    vscode.commands.registerCommand(commands.openRepository, (uri?: unknown, name?: unknown) => openRepositoryCommand(commandContext, uri, name)),
    vscode.languages.registerDocumentLinkProvider(referenceLinkSelector, new ReferenceLinks(commands.openRepository)),
    vscode.commands.registerCommand(commands.connectZotero, () => connectZoteroCommand(citations)),
    vscode.commands.registerCommand(commands.updateSources, (uri?: unknown) => updateSourcesCommand(citations, uri)),
  );
  return {
    extendMarkdownIt: (md) => preview.extendMarkdownIt(md),
    problemsOf: (file) => checks.problemsOf(file),
    formatStep,
    research: researchCommand,
    cite,
    citeNarrative,
    lists,
    ...(terminalFolder ? { terminalFolder } : {}),
  };
}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
