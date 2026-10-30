// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The pages in the Markdown preview of VS Code ([R-PRV-001](../docs/requirements.md#r-prv-001) to
 * [R-PRV-006](../docs/requirements.md#r-prv-006)): the markdown-it plugin that the extension gives VS Code
 * (`extendMarkdownIt`, `markdown.markdownItPlugins`). VS Code renders a document in two steps: it parses the text,
 * without the document in the environment, and keeps the tokens of each version; then it renders the tokens, with the
 * document and the addresses of the webview in the environment.
 *
 * - The parsing of a paper document ([R-DOC-004](../docs/requirements.md#r-doc-004)) finds its open document by its
 *   text, and its layout in a cache. The plugin of the renderer ([markdown.ts](paper/markdown.ts)) adds its steps and a
 *   first token with the layout and what it found. The front matter, which VS Code shows as a table, leaves the text:
 *   its fields fill the templates of the layout. The headings keep the IDs of the renderer.
 * - The rendering of these tokens puts a hidden element `.nimblescape-paper` first, with the style sheets, the filled
 *   templates and the fields of the layout, whose addresses the webview loads. The script of the pages
 *   ([media/paperPreview.js](../media/paperPreview.js)) makes the pages from it.
 * - A layout that is not in the cache yet: the extension reads it, and the preview shows "Making the pages …" until
 *   then. After a change of a file of a layout, the extension reads the layout again. Then it lets VS Code render
 *   the previews again (`markdown.preview.refresh`).
 * - A notes document keeps the preview of VS Code: the plugin changes nothing.
 */

import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import * as vscode from 'vscode';
import { fileOf } from './notesApi';
import { baseCss } from './paper/baseCss';
import { type FrontMatter, isPaperDocument, readFrontMatter } from './paper/frontMatter';
import { hyphenatorOf } from './paper/hyphenate';
import type { Problem } from './paper/layout';
import { emptyFound, finishBody, type PaperEnv, paperPlugin, paperTokenType } from './paper/markdown';
import { compose, type LoadedLayout, loadLayout, valuesOf } from './paper/render';
import { escapeHtml } from './paper/template';
import { searchHost } from './workspaceHost';

/** PreviewPaper is what the rendering of a paper document needs: the PaperEnv, its file, its layout and its fields. */
interface PreviewPaper extends PaperEnv {
  file: vscode.Uri;
  loaded: LoadedLayout;
  values: Record<string, string>;
}

/** Pending stands for a paper document whose layout the extension still reads. */
interface Pending {
  pending: true;
}

/** Entry is the layout of a file in the cache. */
interface Entry {
  /** key names the layout and the language that the front matter of the file names. */
  key: string;
  frontMatter: FrontMatter | undefined;
  loaded?: LoadedLayout;
  loading?: Promise<void>;
  failed?: boolean;
}

/** RenderEnv is the part of the environment of a rendering of VS Code that the plugin reads. */
interface RenderEnv {
  currentDocument?: vscode.Uri;
  resourceProvider?: { asWebviewUri(resource: vscode.Uri): vscode.Uri };
}

/** PaperData is the content of the attribute `data-paper` of the hidden element, which the script of the pages reads. */
export interface PaperData {
  pending?: true;
  layout?: string;
  language?: string;
  styles?: string[];
  before?: string;
  after?: string;
  attributes?: Record<string, string>;
  delay?: number;
}

/** paperClass is the class of the hidden element with the layout of a paper document. */
export const paperClass = 'nimblescape-paper';

/** frontMatterType is the type of the token of the front matter in the Markdown preview of VS Code. */
const frontMatterType = 'front_matter';

/** previewViewType is the end of the view type of the tabs of the Markdown preview of VS Code. */
const previewViewType = 'markdown.preview';

/** previewEditorType is the view type of the Markdown preview as the editor of a file. */
const previewEditorType = 'vscode.markdown.preview.editor';

/**
 * keyOf returns the key of the layout of a front matter: the layout and the language that it names.
 * @param frontMatter - The front matter.
 */
const keyOf = (frontMatter: FrontMatter | undefined): string => `${frontMatter?.values.layout?.trim() ?? ''}\n${frontMatter?.values.lang?.trim() ?? ''}`;

/** PaperPreview is the markdown-it plugin of the pages, with the cache of the layouts. */
export class PaperPreview implements vscode.Disposable {
  private readonly entries = new Map<string, Entry>();
  private readonly disposables: vscode.Disposable[] = [];
  /** rendered are the paper documents that the Markdown preview rendered, the last one last. */
  private readonly rendered = new Set<string>();
  private refreshTimer: NodeJS.Timeout | undefined;
  private reloadTimer: NodeJS.Timeout | undefined;
  private readonly changed = new Set<string>();

  constructor(
    private readonly extension: vscode.Uri,
    private readonly delay: () => number,
    private readonly report: (file: vscode.Uri, problems: readonly Problem[]) => void,
  ) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/layouts/**');
    this.disposables.push(
      watcher,
      watcher.onDidChange((uri) => this.layoutChanged(uri)),
      watcher.onDidCreate((uri) => this.layoutChanged(uri, true)),
      watcher.onDidDelete((uri) => this.layoutChanged(uri, true)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0) {
          this.layoutChanged(event.document.uri);
        }
      }),
    );
    // The layouts of the open paper documents are in the cache before VS Code renders their first preview.
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === 'markdown') {
        this.paperOf(document.getText());
      }
    }
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'markdown') {
          this.paperOf(document.getText());
        }
      }),
    );
  }

  /**
   * extendMarkdownIt adds the renderer to the markdown-it instance of the Markdown preview of VS Code.
   * @param md - The markdown-it instance.
   * @returns The same instance.
   */
  extendMarkdownIt(md: MarkdownIt): MarkdownIt {
    paperPlugin(md);
    // VS Code gives each heading the ID of its text before this rule renders it; a paper keeps the ID of the renderer,
    // which its table of contents and its links name.
    const heading = md.renderer.rules.heading_open;
    md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
      const id = (tokens[index].meta as { paperId?: string } | null)?.paperId;
      if (id) {
        tokens[index].attrSet('id', id);
      }
      return heading ? heading(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
    };
    md.core.ruler.push('nimblescape_paper_ids', (state) => {
      if (state.tokens[0]?.type !== paperTokenType) {
        return;
      }
      // The front matter fills the templates of the layout; VS Code would show it as a table above the text.
      state.tokens = state.tokens.filter((token) => token.type !== frontMatterType);
      for (const token of state.tokens) {
        const id = token.type === 'heading_open' ? token.attrGet('id') : null;
        if (id) {
          token.meta = { ...((token.meta as object | null) ?? {}), paperId: id };
        }
      }
    });
    const parse = md.parse.bind(md);
    md.parse = (src: string, env: unknown) => {
      const paper = typeof env === 'object' && env !== null ? this.paperOf(src) : undefined;
      if (paper && 'pending' in paper) {
        const tokens = parse(src, env);
        const token: Token = new (new md.core.State('', md, {}).Token)(paperTokenType, '', 0);
        token.meta = paper;
        token.hidden = true;
        return [token, ...tokens];
      }
      if (paper) {
        (env as { nimblescapePaper?: PaperEnv }).nimblescapePaper = paper;
      }
      return parse(src, env);
    };
    const render = md.renderer.render.bind(md.renderer);
    md.renderer.render = (tokens, options, env) => {
      const html = render(tokens, options, env);
      const first = tokens[0];
      return first?.type === paperTokenType ? this.finish(html, first.meta as PreviewPaper | Pending, (env ?? {}) as RenderEnv) : html;
    };
    return md;
  }

  /**
   * finish returns the HTML of a paper document: the hidden element with the layout first, then the text with its
   * generated lists and its soft hyphens.
   * @param html - The HTML of markdown-it.
   * @param paper - The paper of the first token.
   * @param env - The environment of the rendering.
   */
  private finish(html: string, paper: PreviewPaper | Pending, env: RenderEnv): string {
    if ('pending' in paper) {
      return `${this.element({ pending: true })}${html}`;
    }
    const { layout, found, loaded, values, file } = paper;
    const resource = (url: string): string => {
      const uri = vscode.Uri.parse(url, true);
      return env.resourceProvider ? env.resourceProvider.asWebviewUri(uri).toString() : uri.toString();
    };
    const composed = compose(loaded, values, resource);
    this.report(file, [...loaded.problems, ...found.problems.map((problem) => ({ ...problem, file: problem.file ?? file.toString() }))]);
    const key = file.toString();
    this.rendered.delete(key);
    this.rendered.add(key);
    const data: PaperData = {
      layout: layout.id,
      language: layout.language,
      styles: [baseCss, ...composed.styles, composed.variables],
      before: composed.before,
      after: composed.after,
      attributes: composed.attributes,
      delay: this.delay(),
    };
    return `${this.element(data)}${finishBody(html, found, layout, layout.hyphenate ? hyphenatorOf(layout.language) : undefined)}`;
  }

  /**
   * element returns the hidden element with the data of a paper.
   * @param data - The data.
   */
  private element(data: PaperData): string {
    return `<div class="${paperClass}" hidden data-paper="${escapeHtml(JSON.stringify(data))}"></div>\n`;
  }

  /**
   * paperOf returns the paper of a Markdown text that the preview parses, Pending while its layout is not in the
   * cache, or undefined for a notes document and for a text of no open document.
   * @param text - The text.
   */
  private paperOf(text: string): PreviewPaper | Pending | undefined {
    if (!isPaperDocument(text)) {
      return undefined;
    }
    const document = documentOf(text);
    if (!document) {
      return undefined;
    }
    const file = fileOf(document.uri);
    const frontMatter = readFrontMatter(text);
    const key = keyOf(frontMatter);
    const entry = this.entries.get(file.toString());
    if (entry?.key === key && entry.loaded) {
      return { layout: entry.loaded.layout, found: emptyFound(), file, loaded: entry.loaded, values: valuesOf(entry.loaded.layout, frontMatter, file.toString()) };
    }
    if (entry?.key === key && entry.failed) {
      return undefined;
    }
    if (!(entry?.key === key && entry.loading)) {
      this.load(file, frontMatter);
    }
    return { pending: true };
  }

  /**
   * load reads the layout of a file into the cache, and then lets VS Code render the previews again. The old layout
   * stays in the cache until then.
   * @param file - The URI of the file.
   * @param frontMatter - Its front matter.
   */
  private load(file: vscode.Uri, frontMatter: FrontMatter | undefined): void {
    const name = file.toString();
    const key = keyOf(frontMatter);
    const old = this.entries.get(name);
    const entry: Entry = { key, frontMatter, ...(old?.key === key && old.loaded ? { loaded: old.loaded } : {}) };
    entry.loading = loadLayout(searchHost(this.extension, file), name, frontMatter).then(
      (loaded) => {
        entry.loaded = loaded;
        entry.loading = undefined;
        if (this.entries.get(name) === entry) {
          this.refresh();
        }
      },
      (error: unknown) => {
        entry.loading = undefined;
        entry.failed = true;
        this.report(file, [{ severity: 'error', message: error instanceof Error ? error.message : String(error), file: name }]);
        if (this.entries.get(name) === entry) {
          this.refresh();
        }
      },
    );
    this.entries.set(name, entry);
  }

  /**
   * layoutChanged reads again the layouts of the cache that a changed file belongs to, after the pause of the
   * setting; a new or a deleted file in a folder `layouts` can change which layout a file finds, so then all.
   * @param uri - The URI of the changed file.
   * @param all - True to read all layouts again.
   */
  private layoutChanged(uri: vscode.Uri, all = false): void {
    const url = uri.toString();
    const hit = [...this.entries.entries()].filter(([, entry]) => all || (entry.loaded && url.startsWith(entry.loaded.layout.folder)));
    if (hit.length === 0) {
      return;
    }
    for (const [name] of hit) {
      this.changed.add(name);
    }
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      for (const name of this.changed) {
        const entry = this.entries.get(name);
        if (entry) {
          this.load(vscode.Uri.parse(name, true), entry.frontMatter);
        }
      }
      this.changed.clear();
    }, this.delay());
  }

  /** refresh lets VS Code render the Markdown previews again, once for the changes of a moment. */
  private refresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void vscode.commands.executeCommand('markdown.preview.refresh'), 50);
  }

  /**
   * fileOfActive returns the paper document of the active Markdown preview of VS Code: the last rendered paper document
   * whose name ends the title of the tab, if the active tab is a Markdown preview.
   */
  fileOfActive(): vscode.Uri | undefined {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    // "Reopen Editor With… Markdown Preview" names its file.
    if (tab?.input instanceof vscode.TabInputCustom && tab.input.viewType === previewEditorType) {
      return fileOf(tab.input.uri);
    }
    if (!(tab?.input instanceof vscode.TabInputWebview) || !tab.input.viewType.endsWith(previewViewType)) {
      return undefined;
    }
    const files = [...this.rendered].reverse().map((name) => vscode.Uri.parse(name, true));
    return files.find((file) => tab.label.endsWith(file.path.split('/').pop() ?? '\0'));
  }

  dispose(): void {
    clearTimeout(this.refreshTimer);
    clearTimeout(this.reloadTimer);
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}

/**
 * documentOf returns the open Markdown document of a text: the document of the active editor first, then a file, then
 * another document, such as one of the clean editing view of Markdown Notes. VS Code parses the text without its
 * document, without the line separators U+2028 and U+2029.
 * @param text - The text.
 */
function documentOf(text: string): vscode.TextDocument | undefined {
  const plain = (value: string): string => value.replace(/[\u2028\u2029]/g, '');
  const wanted = plain(text);
  const active = vscode.window.activeTextEditor?.document;
  const candidates = [...(active ? [active] : []), ...vscode.workspace.textDocuments.filter((document) => document.uri.scheme === 'file'), ...vscode.workspace.textDocuments];
  return candidates.find((document) => document.languageId === 'markdown' && document.uri.scheme !== 'git' && plain(document.getText()) === wanted);
}
