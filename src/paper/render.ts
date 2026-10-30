// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The renderer ([R-REN-001](../../docs/requirements.md#r-ren-001)): it makes one HTML page of a Markdown file in its
 * layout, which Paged.js turns into pages, for the page preview and for the PDF alike. The steps:
 *
 * 1. Read the front matter of the file and find its layout: the folder `layouts/<name>/` that the field `layout` names,
 *    in the folder of the file or in a folder above it, up to the top folder; else a built-in layout of the extension.
 *    A file without the field gets the built-in layout "plain".
 * 2. Read the style sheets of the layout and the templates of its fixed pages, and fill the templates with the fields.
 * 3. Turn the Markdown text into HTML ([markdown.ts](markdown.ts)), with soft hyphens by the language of the layout.
 * 4. Write the page: a policy that lets only the scripts of the renderer run, the base address of the folder of the
 *    file for its images, the style sheets, the fields as CSS variables and as attributes of `<body>`, the fixed pages
 *    and the text, and the scripts of Paged.js.
 *
 * The host reads the files and maps their addresses to the addresses that the page loads: the extension through
 * VS Code and its webview, the command line from the disk. The module uses no API of VS Code.
 */

import { baseCss } from './baseCss';
import { bodyOf, type FrontMatter, readFrontMatter } from './frontMatter';
import { hyphenatorOf } from './hyphenate';
import { type Layout, layoutFile, type Problem, parseLayout, termsFor } from './layout';
import { type Body, renderBody } from './markdown';
import { escapeHtml, fill, pdfNameOf } from './template';

/** Reader reads files by their URLs. */
export interface Reader {
  /** read returns the bytes of a file, or undefined when it does not exist or cannot be read. */
  read(url: string): Promise<Uint8Array | undefined>;
}

/** Script is a script of the page: a file or a text. */
export type Script = { src: string } | { text: string };

/** Host is what the renderer needs from its host. */
export interface Host {
  reader: Reader;
  /** builtinLayouts is the URL of the folder of the built-in layouts, with a slash at its end. */
  builtinLayouts: string;
  /** top is the URL of the top folder of the search for a layout, for example the folder of the workspace. */
  top?: string;
  /** resource maps the URL of a file to the URL from which the page loads it. */
  resource(url: string): string;
  /** sources are the sources of the policy of the page for images, fonts and styles, for example `file:`. */
  sources: string;
  /** scripts are the scripts of the page after the text: Paged.js, and the script of the page preview. */
  scripts: Script[];
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
}

/** layoutName matches a valid name of a layout: the name of a folder. */
export const layoutName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** defaultLayout is the built-in layout of a file without the field `layout`. */
export const defaultLayout = 'plain';

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
 * folderOf returns the URL of the folder of a file, with a slash at its end.
 * @param file - The URL of the file.
 */
export const folderOf = (file: string): string => new URL('.', file).href;

/**
 * findLayout finds the layout that a document names, and reads it.
 * @param host - The host.
 * @param document - The URL of the document.
 * @param name - The name of the layout.
 */
export async function findLayout(host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>, document: string, name: string): Promise<{ layout?: Layout; problems: Problem[] }> {
  if (!layoutName.test(name)) {
    return { problems: [{ severity: 'error', message: `The layout "${name}" is no name of a folder: letters, digits, ".", "-" and "_".` }] };
  }
  const top = host.top && !host.top.endsWith('/') ? `${host.top}/` : host.top;
  for (let folder: string | undefined = folderOf(document); folder; folder = folder === top ? undefined : parentOf(folder)) {
    const candidate = `${folder}layouts/${name}/`;
    const bytes = await host.reader.read(`${candidate}${layoutFile}`);
    if (bytes) {
      return parseLayout(decoder.decode(bytes), name, candidate);
    }
    if (top && !folder.startsWith(top)) {
      break;
    }
  }
  const builtin = `${host.builtinLayouts}${name}/`;
  const bytes = await host.reader.read(`${builtin}${layoutFile}`);
  return bytes ? parseLayout(decoder.decode(bytes), name, builtin) : { problems: [{ severity: 'error', message: `The layout "${name}" is neither in a folder layouts/ of the repository nor built in.` }] };
}

