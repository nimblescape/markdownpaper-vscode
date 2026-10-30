// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The page preview ([R-PRV-001](../docs/requirements.md#r-prv-001) to [R-PRV-004](../docs/requirements.md#r-prv-004)):
 * a webview beside the text editor that shows the pages of a Markdown file in its layout, as the PDF prints them. The
 * renderer makes the page with the files of the workspace; Paged.js makes the pages in the webview. After a pause in
 * typing, and after a change of a file of the layout, the script of the webview makes the new pages beside the old
 * ones and then shows them, so the pages do not flicker. A click on a page shows its line in the text editor. Each
 * file has one preview; "Show Page Preview" shows it again.
 */

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { fileOf, textOf } from './notesApi';
import type { Problem } from './paper/layout';
import { folderOf, type Rendered, render } from './paper/render';
import { escapeHtml } from './paper/template';
import { searchHost } from './workspaceHost';

/** previewType is the view type of the webview of the page preview. */
export const previewType = 'nimblescape.markdownPaper.pagePreview';

/** Message is a message of the script of the webview. */
type Message = { type: 'reveal'; line: number } | { type: 'link'; href: string } | { type: 'rendered'; pages: number } | { type: 'error'; message: string };

/** Preview is the page preview of one file. */
class Preview implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private rendered: Rendered | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private loaded = false;
  /** pages is the number of the pages of the last rendering, for the tests. */
  pages = 0;

  constructor(
    readonly file: vscode.Uri,
    readonly panel: vscode.WebviewPanel,
    private readonly extension: vscode.Uri,
    private readonly delay: () => number,
    private readonly report: (file: vscode.Uri, problems: readonly Problem[]) => void,
    private readonly onDispose: () => void,
  ) {
    panel.iconPath = vscode.Uri.joinPath(extension, 'resources', 'page-preview.svg');
    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((message: Message) => this.receive(message)),
    );
  }

  /** layoutFolder is the URL of the folder of the layout of the last rendering. */
  get layoutFolder(): string | undefined {
    return this.rendered?.layout.folder;
  }

  /**
   * schedule renders the pages again after the pause of the setting.
   * @param now - True to render at once.
   */
  schedule(now = false): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.update(), now ? 0 : this.delay());
  }

  /** update renders the pages and gives them to the webview. */
  async update(): Promise<void> {
    const webview = this.panel.webview;
    const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri);
    const host = searchHost(this.extension, this.file);
    let rendered: Rendered;
    try {
      rendered = await render(
        {
          ...host,
          resource: (url) => webview.asWebviewUri(vscode.Uri.parse(url, true)).toString(),
          sources: webview.cspSource,
          scripts: [{ src: webview.asWebviewUri(vscode.Uri.joinPath(this.extension, 'media', 'paged.polyfill.js')).toString() }, { src: webview.asWebviewUri(vscode.Uri.joinPath(this.extension, 'media', 'pagePreview.js')).toString() }],
          screenStyles: [webview.asWebviewUri(vscode.Uri.joinPath(this.extension, 'media', 'pagePreview.css')).toString()],
          nonce: randomBytes(16).toString('base64'),
        },
        this.file.toString(),
        await textOf(this.file),
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`Page preview: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    this.rendered = rendered;
    this.report(this.file, rendered.problems);
    const layout = vscode.Uri.parse(rendered.layout.folder, true);
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extension, 'media'), vscode.Uri.joinPath(this.extension, 'layouts'), vscode.Uri.parse(folderOf(this.file.toString()), true), layout, ...folders],
    };
    this.panel.title = `Pages: ${this.file.path.split('/').pop() ?? ''}`;
    if (this.loaded) {
      await webview.postMessage({ type: 'update', html: rendered.html });
    } else {
      // The script of the webview keeps the file in the state of the webview, from which VS Code restores the preview.
      webview.html = rendered.html.replace('<head>', `<head>\n<meta name="paper-file" content="${escapeHtml(this.file.toString())}">`);
      this.loaded = true;
    }
  }

  /**
   * receive handles a message of the script of the webview.
   * @param message - The message.
   */
  private async receive(message: Message): Promise<void> {
    if (message.type === 'rendered') {
      this.pages = message.pages;
    } else if (message.type === 'reveal') {
      await reveal(this.file, message.line);
    } else if (message.type === 'link') {
      if (/^(?:https?|mailto):/i.test(message.href)) {
        await vscode.env.openExternal(vscode.Uri.parse(message.href, true));
      }
    } else if (message.type === 'error') {
      void vscode.window.showWarningMessage(`Page preview: ${message.message}`);
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.panel.dispose();
    this.onDispose();
  }
}

/**
 * reveal shows a line of a file in its text editor, or in a text editor of its clean editing view, which has its own
 * lines; else it opens the file beside the preview.
 * @param file - The URI of the file.
 * @param line - The line, counted from 0.
 */
async function reveal(file: vscode.Uri, line: number): Promise<void> {
  const editor = vscode.window.visibleTextEditors.find((candidate) => candidate.document.uri.toString() === file.toString());
  const document = editor?.document ?? (await vscode.workspace.openTextDocument(file));
  const target = Math.min(Math.max(line, 0), document.lineCount - 1);
  const position = new vscode.Position(target, 0);
  const shown = await vscode.window.showTextDocument(document, { viewColumn: editor?.viewColumn ?? vscode.ViewColumn.One, preserveFocus: false, selection: new vscode.Range(position, position) });
  shown.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/** PagePreviews are the page previews of the open files. */
export class PagePreviews implements vscode.Disposable {
  private readonly previews = new Map<string, Preview>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extension: vscode.Uri,
    private readonly delay: () => number,
    private readonly report: (file: vscode.Uri, problems: readonly Problem[]) => void,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.changed(event.document.uri)),
      vscode.workspace.onDidSaveTextDocument((document) => this.changed(document.uri)),
      vscode.window.registerWebviewPanelSerializer(previewType, {
        deserializeWebviewPanel: async (panel: vscode.WebviewPanel, state: unknown) => {
          const file = typeof (state as { file?: unknown })?.file === 'string' ? vscode.Uri.parse((state as { file: string }).file, true) : undefined;
          if (!file) {
            panel.dispose();
            return;
          }
          await this.adopt(file, panel).update();
        },
      }),
    );
  }

  /**
   * changed renders again each preview of a changed file: the file itself or a file of its layout.
   * @param uri - The URI of the changed document.
   */
  private changed(uri: vscode.Uri): void {
    const file = fileOf(uri).toString();
    for (const preview of this.previews.values()) {
      if (preview.file.toString() === file || (preview.layoutFolder && uri.toString().startsWith(preview.layoutFolder))) {
        preview.schedule();
      }
    }
  }

  /**
   * adopt makes the preview of a file in a panel.
   * @param file - The URI of the file.
   * @param panel - The panel.
   */
  private adopt(file: vscode.Uri, panel: vscode.WebviewPanel): Preview {
    const key = file.toString();
    const preview = new Preview(file, panel, this.extension, this.delay, this.report, () => this.previews.delete(key));
    this.previews.set(key, preview);
    return preview;
  }

  /**
   * show shows the page preview of a document beside its editor, and makes it when it does not exist.
   * @param document - The URI of the document, or of a document of the clean editing view.
   */
  async show(document: vscode.Uri): Promise<void> {
    const file = fileOf(document);
    const existing = this.previews.get(file.toString());
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      existing.schedule(true);
      return;
    }
    const panel = vscode.window.createWebviewPanel(previewType, `Pages: ${file.path.split('/').pop() ?? ''}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    await this.adopt(file, panel).update();
  }

  /**
   * fileOfActive returns the file of the active page preview, if one is active.
   */
  fileOfActive(): vscode.Uri | undefined {
    return [...this.previews.values()].find((preview) => preview.panel.active)?.file;
  }

  /**
   * pagesOf returns the number of the pages of the preview of a file, for the tests.
   * @param file - The URI of the file.
   */
  pagesOf(file: vscode.Uri): number | undefined {
    return this.previews.get(file.toString())?.pages;
  }

  dispose(): void {
    for (const preview of [...this.previews.values()]) {
      preview.dispose();
    }
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
