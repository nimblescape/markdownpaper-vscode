// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The scaffold ([R-NEW-001](../../docs/requirements.md#r-new-001) to [R-NEW-003](../../docs/requirements.md#r-new-003)):
 * the files of a new document, of a new layout and of a new project, as `markdownpaper create`, `markdownpaper new`
 * and the commands "New Document", "New Layout" and "New Project" of the extension write them. The module returns the
 * files; the host writes them, and never over an existing file. It uses no API of VS Code.
 */

import { readFrontMatter } from './frontMatter';
import { type FieldSpec, formatText, type Layout, layoutFile } from './layout';

/** NewFile is a file to write: its path, relative to the folder of the new project or layout, and its content. */
export interface NewFile {
  path: string;
  content: string | Uint8Array;
}

/** packageName is the name of the npm package with the command markdownpaper. */
export const packageName = '@nimblescape/markdownpaper';

/** command is the command that runs markdownpaper without an installation. */
export const command = `npx -y ${packageName}`;

const decoder = new TextDecoder();

/**
 * yamlString returns a text as a string of YAML in double quotes.
 * @param text - The text.
 */
const yamlString = (text: string): string => JSON.stringify(text);

/**
 * frontMatterOf returns the front matter of a new document of a layout: a comment for agents with the command of the
 * rules, the field `layout`, and each field of the layout with its description in a comment above it.
 * @param layout - The layout.
 * @param values - The values of fields that the document gets, for example the title.
 */
