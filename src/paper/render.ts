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
import { extensionCss } from './extensionStyles';
import { bodyOf, type FrontMatter, readFrontMatter } from './frontMatter';
import { hyphenatorOf } from './hyphenate';
import { type Layout, layoutFile, type Problem, parseLayout, termsFor } from './layout';
import { type Body, type MarkdownPlugin, renderBody } from './markdown';
import { escapeHtml, fill, pdfNameOf } from './template';

/** Reader reads files by their URLs. */
export interface Reader {
  /** read returns the bytes of a file, or undefined when it does not exist or cannot be read. */
  read(url: string): Promise<Uint8Array | undefined>;
}

/** Script is a script of the page: a file, also an ECMAScript module, or a text. */
export type Script = { src: string; module?: boolean } | { text: string };

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
  /** scripts are the scripts of the page after the text: Paged.js. */
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

/** LoadedLayout is a layout with the text of its style sheets and of its templates. */
export interface LoadedLayout {
  /** layout is the layout, in the language of the field `lang` of the document when it names one. */
  layout: Layout;
  /** styles are the style sheets of the layout, with their URLs. */
  styles: { url: string; css: string }[];
  /** before and after are the templates of the fixed pages before and after the text, with their URLs. */
  before: { url: string; name: string; text: string }[];
  after: { url: string; name: string; text: string }[];
  problems: Problem[];
}

/**
 * documentLayout finds the layout of a document, or the layout plain when the named one does not exist. The field
 * `lang` of the front matter changes the language of the layout, with its terms.
 * @param host - The reader of the files and the places of the layouts.
 * @param document - The URL of the document.
 * @param frontMatter - The front matter of the document.
 */
export async function documentLayout(host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>, document: string, frontMatter: FrontMatter | undefined): Promise<{ layout: Layout; problems: Problem[] }> {
  const problems: Problem[] = [];
  const name = frontMatter?.values.layout?.trim() || defaultLayout;
  let found = await findLayout(host, document, name);
  problems.push(...found.problems.map((problem) => ({ ...problem, file: problem.file ?? document })));
  if (!found.layout && name !== defaultLayout) {
    found = await findLayout(host, document, defaultLayout);
  }
  if (!found.layout) {
    throw new Error(`The built-in layout "${defaultLayout}" is missing: ${problems.map((problem) => problem.message).join(' ')}`);
  }
  const lang = frontMatter?.values.lang?.trim();
  const layout: Layout =
    lang && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(lang) && lang.toLowerCase() !== found.layout.language.toLowerCase()
      ? { ...found.layout, language: lang, terms: lang.split('-')[0].toLowerCase() === found.layout.language.split('-')[0].toLowerCase() ? found.layout.terms : termsFor(lang) }
      : found.layout;
  return { layout, problems };
}

/**
 * loadLayout finds the layout of a document and reads its style sheets and its templates.
 * @param host - The reader of the files and the places of the layouts.
 * @param document - The URL of the document.
 * @param frontMatter - The front matter of the document.
 */
