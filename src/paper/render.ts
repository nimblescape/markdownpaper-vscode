// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The renderer ([R-REN-001](../../docs/requirements.md#r-ren-001), [R-GEN-010](../../docs/requirements.md#r-gen-010)):
 * the page of a Markdown file in its layout, which Paged.js turns into pages, for the page preview and for the PDF
 * alike, comes from `renderPage` of `@nimblescape/markdownlayout`: the front matter, the layout with its style sheets
 * and templates, the text of the renderer of [markdown.ts](markdown.ts), the policy of the scripts, the script of the
 * layout and the scripts of the host. Markdown Paper adds its parts:
 *
 * - The layouts on GitHub in their clones ([R-CLI-004](../../docs/requirements.md#r-cli-004)): a layout
 *   `<owner>/<repository>/<folder>@<rev>` is the folder of the clone that `mp get` made in `.markdownpaper/repos/` of
 *   the project of the document; the built-in layouts of the extension come before the built-in layout of the package.
 * - The public repositories of the field `repos`, whose listings get the link on their cite
 *   ([R-PDF-005](../../docs/requirements.md#r-pdf-005)).
 * - The parts of the Markdown extensions of VS Code in the page of the PDF
 *   ([R-REN-010](../../docs/requirements.md#r-ren-010)): their style sheets and the style of their drawings
 *   ([extensionStyles.ts](extensionStyles.ts)) before the style sheets of the layout, the class `vscode-light` of the
 *   body, which their scripts read, and their scripts; and the script of the drawings
 *   ([media/paperDrawings.js](../../media/paperDrawings.js)), which holds Paged.js while a diagram waits.
 *
 * The host reads the files and maps their addresses to the addresses that the page loads: the extension through
 * VS Code and its webview, the command line from the disk. The module uses no API of VS Code.
 */

import {
  documentLayout as layoutOfDocument,
  findLayout as findLayoutIn,
  folderOf,
  type Layout,
  layoutFile,
  type LayoutPlaces,
  loadLayout as loadLayoutIn,
  type LoadedLayout as LayoutFiles,
  type Page,
  type Problem,
  type Reader,
  renderPage,
  type Script,
} from '@nimblescape/markdownlayout';
import drawingsJs from '../../media/paperDrawings.js?raw';
import { extensionCss } from './extensionStyles';
import { type FrontMatter, readFrontMatter } from './frontMatter';
import { parseRemote } from './gallery';
import { type Body, type MarkdownPlugin, paperEnvKey, type PaperEnv, paperRenderer } from './markdown';
import { cloneName, clonesFolder, referencesOf } from './references';

export { compose, type Composed, defaultLayout, folderOf, layoutName, type Reader, rewriteCss, rewriteHtml, type Script, valuesOf } from '@nimblescape/markdownlayout';

/**
 * Extensions are the parts of the Markdown extensions of VS Code for the page of the PDF
 * ([R-REN-010](../../docs/requirements.md#r-ren-010)): their markdown-it plugins go to `render`.
 */
export interface Extensions {
  /** styles are their style sheets as texts, whose addresses name the files as the page loads them. */
  styles: string[];
  /** scripts are their scripts, which draw in the page before Paged.js makes the pages. */
  scripts: Script[];
}

/**
 * extensionStyles returns the style sheets of the extensions in the page, before the style sheets of the layout: their
 * own, then the style of their drawings, whose parts for the screen do not show. The pages of the Markdown preview take
 * the same style sheets ([R-PRV-005](../../docs/requirements.md#r-prv-005)).
 * @param extensions - The style sheets and the scripts of the extensions, if any.
 */
export function extensionStyles(extensions: Extensions | undefined): string[] {
  return extensions ? [...extensions.styles, extensionCss] : [];
}

/** Host is what the renderer needs from its host. */
export interface Host {
  reader: Reader;
  /** builtinLayouts is the URL of the folder of the built-in layouts of the extension, with a slash at its end. */
  builtinLayouts: string;
  /** top is the URL of the top folder of the search for a layout, for example the folder of the workspace. */
  top?: string;
  /** resource maps the URL of a file to the URL from which the page loads it. */
  resource(url: string): string;
  /** sources are the sources of the policy of the page for images, fonts and styles, for example `file:`. */
  sources: string;
  /** scripts are the scripts of the page after the text: the drawings of the host, and Paged.js last. */
  scripts: Script[];
  /** extensions are the style sheets and the scripts of the Markdown extensions of VS Code, if any. */
  extensions?: Extensions;
  /** screenStyles are style sheets for the screen only, which Paged.js leaves out. */
  screenStyles?: string[];
  /** nonce is the nonce of the scripts of the page. */
  nonce: string;
}

/** Rendered is the page of a document. */
export interface Rendered {
  html: string;
  /** title is the title of the document: the field `title`, else the name of the file. */
  title: string;
  /** pdfName is the name of its PDF file. */
  pdfName: string;
  layout: Layout;
  frontMatter?: FrontMatter;
  body: Body;
  problems: Problem[];
  /** page is the page of the layout part, which `printPage` of `@nimblescape/markdownlayout/pdf` prints. */
  page: Page;
}

const decoder = new TextDecoder();

/**
 * parentOf returns the URL of the folder above a folder, or undefined at the top.
 * @param folder - The URL of the folder, with a slash at its end.
 */
function parentOf(folder: string): string | undefined {
  const parent = new URL('..', folder).href;
  return parent === folder ? undefined : parent;
}

/**
 * foldersAbove returns the URL of the folder of a document and of each folder above it, up to the top folder of the
 * search.
 * @param host - The host with the top folder.
 * @param document - The URL of the document.
 */
function foldersAbove(host: Pick<Host, 'top'>, document: string): string[] {
  const top = host.top && !host.top.endsWith('/') ? `${host.top}/` : host.top;
  const folders: string[] = [];
  for (let folder: string | undefined = folderOf(document); folder; folder = folder === top ? undefined : parentOf(folder)) {
    folders.push(folder);
    if (top && !folder.startsWith(top)) {
      break;
    }
  }
  return folders;
}

/**
 * findClone finds the folder of the clone of a reference that `mp get` made in `.markdownpaper/repos/` of the project
 * of a document ([R-CLI-004](../../docs/requirements.md#r-cli-004)), or returns undefined when it is missing.
 * @param host - The reader of the files and the top folder of the search.
 * @param document - The URL of the document.
 * @param name - The name of the clone.
 * @param file - A file of the clone that must exist, relative to its folder.
 */
export async function findClone(host: Pick<Host, 'reader' | 'top'>, document: string, name: string, file = '.git/HEAD'): Promise<string | undefined> {
  for (const folder of foldersAbove(host, document)) {
    const clone = `${folder}${clonesFolder}/${name}/`;
    if (await host.reader.read(`${clone}${file}`)) {
      return clone;
    }
  }
  return undefined;
}

/** publicKey matches the key `public = true` of the section `[markdownpaper]` of the Git configuration of a clone. */
const publicKey = /^\[markdownpaper\][^[]*^\s*public\s*=\s*true\s*$/im;

/**
 * publicRepositoriesOf returns the repositories of the field `repos` of a document that are public, `owner/repository`
 * in small letters: `mp get` writes `markdownpaper.public` into the Git configuration of each clone, from one request
 * without a sign-in to GitHub ([R-PDF-005](../../docs/requirements.md#r-pdf-005)). A missing clone or answer is not public.
 * @param host - The reader of the files and the top folder of the search.
 * @param document - The URL of the document.
 * @param text - The text of the document.
 */
export async function publicRepositoriesOf(host: Pick<Host, 'reader' | 'top'>, document: string, text: string): Promise<string[]> {
  const repositories: string[] = [];
  for (const reference of referencesOf(text).references) {
    const clone = reference.key === 'repos' ? await findClone(host, document, reference.name, '.git/config') : undefined;
    const config = clone ? await host.reader.read(`${clone}.git/config`) : undefined;
    if (config && publicKey.test(decoder.decode(config))) {
      repositories.push(reference.spec.repository.toLowerCase());
    }
  }
  return repositories;
}

/**
 * placesOf returns the places of the layouts for the layout part: the folders `layouts/` of the folders of a document
 * and above it, the layouts on GitHub in their clones, and the built-in layouts of the extension.
 * @param host - The reader of the files and the places of the layouts.
 */
export function placesOf(host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>): LayoutPlaces {
  return {
    reader: host.reader,
    builtinLayouts: host.builtinLayouts,
    ...(host.top ? { top: host.top } : {}),
    async findLayout(document, name) {
      const spec = parseRemote(name);
      if (!spec) {
        return { problem: `The layout "${name}" is no reference to a layout on GitHub: <owner>/<repository>/<folder>@<rev>.` };
      }
      const path = spec.folder ? `${spec.folder}/` : '';
      const clone = await findClone(host, document, cloneName(spec), `${path}${layoutFile}`);
      return clone
        ? { folder: `${clone}${path}` }
        : { problem: `The layout ${name} is not in ${clonesFolder}/ of the project yet: run "mp get" in the folder of the project.` };
    },
  };
}

/**
 * findLayout finds the layout that a document names, and reads it: a folder of `layouts/` of the folder of the
 * document or of a folder above it, a layout on GitHub in its clone ([R-CLI-004](../../docs/requirements.md#r-cli-004)),
 * or a built-in layout.
 * @param host - The host.
 * @param document - The URL of the document.
 * @param name - The name of the layout, or its reference on GitHub.
 */
export const findLayout = (host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>, document: string, name: string): Promise<{ layout?: Layout; problems: Problem[] }> =>
  findLayoutIn(placesOf(host), document, name);

/**
 * documentLayout finds the layout of a document, or the layout plain when the named one does not exist. The field
 * `lang` of the front matter changes the language of the layout, with its terms.
 * @param host - The reader of the files and the places of the layouts.
 * @param document - The URL of the document.
 * @param frontMatter - The front matter of the document.
 */
export const documentLayout = (host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>, document: string, frontMatter: FrontMatter | undefined): Promise<{ layout: Layout; problems: Problem[] }> =>
  layoutOfDocument(placesOf(host), document, frontMatter?.values ?? {});

/** LoadedLayout is a layout with the text of its style sheets and templates, and the public repositories of the document. */
export interface LoadedLayout extends LayoutFiles {
  /** publicRepositories are the public repositories of the field `repos` of the document, from publicRepositoriesOf. */
  publicRepositories: string[];
}

/**
 * loadLayout finds the layout of a document and reads its style sheets and its templates, and finds the public
 * repositories of the document.
 * @param host - The reader of the files and the places of the layouts.
 * @param document - The URL of the document.
 * @param frontMatter - The front matter of the document.
 * @param text - The text of the document, whose field `repos` names the repositories.
 */
export async function loadLayout(host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>, document: string, frontMatter: FrontMatter | undefined, text = ''): Promise<LoadedLayout> {
  const loaded = await loadLayoutIn(placesOf(host), document, frontMatter?.values ?? {});
  return { ...loaded, publicRepositories: await publicRepositoriesOf(host, document, text) };
}

/**
 * render makes the page of a document in its layout.
 * @param host - The host.
 * @param document - The URL of the file.
 * @param text - The text of the file, with its unsaved changes.
 * @param plugins - The markdown-it plugins of other extensions ([R-REN-010](../../docs/requirements.md#r-ren-010)).
 * @param pluginEnv - The values that these plugins find in the environment of markdown-it, such as `currentDocument`.
 */
export async function render(
  host: Host,
  document: string,
  text: string,
  plugins: readonly MarkdownPlugin[] = [],
  pluginEnv: Readonly<Record<string, unknown>> = {},
): Promise<Rendered> {
  const paper: PaperEnv = { publicRepositories: await publicRepositoriesOf(host, document, text) };
  // The scripts of the Markdown extensions read the colors of the theme and the class of a light theme on the body, as
  // in the Markdown preview of VS Code. The script of the drawings comes first, so that it holds Paged.js while a
  // diagram of these scripts waits.
  const scripts: Script[] = [
    { text: drawingsJs },
    ...(host.extensions ? [{ text: "document.body.classList.add('vscode-light');" }, ...host.extensions.scripts] : []),
    ...host.scripts,
  ];
  // The style sheets of the extensions come first, so that the layout can change what they set; the diagrams lose
  // their parts for the screen.
  const styles = extensionStyles(host.extensions);
  const page = await renderPage(
    {
      ...placesOf(host),
      resource: host.resource,
      sources: host.sources,
      scripts,
      styles,
      ...(host.screenStyles ? { screenStyles: host.screenStyles } : {}),
      nonce: host.nonce,
    },
    paperRenderer(plugins),
    document,
    text,
    { env: { ...pluginEnv, [paperEnvKey]: paper } },
  );
  const frontMatter = readFrontMatter(text);
  return {
    html: page.html,
    title: page.title,
    pdfName: page.pdfName,
    layout: page.layout,
    ...(frontMatter ? { frontMatter } : {}),
    body: { ...page.text, notes: paper.notes ?? 0 },
    problems: page.problems,
    page,
  };
}