export function frontMatterOf(layout: Pick<Layout, 'id' | 'fields'>, values: Readonly<Record<string, string>> = {}): string {
  const lines = ['---', `# nimblescape Markdown Paper. The rules of this file: ${command} instructions document`, `layout: ${layout.id}`];
  const entries: [string, FieldSpec][] = Object.entries(layout.fields);
  for (const [key, spec] of entries) {
    if (spec.description || spec.values) {
      const choices = spec.values ? ` Values: ${spec.values.join(', ')}.` : '';
      lines.push(`# ${spec.required ? '(required) ' : ''}${spec.description}${choices}`.replace(/\s+/g, ' ').trimEnd());
    }
    lines.push(`${key}: ${yamlString(values[key] ?? spec.default ?? '')}`);
  }
  for (const [key, value] of Object.entries(values)) {
    if (!(key in layout.fields) && key !== 'layout') {
      lines.push(`${key}: ${yamlString(value)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * splitStart splits the empty paper document of a layout ([R-LAY-009](../../docs/requirements.md#r-lay-009)) into the
 * values of its front matter, such as the texts of the cover page of a template, and its text after the front matter.
 * A comment at its start, such as a license, is left out.
 * @param start - The text of the empty paper document.
 */
export function splitStart(start: string): { values: Record<string, string>; body: string } {
  const text = start.replace(/^\uFEFF?<!--[\s\S]*?-->\s*/, '');
  const frontMatter = readFrontMatter(text);
  if (!frontMatter || frontMatter.errors.length > 0) {
    return { values: {}, body: text.trim() };
  }
  const values = Object.fromEntries(Object.entries(frontMatter.values).filter(([key]) => key !== 'layout'));
  return { values, body: text.split(/\r?\n/).slice(frontMatter.end + 1).join('\n').trim() };
}

/**
 * newDocumentText returns the text of a new document of a layout: its front matter with the values of the empty paper
 * document of the layout and the given values, and the text of the empty paper document, or a first heading.
 * @param layout - The layout.
 * @param start - The text of the empty paper document of the layout, or undefined.
 * @param values - The values of fields that the document gets, before the values of the empty paper document.
 */
export function newDocumentText(layout: Pick<Layout, 'id' | 'fields' | 'terms'>, start: string | undefined, values: Readonly<Record<string, string>> = {}): string {
  const parts = start?.trim() ? splitStart(start) : undefined;
  const body = parts?.body || `# ${layout.terms.figure === 'Abbildung' ? 'Einleitung' : 'Introduction'}\n\n`;
  return `${frontMatterOf(layout, { ...parts?.values, ...values })}\n\n${body.trimEnd()}\n`;
}

/** decodePath returns a path of a link without its escapes, or the path as it is when its escapes are wrong. */
function decodePath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/** fence matches the line that opens or closes a code block: three or more backticks or tildes. */
const fence = /^ {0,3}(`{3,}|~{3,})/;

/**
 * mapLinks calls a function for the target of each link, image and listing comment of a Markdown text outside its code
 * blocks and code spans, and puts the result of the function in the place of the target.
 * @param text - The Markdown text.
 * @param map - The function: it gets the path of a target without its escapes and without its part after `#`, and
 *   returns the new path with its escapes, or the path that it got to keep the target as it is.
 */
export function mapLinks(text: string, map: (path: string) => string): string {
  let open: string | undefined;
  return text
    .split('\n')
    .map((line) => {
      const marker = fence.exec(line)?.[1];
      if (open) {
        if (marker && marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) {
          open = undefined;
        }
        return line;
      }
      if (marker) {
        open = marker;
        return line;
      }
      // A target that the function keeps stays as it is written, with its escapes.
      const target = (path: string): string => {
        const decoded = decodePath(path);
        const mapped = map(decoded);
        return mapped === decoded ? path : mapped;
      };
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, index) =>
          index % 2 === 1
            ? part
            : part
                .replace(/(\]\()([^)\s#]+)/g, (_, before: string, path: string) => `${before}${target(path)}`)
                .replace(/(<!--\s*listing:\s*)([^\s#]+)/g, (_, before: string, path: string) => `${before}${target(path)}`),
        )
        .join('');
    })
    .join('\n');
}

/**
 * linkedFiles returns the files of a layout folder that a text links to, for example the images and the source code of
 * the empty paper document, by their paths in the folder.
 * @param text - The text.
 * @param source - The files of the layout folder, by their paths in it.
 */
export function linkedFiles(text: string, source: ReadonlyMap<string, Uint8Array>): string[] {
  const found = new Set<string>();
  mapLinks(text, (path) => {
    const relative = path.replace(/^\.\//, '');
    if (source.has(relative)) {
      found.add(relative);
    }
    return path;
  });
  return [...found].sort();
}

/**
 * rebaseLinks puts a prefix before the target of each link of a text to one of the given files, for a text that moves
 * to another folder than these files.
 * @param text - The text.
 * @param files - The paths of the files.
 * @param prefix - The prefix, for example `../`.
 */
export function rebaseLinks(text: string, files: readonly string[], prefix: string): string {
  const moved = new Set(files);
  return mapLinks(text, (path) => (moved.has(path.replace(/^\.\//, '')) ? encodeURI(`${prefix}${path.replace(/^\.\//, '')}`) : path));
}

/**
 * startFiles returns the files that a new document copies from the folder of its layout: the files that the empty
 * paper document links to, for example its images and its source code, at the same paths beside the new document.
 * @param start - The text of the empty paper document, or undefined.
 * @param source - The files of the layout folder, by their paths in it.
 */
export function startFiles(start: string | undefined, source: ReadonlyMap<string, Uint8Array>): NewFile[] {
  return start ? linkedFiles(start, source).map((path) => ({ path, content: source.get(path) ?? new Uint8Array() })) : [];
}

/**
 * previewOf returns the path of the preview PDF of a layout folder ([R-LAY-009](../../docs/requirements.md#r-lay-009))
 * from its `layout.json`, or undefined.
 * @param source - The files of the layout folder, by their paths in it.
 */
function previewOf(source: ReadonlyMap<string, Uint8Array>): string | undefined {
  const json = source.get(layoutFile);
  try {
    const preview = json ? (JSON.parse(decoder.decode(json)) as { preview?: unknown }).preview : undefined;
    return typeof preview === 'string' ? preview.replace(/^\.\//, '') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * newLayoutFiles returns the files of a new layout, copied from another layout, with a new name and language. The
 * preview PDF of the other layout stays out: it shows the other layout.
 * @param source - The files of the layout to copy, by their paths in its folder.
 * @param options - The name of the new layout, and its language.
 */
export function newLayoutFiles(source: ReadonlyMap<string, Uint8Array>, options: { name: string; language?: string }): NewFile[] {
  const files: NewFile[] = [];
  const preview = previewOf(source);
  for (const [path, content] of source) {
    if (path === preview) {
      continue;
    }
    if (path === layoutFile) {
      const json = JSON.parse(decoder.decode(content)) as Record<string, unknown>;
      json.format = formatText;
      json.name = options.name;
      if (options.language) {
        json.language = options.language;
      }
      files.push({ path, content: `${JSON.stringify(json, null, 2)}\n` });
    } else {
      files.push({ path, content });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** ProjectOptions are the options of a new project. */
export interface ProjectOptions {
  /** layout is the read layout to copy; source holds its files. */
  layout: Layout;
  source: ReadonlyMap<string, Uint8Array>;
  /** language is the language of the project, which the copied layout gets. */
  language: string;
  /** values are the fields of the new document, for example title and author. */
  values: Readonly<Record<string, string>>;
}

/**
 * The folders of the sources of a project ([R-NEW-003](../../docs/requirements.md#r-new-003)): `inbox/` is the drop
 * folder for a source that no program can load on its own, for example a PDF file; an AI agent processes each file
 * there and moves it to `bib/`, named after its citation.
 */
export const inboxFolder = 'inbox';
export const sourcesFolder = 'bib';

/**
 * agentsText returns the text of the file AGENTS.md of a new project, which tells every AI agent the commands of the
 * rules and of the PDF.
 * @param layout - The name of the layout of the project.
 */
export function agentsText(layout: string): string {
  return `# Instructions for AI agents

This project writes a document in Markdown and makes its pages and its PDF with
[nimblescape Markdown Paper](https://github.com/nimblescape/markdownpaper-vscode). Node.js 22 or later runs the
commands; \`npx\` needs no installation.

| Folder or file | Content |
| --- | --- |
| \`paper/paper.md\` | The document: front matter with the fields of the layout, then the text in Markdown. |
| \`layouts/${layout}/\` | The layout of the pages: \`layout.json\`, the style sheets, the templates of the fixed pages, fonts and images. |
| \`${inboxFolder}/\` | The drop folder: a person puts a source here that no program can load on its own, for example a PDF file. |
| \`${sourcesFolder}/\` | The files of the sources, each named after its citation. |
| \`images/\` | The figures of the document. |

Read the rules before you change a file, and follow them:

\`\`\`sh
${command} instructions document   # writing the document: front matter, headings, figures, tables, footnotes, appendix
${command} instructions layout     # the layout folder, also from a Word template
${command} instructions render     # making the PDF and checking its pages
\`\`\`

After a change:

\`\`\`sh
${command} check paper/paper.md    # the front matter against the layout
${command} pdf paper/paper.md      # the PDF beside the document
\`\`\`

Process each file in \`${inboxFolder}/\`: read it, find the authors, the year and the title of the source, and move the
file to \`${sourcesFolder}/\` with the ID of its citation as its name, in small letters without spaces and accents:

- a source by persons: the family name of the first author and the year, for example \`${sourcesFolder}/hong2024.pdf\`; a
  second work of the same author and year gets \`a\`, \`b\` (\`hong2024a.pdf\`);
- an organization: its full name as cited and the year, for example \`worldeconomicforum2025.pdf\`;
- a law or a regulation: its Fundstelle (the place of its publication) with hyphens, for example
  \`bgbl-ii-262-2015.pdf\`, \`eu-2024-1689.pdf\`;
- a source without a date: no year, for example \`wirtschaftskammeroesterreich.pdf\`;
- a second file of one source: the ID, a hyphen and an addition, for example
  \`bgbl-242-1962-fassung-2027-08-01.pdf\`.

Ask the person when a file is no source or its author or year is unclear. \`${inboxFolder}/\` stays empty after the
work.

Notes of nimblescape Markdown Notes (footnotes with the label \`note-\` and four letters or digits) are comments of the
authors; the PDF leaves them out. Keep them as they are unless you are asked to change them.
`;
}

/**
 * newProjectFiles returns the files of a new project: AGENTS.md, the copy of the layout, the document from the empty
 * paper document of the layout with the files that it links to at the same paths in the project, and the folders of the
 * sources and of the images.
 * @param options - The options.
 * @param start - The text of the start document of the layout, or undefined.
 */
export function newProjectFiles(options: ProjectOptions, start: string | undefined): NewFile[] {
  const layoutFiles = newLayoutFiles(options.source, { name: options.layout.name, language: options.language }).map((file) => ({ ...file, path: `layouts/${options.layout.id}/${file.path}` }));
  const linked = startFiles(start, options.source);
  const text = newDocumentText(options.layout, start, options.values);
  return [
    { path: 'AGENTS.md', content: agentsText(options.layout.id) },
    ...layoutFiles,
    ...linked,
    { path: 'paper/paper.md', content: rebaseLinks(text, linked.map((file) => file.path), '../') },
    { path: `${inboxFolder}/.gitkeep`, content: '' },
    { path: `${sourcesFolder}/.gitkeep`, content: '' },
    { path: 'images/.gitkeep', content: '' },
  ];
}
