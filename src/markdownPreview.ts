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
 *   plugin of the layout of `@nimblescape/markdownlayout` add their rules, so that the tokens, which VS Code also gives
 *   its outline, have the footnotes, the numbers, the captions and the lists of the pages, and a first token with the
 *   layout and the text.
 * - The pages take the same inputs as the page of the PDF, from the same code ([R-PRV-005](../docs/requirements.md#r-prv-005),
 *   [R-GEN-010](../docs/requirements.md#r-gen-010)): the rendering of a paper document is not the HTML of the
 *   markdown-it of VS Code, which the plugins of all extensions can change, but the HTML of the text of the renderer of
 *   the PDF, with the same markdown-it plugins as the PDF (pagePlugins) and the plugin of Markdown Notes, which writes
 *   the highlights of the notes; and the pages get exactly the style sheets of the page of the PDF, in the same order:
 *   those of the extensions (extensionStyles), of the plugins of the renderer, the base and the layout. The cache holds
 *   these parts with the layout.
 * - The footnotes of a paper document are those of the PDF: when another extension adds markdown-it-footnote too, for
 *   example "Markdown Footnotes", only one rule of each name works for it, and no rule of the inline footnotes
 *   `^[text]` (paperFootnotes).
 * - The front matter of a paper document does not show: its fields fill the templates of the layout. VS Code shows the
 *   front matter as a table, and the plugin of another extension can show it in its own way, for example as a table
 *   of its own with other tokens. So markdown-it reads the text of a paper document with a blank line for each line of
 *   its front matter, as the renderer of the PDF does: no rule of a plugin finds the front matter, and every line
 *   keeps its number.
 * - The rendering puts a hidden element `.nimblescape-paper` first, with the style sheets, the filled templates and
 *   the fields of the layout, whose addresses the webview loads, then the element `.nimblescape-paper-text` with the
 *   text of the renderer of the PDF, with its lists and its soft hyphens. The script of the pages
 *   ([media/paperPreview.js](../media/paperPreview.js)) makes the pages from the blocks of that element, so also when
 *   the plugin of another extension puts elements around the whole HTML, for example "Markdown Preview Github
 *   Styling", and it switches off the style sheets of the preview that are not in the page of the PDF.
 * - A layout that is not in the cache yet: the extension reads it, and the preview shows "Making the pages …" until
 *   then. After a change of a file of a layout, the extension reads the layout again. Then it lets VS Code render
 *   the previews again (`markdown.preview.refresh`).
 * - A notes document keeps the preview of VS Code: the plugin changes nothing.
 */

import { baseCss, compose, emptyFound, escapeHtml, hyphenatorOf, type LayoutEnv, layoutEnvKey, layoutPlugin, type Problem, renderText, valuesOf } from '@nimblescape/markdownlayout';
import type { MarkdownRenderer } from '@nimblescape/markdownrender';
import type MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import type Token from 'markdown-it/lib/token.mjs';
import * as vscode from 'vscode';
import { markdownExtensions, plantUmlExtensionId, plantUmlOptions } from './markdownExtensions';
import { fileOf, notesExtensionId } from './notesApi';
import { bodyOf, type FrontMatter, isPaperDocument, readFrontMatter } from './paper/frontMatter';
import { paperEnvKey, type PaperEnv, paperRenderer, paperTextPlugin } from './paper/markdown';
import { extensionStyles, type LoadedLayout, loadLayout } from './paper/render';
import { pageExtensions, pagePlugins } from './pdf/export';
import { plantUmlParts } from './pdf/plantUml';
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
  parts: Parts;
  values: Record<string, string>;
  /** text is the text of the document, with its front matter. */
  text: string;
}

/** Parts are the parts of the page of the PDF of a file that its pages take ([R-PRV-005](../docs/requirements.md#r-prv-005)). */
interface Parts {
  /** renderer is the renderer of the text of the PDF, with the plugins of the PDF and the plugin of Markdown Notes. */
  renderer: MarkdownRenderer;
  /** styles are the style sheets of the extensions in the page of the PDF, whose addresses name the files of the disk. */
  styles: string[];
  /** env holds the values that the plugins find in the environment of markdown-it, as in the page of the PDF. */
  env: Readonly<Record<string, unknown>>;
  /**
   * plantUml is the address of the script of the PlantUML diagrams of the page of the PDF, which the pages load when
   * nimblescape PlantUML is not installed; else the script of the extension draws them.
   */
  plantUml?: string;
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
  parts?: Parts;
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
  /** keep are the addresses of the style sheets of the preview that stay on: those of Paper and of Markdown Notes. */
  keep?: string[];
  /** plantUml is the address of the script of the PlantUML diagrams of the PDF, if the pages load it. */
  plantUml?: string;
}

/** paperClass is the class of the hidden element with the layout of a paper document. */
export const paperClass = 'nimblescape-paper';

/** textClass is the class of the element with the text of a paper document, from the renderer of the PDF. */
export const textClass = 'nimblescape-paper-text';

/** paperTokenType is the type of the hidden token that the plugin puts first, with the PreviewPaper as its meta. */
const paperTokenType = 'nimblescape_paper';

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
      // The parts of the page of the PDF change with the Markdown extensions and with the settings of nimblescape PlantUML.
      vscode.extensions.onDidChange(() => this.reload([...this.entries.keys()])),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('nimblescape.plantuml')) {
          this.reload([...this.entries.keys()]);
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
    md.renderer.rules[paperTokenType] = () => '';
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
      const token: Token = new (new md.core.State('', md, {}).Token)(paperTokenType, '', 0);
      token.meta = paper;
      token.hidden = true;
      return [token, ...tokens];
    };
    // A paper document renders the text with the renderer of the PDF, not with the rules of this markdown-it.
    const render = md.renderer.render.bind(md.renderer);
    md.renderer.render = (tokens, options, env) => {
      const first = tokens[0];
      return first?.type === paperTokenType ? this.finish(first.meta as PreviewPaper | Pending, (env ?? {}) as RenderEnv) : render(tokens, options, env);
    };
    return md;
  }

  /**
   * finish returns the HTML of a paper document: the hidden element with the layout first, then the element with the
   * text of the renderer of the PDF, with its generated lists and its soft hyphens.
   * @param paper - The paper of the first token.
   * @param env - The environment of the rendering.
   */
  private finish(paper: PreviewPaper | Pending, env: RenderEnv): string {
    if ('pending' in paper) {
      return this.element({ pending: true });
    }
    const { loaded, parts, values, file, text } = paper;
    const { layout } = loaded;
    const resource = (url: string): string => {
      const uri = vscode.Uri.parse(url, true);
      return env.resourceProvider ? env.resourceProvider.asWebviewUri(uri).toString() : uri.toString();
    };
    const composed = compose(loaded, values, resource);
    const hyphenate = layout.hyphenate ? hyphenatorOf(layout.language) : undefined;
    const body = renderText(parts.renderer, text, layout, hyphenate, { ...parts.env, [paperEnvKey]: { publicRepositories: loaded.publicRepositories } satisfies PaperEnv });
    this.report(file, [...loaded.problems, ...body.problems.map((problem: Problem) => ({ ...problem, file: problem.file ?? file.toString() }))]);
    const key = file.toString();
    this.rendered.delete(key);
    this.rendered.add(key);
    const data: PaperData = {
      layout: layout.id,
      language: layout.language,
      // The style sheets of the page of the PDF, in its order (renderPage of @nimblescape/markdownlayout).
      styles: [
        ...parts.styles.map((css) => fileAddresses(css, resource)),
        ...parts.renderer.plugins.flatMap((plugin) => (plugin.styles ? [plugin.styles] : [])),
        baseCss,
        ...composed.styles,
        composed.variables,
      ],
      before: composed.before,
      after: composed.after,
      attributes: composed.attributes,
      delay: this.delay(),
      keep: this.keptStyles().map((file) => resource(file.toString())),
      ...(parts.plantUml ? { plantUml: resource(parts.plantUml) } : {}),
    };
    return `${this.element(data)}<div class="${textClass}">\n${body.html}</div>\n`;
  }

  /**
   * keptStyles returns the style sheets of the preview that stay on while a paper document shows: those of this
   * extension and of Markdown Notes, whose script paints the highlights of the notes on the pages.
   */
  private keptStyles(): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(this.extension, 'media', 'paperPreview.css'),
      ...[vscode.extensions.getExtension(notesExtensionId)].flatMap((notes) =>
        notes ? (((notes.packageJSON as { contributes?: { 'markdown.previewStyles'?: string[] } }).contributes?.['markdown.previewStyles'] ?? []).map((style) => vscode.Uri.joinPath(notes.extensionUri, style))) : [],
      ),
    ];
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
    if (entry?.key === key && entry.loaded && entry.parts) {
      return {
        layout: { layout: entry.loaded.layout, found: emptyFound() },
        paper: { publicRepositories: entry.loaded.publicRepositories },
        file,
        loaded: entry.loaded,
        parts: entry.parts,
        values: valuesOf(entry.loaded.layout, frontMatter?.values ?? {}, file.toString()),
        text,
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
   * load reads the layout of a file and the parts of the page of its PDF into the cache, and then lets VS Code render
   * the previews again. The old layout and parts stay in the cache until then.
   * @param file - The URI of the file.
   * @param frontMatter - Its front matter.
   * @param text - Its text.
   */
  private load(file: vscode.Uri, frontMatter: FrontMatter | undefined, text: string): void {
    const name = file.toString();
    const key = keyOf(frontMatter, text);
    const old = this.entries.get(name);
    const entry: Entry = { key, frontMatter, text, ...(old?.key === key && old.loaded && old.parts ? { loaded: old.loaded, parts: old.parts } : {}) };
    entry.loading = Promise.all([loadLayout(searchHost(this.extension, file), name, frontMatter, text), this.partsOf(file)]).then(
      ([loaded, parts]) => {
        entry.loaded = loaded;
        entry.parts = parts;
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
   * partsOf returns the parts of the page of the PDF of a file that its pages take, as "Export PDF" collects them
   * (exportPdfCommand): the markdown-it plugins and the style sheets of the Markdown extensions of VS Code and of the
   * PlantUML diagrams, and the plugin of Markdown Notes.
   * @param file - The URI of the file.
   */
  private async partsOf(file: vscode.Uri): Promise<Parts> {
    const extensions = await markdownExtensions(this.extension, file, { notes: true });
    const plantUml = await plantUmlParts(file.fsPath, vscode.Uri.joinPath(this.extension, 'media', 'plantuml').fsPath, plantUmlOptions(file));
    const src = 'src' in plantUml.script ? plantUml.script.src : undefined;
    return {
      renderer: paperRenderer(pagePlugins(extensions, plantUml)),
      styles: extensionStyles(pageExtensions(extensions, plantUml)),
      env: extensions.env ?? {},
      ...(src && !vscode.extensions.getExtension(plantUmlExtensionId) ? { plantUml: src } : {}),
    };
  }

  /**
   * layoutChanged reads again the layouts of the cache that a changed file belongs to, after the pause of the
   * setting; a new or a deleted file in a folder `layouts` can change which layout a file finds, so then all.
   * @param uri - The URI of the changed file.
   * @param all - True to read all layouts again.
   */
  private layoutChanged(uri: vscode.Uri, all = false): void {
    const url = uri.toString();
    this.reload([...this.entries.entries()].filter(([, entry]) => all || (entry.loaded && url.startsWith(entry.loaded.layout.folder))).map(([name]) => name));
  }

  /**
   * reload reads again the layouts and the parts of files of the cache, after the pause of the setting.
   * @param names - The URIs of the files.
   */
  private reload(names: readonly string[]): void {
    if (names.length === 0) {
      return;
    }
    for (const name of names) {
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

/**
 * fileAddresses returns a style sheet whose addresses of files in `url()`, which name the files of the disk as in the
 * page of the PDF, name them as the webview loads them.
 * @param css - The style sheet.
 * @param resource - The mapping of the URL of a file to the URL that the webview loads.
 */
function fileAddresses(css: string, resource: (url: string) => string): string {
  return css.replace(/url\(\s*(['"]?)(file:[^'")]+)\1\s*\)/g, (_all, quote: string, address: string) => `url(${quote || '"'}${resource(address)}${quote || '"'})`);
}
