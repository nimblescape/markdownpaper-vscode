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
 *   text, and its layout in a cache. The plugin `paper` of the renderer ([markdown.ts](paper/markdown.ts)) and the
 *   plugin of the layout of `@nimblescape/markdownlayout` add their rules, as in the page of the PDF
 *   ([R-GEN-010](../docs/requirements.md#r-gen-010)): the footnotes of the pages, which only a paper document gets
 *   here, the numbers, the captions and the lists. Then the tokens get the form of the output of
 *   `@nimblescape/markdownrender`, such as the alerts and the widths of the columns of the tables, and a first token
 *   with the layout and what it found. The headings keep the IDs of the renderer.
 * - The footnotes of a paper document are those of the PDF: when another extension adds markdown-it-footnote too, for
 *   example "Markdown Footnotes", only one rule of each name works for it, and no rule of the inline footnotes
 *   `^[text]` (paperFootnotes).
 * - The front matter of a paper document does not show: its fields fill the templates of the layout. VS Code shows the
 *   front matter as a table, and the plugin of another extension can show it in its own way, for example as a table
 *   of its own with other tokens. So markdown-it reads the text of a paper document with a blank line for each line of
 *   its front matter, as the renderer of the PDF does: no rule of a plugin finds the front matter, and every line
 *   keeps its number.
 * - The rendering of these tokens puts a hidden element `.nimblescape-paper` first, with the style sheets, the filled
 *   templates and the fields of the layout, whose addresses the webview loads, then the text with its lists and its
 *   soft hyphens. The script of the pages ([media/paperPreview.js](../media/paperPreview.js)) makes the pages from it.
 * - The hidden element stands in place of the first token, so also inside the elements that the plugin of another
 *   extension puts around the whole HTML, for example "Markdown Preview Github Styling" its element
 *   `.github-markdown-body`, which has the space, the font and the headings of GitHub. The pages take only the
 *   blocks next to the hidden element: they leave out these elements, which the PDF does not have either
 *   ([R-PRV-005](../docs/requirements.md#r-prv-005)).
 * - A layout that is not in the cache yet: the extension reads it, and the preview shows "Making the pages …" until
 *   then. After a change of a file of a layout, the extension reads the layout again. Then it lets VS Code render
 *   the previews again (`markdown.preview.refresh`).
 * - A notes document keeps the preview of VS Code: the plugin changes nothing.
 */

import { baseCss, compose, emptyFound, escapeHtml, hyphenateHtml, hyphenatorOf, type LayoutEnv, layoutEnvKey, layoutPlugin, type Problem, valuesOf } from '@nimblescape/markdownlayout';
import { addOutputRules, prepareOutput } from '@nimblescape/markdownrender';
import type MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import type Token from 'markdown-it/lib/token.mjs';
import * as vscode from 'vscode';
import { fileOf } from './notesApi';
import { bodyOf, type FrontMatter, isPaperDocument, readFrontMatter } from './paper/frontMatter';
import { paperEnvKey, type PaperEnv, paperTextPlugin } from './paper/markdown';
import { type LoadedLayout, loadLayout } from './paper/render';
import { referencesOf } from './paper/references';
import { searchHost } from './workspaceHost';

/**
 * PreviewPaper is what the rendering of a paper document needs: the environment of the layout and of the plugin
 * `paper`, its file, its layout and its fields.
 */
interface PreviewPaper {
  layout: LayoutEnv;
  paper: PaperEnv;
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
  /** key names the layout, the language and the repositories that the front matter of the file names. */
  key: string;
  frontMatter: FrontMatter | undefined;
  /** text is the text of the file when the cache read its layout. */
  text: string;
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

/** paperTokenType is the type of the hidden token that the plugin puts first, with the PreviewPaper as its meta. */
const paperTokenType = 'nimblescape_paper';

/**
 * paperMark is the HTML of the first token of a paper document, which finish replaces with the hidden element of the
 * layout: so the hidden element stands where the HTML of the text starts, also inside the elements that the plugins of
 * other extensions put around the whole HTML.
 */
const paperMark = `<div class="${paperClass}" hidden></div>\n`;

/** Ruler is the part of a ruler of markdown-it that onlyForPapers and paperFootnotes need. */
interface Ruler {
  __rules__: { name: string; fn: (...args: never[]) => unknown; alt: string[] }[];
  __cache__: unknown;
  at(name: string, fn: (...args: never[]) => unknown, options?: { alt: string[] }): void;
}

/**
 * onlyForPapers makes the rules of a ruler work only in a parsing of a paper document, whose environment has the
 * environment of the layout.
 * @param ruler - The ruler of markdown-it.
 * @param names - The names of the rules.
 */
function onlyForPapers(ruler: Ruler, names: readonly string[]): void {
  for (const name of names) {
    const rule = ruler.__rules__.find((candidate) => candidate.name === name);
    if (rule) {
      const fn = rule.fn as (state: { env?: Record<string, unknown> }, ...rest: unknown[]) => unknown;
      ruler.at(name, ((state: { env?: Record<string, unknown> }, ...rest: unknown[]) => (state.env?.[layoutEnvKey] ? fn(state, ...rest) : false)) as never, { alt: rule.alt });
      ownFootnoteRules.add(ruler.__rules__.find((candidate) => candidate.name === name)?.fn ?? fn);
    }
  }
}

/** ownFootnoteRules are the rules of footnotes that the plugin added itself, which work only for a paper document. */
const ownFootnoteRules = new WeakSet<object>();

/** notForPapers are the rules of footnotes of other plugins that paperFootnotes made skip a paper document. */
const notForPapers = new WeakSet<object>();

/**
 * paperFootnotes makes the footnotes of a paper document the footnotes of the PDF ([R-REN-010](../docs/requirements.md#r-ren-010)):
 * of the rules of markdown-it-footnote with the same name, only one works in the parsing of a paper document, the rule
 * of the plugin itself if it added one, and else the first; no rule of the inline footnotes `^[text]` works. Another
 * extension, for example "Markdown Footnotes", which Markdown Notes installs, adds markdown-it-footnote too, before or
 * after this plugin. A second rule `footnote_tail` would write the list of the footnotes a second time, and the rule
 * `footnote_inline` of that extension would read the inline footnotes. A notes document keeps the rules of that
 * extension.
 * @param md - The markdown-it instance of the Markdown preview, with the plugins of all extensions.
 */
function paperFootnotes(md: MarkdownIt): void {
  const rulers: [Ruler, string][] = [
    [md.block.ruler as unknown as Ruler, 'footnote_def'],
    [md.inline.ruler as unknown as Ruler, 'footnote_ref'],
    [md.inline.ruler as unknown as Ruler, 'footnote_inline'],
    [md.core.ruler as unknown as Ruler, 'footnote_tail'],
  ];
  for (const [ruler, name] of rulers) {
    const rules = ruler.__rules__.filter((rule) => rule.name === name);
    const working = name === 'footnote_inline' ? undefined : (rules.find((rule) => ownFootnoteRules.has(rule.fn)) ?? rules[0]);
    for (const rule of rules) {
      if (rule === working || ownFootnoteRules.has(rule.fn) || notForPapers.has(rule.fn)) {
        continue;
      }
      const fn = rule.fn as (state: { env?: Record<string, unknown> }, ...rest: unknown[]) => unknown;
      rule.fn = ((state: { env?: Record<string, unknown> }, ...rest: unknown[]) => (state.env?.[layoutEnvKey] ? false : fn(state, ...rest))) as never;
      notForPapers.add(rule.fn);
      // markdown-it builds the chains of the rules again.
      ruler.__cache__ = null;
    }
  }
}

/** previewViewType is the end of the view type of the tabs of the Markdown preview of VS Code. */
const previewViewType = 'markdown.preview';

/** previewEditorType is the view type of the Markdown preview as the editor of a file. */
const previewEditorType = 'vscode.markdown.preview.editor';

/**
 * keyOf returns the key of the layout of a front matter: the layout and the language that it names, and the
 * references of its field `repos`, whose clones say which repositories are public.
 * @param frontMatter - The front matter.
 * @param text - The text of the file.
 */
const keyOf = (frontMatter: FrontMatter | undefined, text: string): string =>
  [
    frontMatter?.values.layout?.trim() ?? '',
    frontMatter?.values.lang?.trim() ?? '',
    ...referencesOf(text).references.flatMap((reference) => (reference.key === 'repos' ? [`${reference.name}: ${reference.text}`] : [])),
  ].join('\n');

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
    // The footnotes of the pages, as the renderer of the PDF reads them, without the inline footnotes `^[text]`. Another
    // plugin, such as the footnotes of an extension of VS Code, may have the footnotes already; then its rules work for a
    // paper document, without its inline footnotes (paperFootnotes).
    if (!(md.block.ruler as unknown as Ruler).__rules__.some((rule) => rule.name === 'footnote_def')) {
      md.use(footnote);
      md.disable('footnote_inline');
      onlyForPapers(md.block.ruler as unknown as Ruler, ['footnote_def']);
      onlyForPapers(md.inline.ruler as unknown as Ruler, ['footnote_ref']);
      onlyForPapers(md.core.ruler as unknown as Ruler, ['footnote_tail']);
    }
    // The rules of the paper and of the layout work only when the environment has the environment of the layout.
    void paperTextPlugin.extendMarkdownIt?.(md);
    void layoutPlugin.extendMarkdownIt?.(md);
    addOutputRules(md);
    md.renderer.rules[paperTokenType] = () => paperMark;
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
    const parse = md.parse.bind(md);
    md.parse = (src: string, env: unknown) => {
      const paper = typeof env === 'object' && env !== null ? this.paperOf(src) : undefined;
      if (!paper) {
        return parse(src, env);
      }
      const values = env as Record<string, unknown>;
      paperFootnotes(md);
      if (!('pending' in paper)) {
        values[layoutEnvKey] = paper.layout;
        values[paperEnvKey] = paper.paper;
      }
      let tokens: Token[];
      try {
        // The front matter fills the templates of the layout, so no rule of a plugin may show it (R-PRV-005).
        tokens = parse(bodyOf(src, readFrontMatter(src)), env);
      } finally {
        delete values[layoutEnvKey];
        delete values[paperEnvKey];
      }
      if (!('pending' in paper)) {
        // The tokens get the form of the output of the renderer of the PDF, with the IDs of the headings of GitHub and
        // without the lines, which VS Code gives the blocks itself.
        prepareOutput(tokens, { lines: false });
        for (const token of tokens) {
          const id = token.type === 'heading_open' ? token.attrGet('id') : null;
          if (id) {
            token.meta = { ...((token.meta as object | null) ?? {}), paperId: id };
          }
        }
      }
      const token: Token = new (new md.core.State('', md, {}).Token)(paperTokenType, '', 0);
      token.meta = paper;
      token.hidden = true;
      return [token, ...tokens];
    };
    const render = md.renderer.render.bind(md.renderer);
    md.renderer.render = (tokens, options, env) => {
      const first = tokens[0];
      if (first?.type !== paperTokenType) {
        return render(tokens, options, env);
      }
      const paper = first.meta as PreviewPaper | Pending;
      const values = (env ?? {}) as Record<string, unknown>;
      // The rules of the lists of the layout read the environment of the layout, which VS Code does not keep from the
      // parsing to the rendering.
      if (!('pending' in paper)) {
        values[layoutEnvKey] = paper.layout;
      }
      try {
        return this.finish(render(tokens, options, env), paper, values as RenderEnv);
      } finally {
        delete values[layoutEnvKey];
      }
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
      return this.place(html, { pending: true });
    }
    const { loaded, values, file } = paper;
    const { layout, found } = paper.layout;
    const resource = (url: string): string => {
      const uri = vscode.Uri.parse(url, true);
      return env.resourceProvider ? env.resourceProvider.asWebviewUri(uri).toString() : uri.toString();
    };
    const composed = compose(loaded, values, resource);
    this.report(file, [...loaded.problems, ...found.problems.map((problem: Problem) => ({ ...problem, file: problem.file ?? file.toString() }))]);
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
    const hyphenate = layout.hyphenate ? hyphenatorOf(layout.language) : undefined;
    return this.place(hyphenate ? hyphenateHtml(html, hyphenate) : html, data);
  }

  /**
   * place returns the HTML of a paper document with the hidden element with the data of the paper in place of the mark
   * of the first token (paperMark), or first when a plugin of another extension left out the HTML of that token.
   * @param html - The HTML of markdown-it, with the elements of the plugins of other extensions around it.
   * @param data - The data.
   */
  private place(html: string, data: PaperData): string {
    const element = this.element(data);
    const index = html.indexOf(paperMark);
    return index < 0 ? `${element}${html}` : `${html.slice(0, index)}${element}${html.slice(index + paperMark.length)}`;
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
    const key = keyOf(frontMatter, text);
    const entry = this.entries.get(file.toString());
    if (entry?.key === key && entry.loaded) {
      return {
        layout: { layout: entry.loaded.layout, found: emptyFound() },
        paper: { publicRepositories: entry.loaded.publicRepositories },
        file,
        loaded: entry.loaded,
        values: valuesOf(entry.loaded.layout, frontMatter?.values ?? {}, file.toString()),
      };
    }
    if (entry?.key === key && entry.failed) {
      return undefined;
    }
    if (!(entry?.key === key && entry.loading)) {
      this.load(file, frontMatter, text);
    }
    return { pending: true };
  }

  /**
   * load reads the layout of a file into the cache, and then lets VS Code render the previews again. The old layout
   * stays in the cache until then.
   * @param file - The URI of the file.
   * @param frontMatter - Its front matter.
   * @param text - Its text.
   */
  private load(file: vscode.Uri, frontMatter: FrontMatter | undefined, text: string): void {
    const name = file.toString();
    const key = keyOf(frontMatter, text);
    const old = this.entries.get(name);
    const entry: Entry = { key, frontMatter, text, ...(old?.key === key && old.loaded ? { loaded: old.loaded } : {}) };
    entry.loading = loadLayout(searchHost(this.extension, file), name, frontMatter, text).then(
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
          this.load(vscode.Uri.parse(name, true), entry.frontMatter, entry.text);
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
