// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The checks of a document against its layout ([R-DOC-002](../../docs/requirements.md#r-doc-002)): the layout that the
 * field `layout` names must exist and be readable, each field that the layout requires must have a value, and each link
 * to a figure or a table must find it ([R-REN-009](../../docs/requirements.md#r-ren-009)). The citation style of the
 * layout must be readable, and the sources and the citations must be readable
 * ([R-CITE-001](../../docs/requirements.md#r-cite-001) to [R-CITE-004](../../docs/requirements.md#r-cite-004)). The text editor shows the
 * problems as warnings, and `markdownpaper check` prints them. A file without the field `layout`
 * is no document of a layout and gets no check. The module uses no API of VS Code.
 */

import { citationProblems, writeCitations } from './citations';
import { citationStyleOf } from './csl';
import { bodyOf, type FrontMatter, readFrontMatter } from './frontMatter';
import type { Layout, Problem } from './layout';
import { renderBody } from './markdown';
import { findLayout, type Host } from './render';

/** Checked is the result of the checks of a document. */
export interface Checked {
  frontMatter?: FrontMatter;
  layout?: Layout;
  problems: Problem[];
}

/**
 * checkDocument checks a Markdown file against its layout.
 * @param host - The reader of the files and the places of the layouts.
 * @param document - The URL of the file.
 * @param text - The text of the file.
 */
export async function checkDocument(host: Pick<Host, 'reader' | 'builtinLayouts' | 'top'>, document: string, text: string): Promise<Checked> {
  const frontMatter = readFrontMatter(text);
  const field = frontMatter?.fields.find((candidate) => candidate.key === 'layout');
  if (!frontMatter || !field) {
    return { ...(frontMatter ? { frontMatter } : {}), problems: [] };
  }
  const at = { file: document, line: field.line, column: field.column, length: field.key.length };
  const problems: Problem[] = frontMatter.errors.map((error) => ({ severity: 'warning', message: `Front matter: ${error.message}`, file: document, line: error.line }));
  const found = await findLayout(host, document, field.value.trim());
  // The problems of layout.json show at the field `layout` of the document, and name the file of the layout.
  problems.push(...found.problems.map((problem) => ({ ...problem, ...at, message: problem.file && problem.file !== document ? `${problem.message} (${problem.file})` : problem.message })));
  const layout = found.layout;
  if (layout) {
    for (const [key, spec] of Object.entries(layout.fields)) {
      if (spec.required && (frontMatter.values[key] ?? '').trim() === '' && (spec.default ?? '').trim() === '') {
        const present = frontMatter.fields.find((candidate) => candidate.key === key);
        problems.push({
          severity: 'warning',
          message: `The layout "${layout.id}" needs the field "${key}"${spec.description ? `: ${spec.description}` : '.'}`,
          file: document,
          ...(present ? { line: present.line, column: present.column, length: present.key.length } : { line: at.line, column: at.column, length: at.length }),
        });
      }
    }
    problems.push(...renderBody(bodyOf(text, frontMatter), layout).problems.map((problem) => ({ ...problem, file: document })));
    const lines = text.split(/\r?\n/);
    const { style, problems: styleProblems } = await citationStyleOf((url) => host.reader.read(url), layout);
    problems.push(...styleProblems.map((problem) => ({ ...problem, ...at, message: `${problem.message} (${problem.file})` })));
    try {
      writeCitations(lines, layout, style);
    } catch (error) {
      problems.push({ severity: 'warning', message: `The citation style ${style.name} of the layout "${layout.id}" cannot be applied: ${(error as Error).message}`, ...at });
    }
    problems.push(...citationProblems(lines, layout).map((problem) => ({ ...problem, file: document })));
  }
  return { frontMatter, ...(layout ? { layout } : {}), problems };
}
