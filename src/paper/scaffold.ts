// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The scaffold ([R-NEW-001](../../docs/requirements.md#r-new-001) to [R-NEW-003](../../docs/requirements.md#r-new-003)):
 * the files of a new document, of a new layout and of a new project, as `markdownpaper create`, `markdownpaper new`
 * and the commands "New Document", "New Layout" and "New Project" of the extension write them. The module returns the
 * files; the host writes them, and never over an existing file. It uses no API of VS Code.
 */

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
    if (spec.description) {
      lines.push(`# ${spec.required ? '(required) ' : ''}${spec.description}`.replace(/\s+/g, ' ').trimEnd());
    }
    lines.push(`${key}: ${yamlString(values[key] ?? '')}`);
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
 * newDocumentText returns the text of a new document of a layout: its front matter, and the start document of the
 * layout or a first heading.
 * @param layout - The layout.
 * @param start - The text of the start document of the layout, or undefined.
 * @param values - The values of fields that the document gets.
 */
export function newDocumentText(layout: Pick<Layout, 'id' | 'fields' | 'terms'>, start: string | undefined, values: Readonly<Record<string, string>> = {}): string {
  const body = start?.trim() ? start.replace(/^<!--[\s\S]*?-->\s*/, '').trim() : `# ${layout.terms.figure === 'Abbildung' ? 'Einleitung' : 'Introduction'}\n\n`;
  return `${frontMatterOf(layout, values)}\n\n${body.trimEnd()}\n`;
}

/**
 * newLayoutFiles returns the files of a new layout, copied from another layout, with a new name and language.
 * @param source - The files of the layout to copy, by their paths in its folder.
 * @param options - The name of the new layout, and its language.
 */
export function newLayoutFiles(source: ReadonlyMap<string, Uint8Array>, options: { name: string; language?: string }): NewFile[] {
  const files: NewFile[] = [];
  for (const [path, content] of source) {
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
 * sourcesFolder returns the name of the folder of the sources of a project in a language.
 * @param language - The language tag.
 */
export const sourcesFolder = (language: string): string => (language.toLowerCase().startsWith('de') ? 'literatur' : 'literature');

/**
 * agentsText returns the text of the file AGENTS.md of a new project, which tells every AI agent the commands of the
 * rules and of the PDF.
 * @param layout - The name of the layout of the project.
 * @param sources - The name of the folder of the sources.
 */
export function agentsText(layout: string, sources: string): string {
  return `# Instructions for AI agents

This project writes a document in Markdown and makes its pages and its PDF with
[nimblescape Markdown Paper](https://github.com/nimblescape/markdownpaper-vscode). Node.js 22 or later runs the
commands; \`npx\` needs no installation.

| Folder or file | Content |
| --- | --- |
| \`paper/paper.md\` | The document: front matter with the fields of the layout, then the text in Markdown. |
| \`layouts/${layout}/\` | The layout of the pages: \`layout.json\`, the style sheets, the templates of the fixed pages, fonts and images. |
| \`${sources}/\` | The PDF files of the sources. |
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

Notes of nimblescape Markdown Notes (footnotes with the label \`note-\` and four letters or digits) are comments of the
authors; the PDF leaves them out. Keep them as they are unless you are asked to change them.
`;
}

/**
 * newProjectFiles returns the files of a new project: AGENTS.md, the copy of the layout, the document, and the folders
 * of the sources and of the images.
 * @param options - The options.
 * @param start - The text of the start document of the layout, or undefined.
 */
export function newProjectFiles(options: ProjectOptions, start: string | undefined): NewFile[] {
  const sources = sourcesFolder(options.language);
  const layoutFiles = newLayoutFiles(options.source, { name: options.layout.name, language: options.language }).map((file) => ({ ...file, path: `layouts/${options.layout.id}/${file.path}` }));
  return [
    { path: 'AGENTS.md', content: agentsText(options.layout.id, sources) },
    ...layoutFiles,
    { path: 'paper/paper.md', content: newDocumentText(options.layout, start, options.values) },
    { path: `${sources}/.gitkeep`, content: '' },
    { path: 'images/.gitkeep', content: '' },
  ];
}