export async function loadLayout(host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>, document: string, frontMatter: FrontMatter | undefined): Promise<LoadedLayout> {
  const { layout, problems } = await documentLayout(host, document, frontMatter);
  const read = async (file: string): Promise<{ url: string; text: string } | undefined> => {
    const url = `${layout.folder}${file}`;
    const bytes = await host.reader.read(url);
    if (!bytes) {
      problems.push({ severity: 'warning', message: `The layout "${layout.id}" names the file ${file}, which does not exist.`, file: `${layout.folder}${layoutFile}` });
    }
    return bytes && { url, text: decoder.decode(bytes) };
  };
  const styles: LoadedLayout['styles'] = [];
  for (const file of layout.stylesheets) {
    const style = await read(file);
    if (style) {
      styles.push({ url: style.url, css: style.text });
    }
  }
  const templates = async (files: readonly string[]): Promise<LoadedLayout['before']> => {
    const parts: LoadedLayout['before'] = [];
    for (const file of files) {
      const template = await read(file);
      if (template) {
        parts.push({ ...template, name: file.replace(/^.*\//, '').replace(/\.[^.]*$/, '') });
      }
    }
    return parts;
  };
  return { layout, styles, before: await templates(layout.before), after: await templates(layout.after), problems };
}

/** Composed is the part of a page that comes from the layout and the fields of a document. */
export interface Composed {
  /** styles are the style sheets of the layout, whose addresses name the files as the page loads them. */
  styles: string[];
  /** before and after are the HTML of the filled templates. */
  before: string;
  after: string;
  /** variables is the style sheet of the fields as CSS variables, and attributes their attributes of `<body>`. */
  variables: string;
  attributes: Record<string, string>;
}

/**
 * compose fills the templates of a layout with the fields of a document, and maps the addresses of the style sheets
 * and of the templates to the addresses that the page loads.
 * @param loaded - The layout with its files.
 * @param values - The values of the fields.
 * @param resource - The mapping of a URL to the URL that the page loads.
 */
export function compose(loaded: LoadedLayout, values: Record<string, string>, resource: (url: string) => string): Composed {
  const fieldNames = Object.keys(values).filter((key) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(key));
  const attributes = Object.fromEntries(fieldNames.map((key) => [`data-field-${key.toLowerCase()}`, values[key]]));
  // Each template section has the fields as attributes too, as the text has them: Paged.js applies the breaks and the
  // named pages to the content without its body, so a rule such as `body[data-field-x] h1 { break-before: auto; }`
  // never matches there, and `.paper-text[data-field-x] > h1` does.
  const templates = (files: LoadedLayout['before']): string =>
    files
      .map(
        (template) =>
          `<section class="paper-template paper-template-${escapeHtml(template.name)}" data-template="${escapeHtml(template.name)}"${attributesHtml(attributes)}>\n${rewriteHtml(withoutScripts(fill(template.text, values)), template.url, resource)}\n</section>`,
      )
      .join('\n');
  return {
    styles: loaded.styles.map((style) => rewriteCss(style.css, style.url, resource)),
    before: templates(loaded.before),
    after: templates(loaded.after),
    variables: `:root {\n${fieldNames.map((key) => `  --field-${key}: ${cssString(values[key])};`).join('\n')}\n}`,
    attributes,
  };
}

/**
 * attributesHtml returns attributes as the text of an HTML start tag, each with a space before it.
 * @param attributes - The names and the values of the attributes.
 */
function attributesHtml(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
}

/**
 * render makes the page of a Markdown file in its layout.
 * @param host - The host.
 * @param document - The URL of the file.
 * @param text - The text of the file, with its unsaved changes.
 * @param plugins - The markdown-it plugins of other extensions ([R-REN-010](../../docs/requirements.md#r-ren-010)).
 */
export async function render(host: Host, document: string, text: string, plugins: readonly MarkdownPlugin[] = []): Promise<Rendered> {
  const problems: Problem[] = [];
  const frontMatter = readFrontMatter(text);
  for (const error of frontMatter?.errors ?? []) {
    problems.push({ severity: 'warning', message: `Front matter: ${error.message}`, file: document, line: error.line });
  }
  const loaded = await loadLayout(host, document, frontMatter);
  problems.push(...loaded.problems);
  const layout = loaded.layout;
  const values = valuesOf(layout, frontMatter, document);
  const hyphenate = layout.hyphenate ? hyphenatorOf(layout.language) : undefined;
  const body = renderBody(bodyOf(text, frontMatter), layout, hyphenate, plugins);
  problems.push(...body.problems.map((problem) => ({ ...problem, file: problem.file ?? document })));
  const composed = compose(loaded, values, host.resource);
  const attributes = attributesHtml(composed.attributes);
  const title = values.title?.trim() || values.file;
  const source = host.sources;
  const policy = [
    "default-src 'none'",
    `img-src ${source} https: data: blob:`,
    `font-src ${source} data:`,
    `style-src ${source} 'unsafe-inline'`,
    `script-src 'nonce-${host.nonce}'`,
  ].join('; ');
  const scripts = [...(host.extensions?.scripts ?? []), ...host.scripts].map((script) =>
    'src' in script
      ? `<script nonce="${host.nonce}"${script.module ? ' type="module"' : ''} src="${escapeHtml(script.src)}"></script>`
      : `<script nonce="${host.nonce}">${script.text}</script>`,
  );
  // The style sheets of the extensions come first, so that the layout can change what they set. Their scripts read
  // the colors of the theme and the class of a light theme on the body, as in the Markdown preview of VS Code; the
  // diagrams lose their parts for the screen.
  const extensionStyles = host.extensions
    ? `${host.extensions.styles.map((css) => `<style data-paper="extension">\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`).join('\n')}\n<style data-paper="drawings">\n${extensionCss}\n</style>\n`
    : '';
  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(layout.language)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<title>${escapeHtml(title)}</title>
<base href="${escapeHtml(host.resource(folderOf(document)))}">
${(host.screenStyles ?? []).map((href) => `<link rel="stylesheet" media="screen" href="${escapeHtml(href)}">`).join('\n')}
${extensionStyles}<style data-paper="base">
${baseCss}
</style>
${composed.styles.map((css, index) => `<style data-paper="layout" data-file="${escapeHtml(layout.stylesheets[index] ?? '')}">\n${css}\n</style>`).join('\n')}
<style data-paper="fields">
${composed.variables}
</style>
<script nonce="${host.nonce}">
window.PagedConfig = {
  auto: true,
  // The scripts of the Markdown extensions draw after the page has loaded, for example the diagrams of Mermaid.
  // Paged.js makes the pages when the page has not changed for 200 milliseconds and no diagram of Mermaid waits, at
  // the latest after 10 seconds.
  before: function () {
    return new Promise(function (resolve) {
      function start() {
        var end = Date.now() + 10000;
        var last = Date.now();
        var observer = new MutationObserver(function () {
          last = Date.now();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        function check() {
          var waiting = document.querySelector('.mermaid:not(:has(svg))');
          if (Date.now() > end || (!waiting && Date.now() - last >= 200)) {
            observer.disconnect();
            resolve();
          } else {
            setTimeout(check, 50);
          }
        }
        setTimeout(check, 150);
      }
      if (document.readyState === 'complete') {
        start();
      } else {
        window.addEventListener('load', start);
      }
    });
  },
  after: function () {
    window.paperRendered = true;
    document.dispatchEvent(new Event('paper-rendered'));
  },
};
</script>
</head>
<body class="paper${host.extensions ? ' vscode-light' : ''}" data-layout="${escapeHtml(layout.id)}"${attributes}>
${composed.before}
<main class="paper-text"${attributes}>
${body.html}
</main>
${composed.after}
${scripts.join('\n')}
</body>
</html>
`;
  return { html, title, pdfName: pdfNameOf(layout.pdfName, values), layout, frontMatter, body, problems };
}