/**
 * cssString returns a text as a string of CSS.
 * @param text - The text.
 */
const cssString = (text: string): string => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\A ')}"`;

/**
 * rewriteCss returns a style sheet whose relative addresses in `url()` and `@import` name the files of the folder of
 * the style sheet, as the page loads them.
 * @param css - The style sheet.
 * @param base - The URL of the style sheet.
 * @param resource - The mapping of a URL to the URL that the page loads.
 */
export function rewriteCss(css: string, base: string, resource: (url: string) => string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, quote: string, address: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(address.trim())) {
      return all;
    }
    return `url(${quote || '"'}${resource(new URL(address.trim(), base).href)}${quote || '"'})`;
  });
}

/**
 * rewriteHtml returns a template whose relative addresses in `src` and `href` name the files of the layout folder.
 * @param html - The template.
 * @param base - The URL of the template.
 * @param resource - The mapping of a URL to the URL that the page loads.
 */
export function rewriteHtml(html: string, base: string, resource: (url: string) => string): string {
  return html.replace(/\b(src|href)=(["'])([^"']*)\2/gi, (all, name: string, quote: string, address: string) =>
    address === '' || /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(address) ? all : `${name}=${quote}${resource(new URL(address, base).href)}${quote}`,
  );
}

/**
 * withoutScripts returns HTML without script elements and without attributes of events, for the templates of a
 * layout: a layout holds no logic, and the policy of the page would block them anyway.
 * @param html - The HTML.
 */
const withoutScripts = (html: string): string => html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/\s+on[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, '');

/**
 * valuesOf returns the values of the fields of a document: the defaults of the layout, the fields of the front matter,
 * and `file`, the name of the file without its extension.
 * @param layout - The layout.
 * @param frontMatter - The front matter.
 * @param document - The URL of the document.
 */
export function valuesOf(layout: Layout, frontMatter: FrontMatter | undefined, document: string): Record<string, string> {
  const file = decodeURIComponent(document.split('/').pop() ?? 'document').replace(/\.[^.]*$/, '').replace(/\.paper$/i, '');
  const defaults = Object.fromEntries(Object.entries(layout.fields).flatMap(([key, spec]) => (spec.default !== undefined ? [[key, spec.default]] : [])));
  const values: Record<string, string> = { ...defaults, file };
  for (const [key, value] of Object.entries(frontMatter?.values ?? {})) {
    if (value.trim() !== '' || values[key] === undefined) {
      values[key] = value;
    }
  }
  return values;
}

/**
 * render makes the page of a Markdown file in its layout.
 * @param host - The host.
 * @param document - The URL of the file.
 * @param text - The text of the file, with its unsaved changes.
 */
export async function render(host: Host, document: string, text: string): Promise<Rendered> {
  const problems: Problem[] = [];
  const frontMatter = readFrontMatter(text);
  for (const error of frontMatter?.errors ?? []) {
    problems.push({ severity: 'warning', message: `Front matter: ${error.message}`, file: document, line: error.line });
  }
  const name = frontMatter?.values.layout?.trim() || defaultLayout;
  let found = await findLayout(host, document, name);
  problems.push(...found.problems.map((problem) => ({ ...problem, file: problem.file ?? document })));
  if (!found.layout && name !== defaultLayout) {
    found = await findLayout(host, document, defaultLayout);
  }
  if (!found.layout) {
    throw new Error(`The built-in layout "${defaultLayout}" is missing: ${problems.map((problem) => problem.message).join(' ')}`);
  }
  // The field `lang` of the front matter changes the language of the layout, with its terms.
  const lang = frontMatter?.values.lang?.trim();
  const layout: Layout =
    lang && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(lang) && lang.toLowerCase() !== found.layout.language.toLowerCase()
      ? { ...found.layout, language: lang, terms: lang.split('-')[0].toLowerCase() === found.layout.language.split('-')[0].toLowerCase() ? found.layout.terms : termsFor(lang) }
      : found.layout;
  const values = valuesOf(layout, frontMatter, document);
  const hyphenate = layout.hyphenate ? hyphenatorOf(layout.language) : undefined;
  const body = renderBody(bodyOf(text, frontMatter), layout, hyphenate);
  problems.push(...body.problems);

  const read = async (file: string): Promise<string | undefined> => {
    const bytes = await host.reader.read(`${layout.folder}${file}`);
    if (!bytes) {
      problems.push({ severity: 'warning', message: `The layout "${layout.id}" names the file ${file}, which does not exist.`, file: `${layout.folder}${layoutFile}` });
    }
    return bytes && decoder.decode(bytes);
  };
  const styles: string[] = [];
  for (const file of layout.stylesheets) {
    const css = await read(file);
    if (css !== undefined) {
      styles.push(rewriteCss(css, `${layout.folder}${file}`, host.resource));
    }
  }
  const templates = async (files: readonly string[]): Promise<string> => {
    const parts: string[] = [];
    for (const file of files) {
      const template = await read(file);
      if (template !== undefined) {
        const name = file.replace(/^.*\//, '').replace(/\.[^.]*$/, '');
        parts.push(`<section class="paper-template paper-template-${escapeHtml(name)}" data-template="${escapeHtml(name)}">\n${rewriteHtml(withoutScripts(fill(template, values)), `${layout.folder}${file}`, host.resource)}\n</section>`);
      }
    }
    return parts.join('\n');
  };
  const before = await templates(layout.before);
  const after = await templates(layout.after);

  const fieldNames = Object.keys(values).filter((key) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(key));
  const variables = fieldNames.map((key) => `  --field-${key}: ${cssString(values[key])};`).join('\n');
  const attributes = fieldNames.map((key) => ` data-field-${key.toLowerCase()}="${escapeHtml(values[key])}"`).join('');
  const title = values.title?.trim() || values.file;
  const source = host.sources;
  const policy = [
    "default-src 'none'",
    `img-src ${source} https: data: blob:`,
    `font-src ${source} data:`,
    `style-src ${source} 'unsafe-inline'`,
    `script-src 'nonce-${host.nonce}'`,
  ].join('; ');
  const scripts = host.scripts.map((script) => ('src' in script ? `<script nonce="${host.nonce}" src="${escapeHtml(script.src)}"></script>` : `<script nonce="${host.nonce}">${script.text}</script>`));
  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(layout.language)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<title>${escapeHtml(title)}</title>
<base href="${escapeHtml(host.resource(folderOf(document)))}">
${(host.screenStyles ?? []).map((href) => `<link rel="stylesheet" media="screen" href="${escapeHtml(href)}">`).join('\n')}
<style data-paper="base">
${baseCss}
</style>
${styles.map((css, index) => `<style data-paper="layout" data-file="${escapeHtml(layout.stylesheets[index] ?? '')}">\n${css}\n</style>`).join('\n')}
<style data-paper="fields">
:root {
${variables}
}
</style>
<script nonce="${host.nonce}">
window.PagedConfig = {
  auto: true,
  after: function () {
    window.paperRendered = true;
    document.dispatchEvent(new Event('paper-rendered'));
  },
};
</script>
</head>
<body class="paper" data-layout="${escapeHtml(layout.id)}"${attributes}>
${before}
<main class="paper-text">
${body.html}
</main>
${after}
${scripts.join('\n')}
</body>
</html>
`;
  return { html, title, pdfName: pdfNameOf(layout.pdfName, values), layout, frontMatter, body, problems };
}
