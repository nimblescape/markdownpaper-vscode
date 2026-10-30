// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The tests of the parts of the renderer around the text: the front matter, the layout, the templates, the
 * hyphenation, the page, the checks and the scaffold. A reader of files in memory stands for the disk.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { checkDocument } from './checks';
import { bodyOf, isPaperDocument, readFrontMatter } from './frontMatter';
import { hyphenateHtml, hyphenatorOf, softHyphen } from './hyphenate';
import { topicList, topics } from './instructions';
import { formatText, parseLayout, termsFor } from './layout';
import { findLayout, type Host, type Reader, render, rewriteCss, rewriteHtml } from './render';
import { frontMatterOf, linkedFiles, mapLinks, newDocumentText, newLayoutFiles, newProjectFiles, rebaseLinks, splitStart, startFiles } from './scaffold';
import { fill, pdfNameOf } from './template';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** repository is the root folder of this repository, which holds the built-in layouts. */
const repository = path.resolve(__dirname, '..', '..');

/**
 * memoryReader returns a reader of files in memory, and the built-in layout plain of layouts/plain/.
 * @param files - The files by their URLs.
 */
function memoryReader(files: Record<string, string>): Reader {
  return {
    async read(url) {
      if (url in files) {
        return encoder.encode(files[url]);
      }
      const builtin = /^file:\/\/\/builtin\/(.+)$/.exec(url);
      const file = builtin && path.join(repository, 'layouts', builtin[1]);
      return file && fs.existsSync(file) ? fs.readFileSync(file) : undefined;
    },
  };
}

/**
 * hostOf returns a host for the tests.
 * @param files - The files by their URLs.
 */
const hostOf = (files: Record<string, string>): Host => ({
  reader: memoryReader(files),
  builtinLayouts: 'file:///builtin/',
  top: 'file:///repo/',
  resource: (url) => `https://resource/${url.slice('file:///'.length)}`,
  sources: 'https://resource',
  scripts: [{ src: 'https://resource/paged.js' }],
  nonce: 'abc',
});

/** thesis is a layout of a repository for the tests. */
const thesis = JSON.stringify({
  format: formatText,
  name: 'Thesis',
  language: 'de-AT',
  before: ['cover.html'],
  fields: { title: { description: 'Der Titel.', required: true }, author: { description: 'Der Name.', required: true }, kapitelumbruch: { description: 'ja oder nein', default: 'ja' } },
  pdfName: '{{author}}_{{title}}',
});

describe('front matter (R-DOC-001)', () => {
  test('the fields of the front matter with their lines, and the body with the lines of the file', () => {
    const text = '---\nlayout: plain\ntitle: "Ein Titel"\nkeywords: [a, b]\nmeta:\n  x: 1\n---\n# Teil\n';
    const frontMatter = readFrontMatter(text);
    expect(frontMatter?.values).toEqual({ layout: 'plain', title: 'Ein Titel', keywords: 'a, b' });
    expect(frontMatter?.fields[1]).toEqual({ key: 'title', value: 'Ein Titel', line: 2, column: 0 });
    expect(frontMatter?.end).toBe(6);
    expect(bodyOf(text, frontMatter).split('\n')).toEqual(['', '', '', '', '', '', '', '# Teil', '']);
  });

  test('a file without a front matter has none, and a broken YAML gives an error with its line', () => {
    expect(readFrontMatter('# Teil\n---\n')).toBeUndefined();
    expect(readFrontMatter('---\ntitle: a\n')).toBeUndefined();
    expect(readFrontMatter('---\ntitle: a\ntitle: b\n---\n')?.errors[0].line).toBe(2);
  });
});

describe('layout.json (R-LAY-002)', () => {
  test('the defaults of the format and of the language fill the fields that the file leaves out', () => {
    const { layout, problems } = parseLayout(JSON.stringify({ format: formatText }), 'mine', 'file:///repo/layouts/mine/');
    expect(problems).toEqual([]);
    expect(layout).toMatchObject({ id: 'mine', name: 'mine', language: 'en-US', stylesheets: ['page.css'], before: [], numbered: true, depth: 3, numberedSections: [], contentsFront: true, hyphenate: true, references: { hyphenate: false }, pdfName: '{{file}}' });
    expect(layout?.terms.sections.TOC).toContain('Table of Contents');
  });

  test('a file of another format or of another major version is not read', () => {
    expect(parseLayout('{', 'x', 'file:///x/').problems[0].message).toContain('no JSON');
    expect(parseLayout(JSON.stringify({ format: 'other 1.0.0' }), 'x', 'file:///x/').layout).toBeUndefined();
    expect(parseLayout(JSON.stringify({ format: 'nimblescape-layout 2.0.0' }), 'x', 'file:///x/').problems[0].message).toContain('reads the format 1.x');
    expect(parseLayout(JSON.stringify({ format: 'nimblescape-layout 1.4.0' }), 'x', 'file:///x/').problems[0].severity).toBe('warning');
  });

  test('a field can give the values that the author chooses from, and its default is one of them', () => {
    const field = (spec: unknown) => parseLayout(JSON.stringify({ format: formatText, fields: { schrift: spec } }), 'x', 'file:///x/');
    const chosen = field({ description: 'Die Schrift.', default: 'arial', values: ['arial', 'times'] });
    expect(chosen.problems).toEqual([]);
    expect(chosen.layout?.fields.schrift).toEqual({ description: 'Die Schrift.', required: false, default: 'arial', values: ['arial', 'times'] });
    expect(field({ description: 'Die Schrift.', default: 'serif', values: ['arial', 'times'] }).problems[0].message).toBe('The default "serif" of the field "schrift" of the layout "x" is not one of its values: arial, times.');
    const wrong = field({ description: 'Die Schrift.', values: 'arial' });
    expect(wrong.problems[0].message).toBe('The field "schrift" of the layout "x" must give "values" as a list of texts.');
    expect(wrong.layout?.fields.schrift.values).toBeUndefined();
  });

  test('a path outside the folder, a wrong language, a wrong term and a wrong pattern are warnings, and the rest is read', () => {
    const { layout, problems } = parseLayout(JSON.stringify({ format: formatText, before: ['../x.html', 'cover.html'], language: 'deutsch', terms: { BIB: 'Quellen', table: ['Tab.'], other: 'x' }, headings: { unnumbered: ['('] } }), 'x', 'file:///x/');
    expect(layout?.before).toEqual(['cover.html']);
    expect(layout?.language).toBe('en-US');
    expect(layout?.terms.sections.BIB).toEqual(['Quellen']);
    expect(layout?.terms.table).toBe('Tab.');
    expect(layout?.unnumbered).toEqual([]);
    expect(problems.map((problem) => problem.severity)).toEqual(['warning', 'warning', 'warning', 'warning']);
  });

  test('the empty paper document and the preview name files of the folder; a missing one is no warning for a document (R-LAY-009)', () => {
    expect(parseLayout(JSON.stringify({ format: formatText, document: 'document.md', preview: 'document.pdf' }), 'x', 'file:///x/')).toMatchObject({ layout: { document: 'document.md', preview: 'document.pdf' }, problems: [] });
    expect(parseLayout(JSON.stringify({ format: formatText }), 'x', 'file:///x/').problems).toEqual([]);
    const { layout, problems } = parseLayout(JSON.stringify({ format: formatText, document: '../a.md', preview: 3 }), 'x', 'file:///x/');
    expect(layout?.document).toBeUndefined();
    expect(layout?.preview).toBeUndefined();
    expect(problems.map((problem) => problem.message)).toEqual(['The field "document" of the layout "x" must name a file of the layout folder.', 'The field "preview" of the layout "x" must name a file of the layout folder.']);
  });

  test('a layout can number special sections, hyphenate the reference list and leave the front part out of the table of contents', () => {
    const { layout, problems } = parseLayout(JSON.stringify({ format: formatText, headings: { numberedSections: ['bib', 'XYZ'] }, references: { hyphenate: true }, contents: { front: false } }), 'x', 'file:///x/');
    expect(layout?.numberedSections).toEqual(['BIB']);
    expect(layout?.references).toEqual({ hyphenate: true });
    expect(layout?.contentsFront).toBe(false);
    expect(problems.map((problem) => problem.message)).toEqual(['The layout "x" has the unknown section "XYZ" in "headings.numberedSections"; the sections are TOC, LOF, LOT, LOL, BIB, ADT, AST, ACC, FWD, APX.']);
  });

  test('the built-in layout plain is a valid layout', () => {
    const { layout, problems } = parseLayout(fs.readFileSync(path.join(repository, 'layouts/plain/layout.json'), 'utf8'), 'plain', 'file:///builtin/plain/');
    expect(problems).toEqual([]);
    expect(layout?.fields.title.required).toBe(true);
    for (const file of [...(layout?.stylesheets ?? []), ...(layout?.before ?? []), layout?.document ?? '']) {
      expect(fs.existsSync(path.join(repository, 'layouts/plain', file)), file).toBe(true);
    }
  });

  test('German and English have their words, and another language the English ones', () => {
    expect(termsFor('de-CH').figure).toBe('Abbildung');
    expect(termsFor('en-GB').sections.APX).toContain('Appendix');
    expect(termsFor('fr').table).toBe('Table');
  });
});

describe('templates (R-LAY-004)', () => {
  test('fields, escaped, and parts for fields with and without a value', () => {
    expect(fill('<p>{{title}}</p>{{#sub}}<i>{{sub}}</i>{{/sub}}{{^sub}}none{{/sub}}', { title: 'A & <B>' })).toBe('<p>A &amp; &lt;B&gt;</p>none');
    expect(fill('{{#a}}[{{#b}}{{b}}{{/b}}]{{/a}}', { a: '1', b: '2' })).toBe('[2]');
  });

  test('the name of the PDF from the pattern, without empty parts, else from the name of the file', () => {
    expect(pdfNameOf('{{nr}}_{{author}}_{{type}}', { nr: '0025', author: 'Mag. Hannes Stauß', type: '', file: 'paper' })).toBe('0025_Mag.-Hannes-Stauss.pdf');
    expect(pdfNameOf('{{title}}', { title: '', file: 'concept.paper' })).toBe('concept.paper.pdf');
  });
});

describe('hyphenation (R-REN-007)', () => {
  test('soft hyphens in the words of the text, not in addresses, gender forms, headings, links and code', () => {
    const hyphenate = hyphenatorOf('de-AT');
    expect(hyphenate).toBeDefined();
    const html = hyphenateHtml('<h1>Wirtschaftspädagogik</h1><p>Wirtschaftspädagogik der Schüler:innen, https://example.com/Wirtschaftspädagogik <a href="x">Wirtschaftspädagogik</a> <code>Wirtschaftspädagogik</code></p>', hyphenate!);
    expect(html).toContain('<h1>Wirtschaftspädagogik</h1>');
    expect(html).toContain(`Wirt${softHyphen}schafts`);
    expect(html).toContain('Schü');
    expect(html).toContain(':innen');
    expect(html).toContain(' https://example.com/Wirtschaftspädagogik ');
    expect(html).toContain('<a href="x">Wirtschaftspädagogik</a>');
    expect(html).toContain('<code>Wirtschaftspädagogik</code>');
  });

  test('words joined by a slash get soft hyphens, paths do not', () => {
    const hyphenate = hyphenatorOf('de-AT')!;
    expect(hyphenate('(zentrale Forschungsfrage/n)')).toBe(`(zen${softHyphen}tra${softHyphen}le For${softHyphen}schungs${softHyphen}fra${softHyphen}ge/n)`);
    for (const path of ['/usr/share/Wirtschaftspädagogik', './Wirtschaftspädagogik', '~/Wirtschaftspädagogik', 'bilder/Wirtschaftspädagogik.png']) {
      expect(hyphenate(path)).toBe(path);
    }
  });

  test('a language without patterns gets no hyphenation', () => {
    expect(hyphenatorOf('ja-JP')).toBeUndefined();
    expect(hyphenatorOf('en-GB')).toBeDefined();
  });
});

describe('the page (R-REN-001, R-REN-008)', () => {
  test('the layout of the repository, its style sheet with the addresses of its files, the template with the fields, and the policy of the scripts', async () => {
    const host = hostOf({
      'file:///repo/layouts/thesis/layout.json': thesis,
      'file:///repo/layouts/thesis/page.css': '@font-face { src: url(fonts/a.ttf); } .x { background: url("https://e.com/b.png"); }',
      'file:///repo/layouts/thesis/cover.html': '<img src="images/logo.png" onload="x()"><h1>{{title}}</h1><script>alert(1)</script>',
    });
    const rendered = await render(host, 'file:///repo/paper/paper.md', '---\nlayout: thesis\ntitle: Agenten\nauthor: Hannes Stauss\n---\n# Teil\n');
    expect(rendered.problems).toEqual([]);
    expect(rendered.layout.id).toBe('thesis');
    expect(rendered.title).toBe('Agenten');
    expect(rendered.pdfName).toBe('Hannes-Stauss_Agenten.pdf');
    expect(rendered.html).toContain('url("https://resource/repo/layouts/thesis/fonts/a.ttf")');
    expect(rendered.html).toContain('url("https://e.com/b.png")');
    expect(rendered.html).toMatch(/<section class="paper-template paper-template-cover" data-template="cover"[^>]*>\n<img src="https:\/\/resource\/repo\/layouts\/thesis\/images\/logo.png"><h1>Agenten<\/h1>\n<\/section>/);
    expect(rendered.html).not.toContain('alert(1)');
    expect(rendered.html).toContain(`script-src 'nonce-abc'`);
    expect(rendered.html).toContain('<base href="https://resource/repo/paper/">');
    expect(rendered.html).toContain('--field-kapitelumbruch: "ja";');
    // The body, the template sections and the text have the fields as attributes, because Paged.js applies the
    // breaks and the named pages to the content without its body.
    expect(rendered.html).toMatch(/<body [^>]*data-field-author="Hannes Stauss"/);
    for (const start of ['<section class="paper-template paper-template-cover" ', '<main class="paper-text" ']) {
      const tag = rendered.html.slice(rendered.html.indexOf(start)).split('>')[0];
      expect(tag).toContain('data-field-author="Hannes Stauss"');
      expect(tag).toContain('data-field-kapitelumbruch="ja"');
    }
    expect(rendered.html).toContain('<html lang="de-AT">');
    expect(rendered.html).toContain('<script nonce="abc" src="https://resource/paged.js"></script>');
  });

  test('a file without a layout gets the built-in layout plain, and the field lang changes its language', async () => {
    const rendered = await render(hostOf({}), 'file:///repo/notes.md', '---\nlang: de-AT\n---\n# Abbildungsverzeichnis\n\n# Teil\n\nFigure: Bild\n\n![Bild](b.png)\n');
    expect(rendered.layout.id).toBe('plain');
    expect(rendered.layout.language).toBe('de-AT');
    expect(rendered.body.figures[0].label).toBe('Abbildung 1');
    expect(rendered.pdfName).toBe('notes.pdf');
  });

  test('a layout that does not exist is an error, and the page gets the layout plain', async () => {
    const rendered = await render(hostOf({}), 'file:///repo/a.md', '---\nlayout: missing\n---\n');
    expect(rendered.layout.id).toBe('plain');
    expect(rendered.problems[0]).toMatchObject({ severity: 'error' });
  });

  test('the search for a layout goes up to the top folder, and no further', async () => {
    const files = { 'file:///repo/layouts/a/layout.json': JSON.stringify({ format: formatText }), 'file:///layouts/b/layout.json': JSON.stringify({ format: formatText }) };
    expect((await findLayout(hostOf(files), 'file:///repo/x/y/doc.md', 'a')).layout?.folder).toBe('file:///repo/layouts/a/');
    expect((await findLayout(hostOf(files), 'file:///repo/x/y/doc.md', 'b')).layout).toBeUndefined();
    expect((await findLayout(hostOf(files), 'file:///repo/doc.md', '../a')).problems[0].message).toContain('no name of a folder');
  });

  test('relative addresses only: a style sheet and a template keep the addresses with a scheme, an anchor or a root', () => {
    const resource = (url: string) => `R:${url}`;
    expect(rewriteCss('a{b:url(#x)}c{d:url(/e.png)}f{g:url( h.png )}', 'file:///l/page.css', resource)).toBe('a{b:url(#x)}c{d:url(/e.png)}f{g:url("R:file:///l/h.png")}');
    expect(rewriteHtml('<a href="#x"></a><img src="i.png">', 'file:///l/c.html', resource)).toBe('<a href="#x"></a><img src="R:file:///l/i.png">');
  });
});

describe('checks of the front matter (R-DOC-002)', () => {
  test('a file of a layout gets a warning for each missing required field, at the field or at the field layout', async () => {
    const host = hostOf({ 'file:///repo/layouts/thesis/layout.json': thesis });
    const checked = await checkDocument(host, 'file:///repo/a.md', '---\nlayout: thesis\ntitle: ""\n---\n');
    expect(checked.problems.map((problem) => [problem.line, problem.column, problem.length, problem.message.slice(0, 40)])).toEqual([
      [2, 0, 5, 'The layout "thesis" needs the field "tit'],
      [1, 0, 6, 'The layout "thesis" needs the field "aut'],
    ]);
  });

  test('a value that is not one of the values of its field is a warning at the field', async () => {
    const layout = JSON.stringify({ format: formatText, fields: { schrift: { description: 'Die Schrift.', default: 'arial', values: ['arial', 'times'] } } });
    const host = hostOf({ 'file:///repo/layouts/fonts/layout.json': layout });
    const checked = await checkDocument(host, 'file:///repo/a.md', '---\nlayout: fonts\nschrift: serif\n---\n');
    expect(checked.problems).toEqual([{ severity: 'warning', message: 'The field "schrift" of the layout "fonts" is one of: arial, times.', file: 'file:///repo/a.md', line: 2, column: 0, length: 7 }]);
    expect((await checkDocument(host, 'file:///repo/a.md', '---\nlayout: fonts\nschrift: times\n---\n')).problems).toEqual([]);
    expect(frontMatterOf({ id: 'fonts', fields: { schrift: { description: 'Die Schrift.', required: false, values: ['arial', 'times'] } } })).toContain('# Die Schrift. Values: arial, times.\nschrift: ""');
  });

  test('a layout that does not exist is an error at the field layout, and a file without the field gets no check', async () => {
    const checked = await checkDocument(hostOf({}), 'file:///repo/a.md', '---\ntitle: x\nlayout: nope\n---\n');
    expect(checked.problems).toHaveLength(1);
    expect(checked.problems[0]).toMatchObject({ severity: 'error', line: 2 });
    expect((await checkDocument(hostOf({}), 'file:///repo/a.md', '---\ntitle: x\n---\n')).problems).toEqual([]);
  });

  test('a link to a figure or a table that does not exist is a warning at its line (R-REN-009)', async () => {
    const host = hostOf({ 'file:///repo/layouts/thesis/layout.json': thesis });
    const checked = await checkDocument(host, 'file:///repo/a.md', '---\nlayout: thesis\ntitle: T\nauthor: A\n---\n\nSiehe [Abbildung 1](#fig-weg).\n');
    expect(checked.problems).toEqual([{ severity: 'warning', message: 'The link #fig-weg names no figure, table, listing or heading of the file.', line: 6, file: 'file:///repo/a.md' }]);
  });
});

describe('scaffold (R-NEW-001 to R-NEW-003)', () => {
  const plain = parseLayout(fs.readFileSync(path.join(repository, 'layouts/plain/layout.json'), 'utf8'), 'plain', 'file:///builtin/plain/').layout!;

  test('a new document has the front matter of its layout with the descriptions, and the start of the layout', () => {
    const text = newDocumentText(plain, '# Start\n', { title: 'Ein "Titel"' });
    expect(text).toMatch(/^---\n# nimblescape Markdown Paper\. The rules of this file: npx -y @nimblescape\/markdownpaper instructions document\nlayout: plain\n# \(required\) The title/);
    expect(text).toContain('title: "Ein \\"Titel\\""');
    expect(text.endsWith('---\n\n# Start\n')).toBe(true);
    expect(readFrontMatter(text)?.values.title).toBe('Ein "Titel"');
    expect(frontMatterOf({ id: 'x', fields: {} }, { extra: 'y' })).toContain('extra: "y"');
  });

  test('a new layout is a copy with its name and language in layout.json', () => {
    const files = newLayoutFiles(new Map([['layout.json', encoder.encode(JSON.stringify({ format: formatText, name: 'Plain', language: 'en-US' }))], ['page.css', encoder.encode('p{}')]]), { name: 'mine', language: 'de-AT' });
    expect(files.map((file) => file.path)).toEqual(['layout.json', 'page.css']);
    expect(JSON.parse(files[0].content as string)).toMatchObject({ name: 'mine', language: 'de-AT', format: formatText });
  });

  test('a new project has AGENTS.md, the layout, the document and the folders inbox, bib and images (R-NEW-003)', () => {
    const source = new Map([['layout.json', encoder.encode(fs.readFileSync(path.join(repository, 'layouts/plain/layout.json'), 'utf8'))]]);
    const files = newProjectFiles({ layout: plain, source, language: 'de-AT', values: { title: 'T' } }, undefined);
    expect(files.map((file) => file.path)).toEqual(['AGENTS.md', 'layouts/plain/layout.json', 'paper/paper.md', 'inbox/.gitkeep', 'bib/.gitkeep', 'images/.gitkeep']);
    expect(decoder.decode(encoder.encode(files[0].content as string))).toContain('npx -y @nimblescape/markdownpaper instructions document');
    expect(JSON.parse(files[1].content as string).language).toBe('de-AT');
  });

  test('the empty paper document gives the values of its front matter, and the given values and the defaults come first (R-LAY-009)', () => {
    const start = '<!-- license -->\n---\nlayout: other\ntitle: "Titel eintragen"\nauthor: "Vorname Nachname"\n---\n\n# Start\n';
    expect(splitStart(start)).toEqual({ values: { title: 'Titel eintragen', author: 'Vorname Nachname' }, body: '# Start' });
    expect(splitStart('# Only text\n')).toEqual({ values: {}, body: '# Only text' });
    const text = newDocumentText(plain, start, { title: 'Mein Titel' });
    expect(readFrontMatter(text)?.values).toMatchObject({ layout: 'plain', title: 'Mein Titel', author: 'Vorname Nachname' });
    expect(text.endsWith('---\n\n# Start\n')).toBe(true);
    expect(frontMatterOf({ id: 'x', fields: { kind: { description: 'The kind.', required: false, default: 'thesis' } } }, {})).toContain('kind: "thesis"');
  });

  test('the files that the empty paper document links to go with it, and the links outside code get ../ in paper/ (R-LAY-009)', () => {
    const start = [
      '---',
      'title: "T"',
      '---',
      '',
      'Figure 1: Folders <a id="fig-folders"></a>',
      '',
      '![Folders](images/the%20folders.svg)',
      '',
      'Listing 1: [Mean](code/mean.py#L1-L3) (mean.py, L1-L3)',
      '',
      '<!-- listing: code/mean.py#mean -->',
      '',
      '```markdown',
      '![Folders](images/the%20folders.svg)',
      '```',
      '',
      'Write `![x](images/the%20folders.svg)`, see [the site](https://example.com/a%2Fb) and [missing](images/none.png).',
    ].join('\n');
    const source = new Map([
      ['layout.json', encoder.encode(JSON.stringify({ format: formatText, name: 'Plain', preview: 'document.pdf' }))],
      ['document.pdf', encoder.encode('%PDF')],
      ['images/the folders.svg', encoder.encode('<svg/>')],
      ['code/mean.py', encoder.encode('def mean(): pass\n')],
    ]);
    expect(linkedFiles(start, source)).toEqual(['code/mean.py', 'images/the folders.svg']);
    expect(startFiles(start, source).map((file) => file.path)).toEqual(['code/mean.py', 'images/the folders.svg']);
    expect(startFiles(undefined, source)).toEqual([]);
    const moved = rebaseLinks(start, ['code/mean.py', 'images/the folders.svg'], '../').split('\n');
    expect(moved[6]).toBe('![Folders](../images/the%20folders.svg)');
    expect(moved[8]).toBe('Listing 1: [Mean](../code/mean.py#L1-L3) (mean.py, L1-L3)');
    expect(moved[10]).toBe('<!-- listing: ../code/mean.py#mean -->');
    // A code block, a code span, another address and a link to no file of the layout stay as they are.
    expect(moved[13]).toBe('![Folders](images/the%20folders.svg)');
    expect(moved[16]).toBe('Write `![x](images/the%20folders.svg)`, see [the site](https://example.com/a%2Fb) and [missing](images/none.png).');
    expect(mapLinks('[a](b%zz)', (target) => target)).toBe('[a](b%zz)');

    const files = newProjectFiles({ layout: plain, source, language: 'en-US', values: {} }, start);
    expect(files.map((file) => file.path)).toEqual(['AGENTS.md', 'layouts/plain/code/mean.py', 'layouts/plain/images/the folders.svg', 'layouts/plain/layout.json', 'code/mean.py', 'images/the folders.svg', 'paper/paper.md', 'inbox/.gitkeep', 'bib/.gitkeep', 'images/.gitkeep']);
    expect(files.find((file) => file.path === 'paper/paper.md')?.content).toContain('![Folders](../images/the%20folders.svg)');
    // A copy of the layout leaves its preview PDF out, because it shows the pages of the other layout.
    expect(newLayoutFiles(source, { name: 'mine' }).map((file) => file.path)).toEqual(['code/mean.py', 'images/the folders.svg', 'layout.json']);
  });

  test('the built-in layout plain has its empty paper document, its preview and the files that the document links to (R-LAY-009)', () => {
    const folder = path.join(repository, 'layouts/plain');
    expect(plain.document).toBe('document.md');
    expect(plain.preview).toBe('document.pdf');
    expect(fs.existsSync(path.join(folder, 'document.pdf'))).toBe(true);
    const start = fs.readFileSync(path.join(folder, 'document.md'), 'utf8');
    const source = new Map(['images/project-folders.svg', 'code/mean.py'].map((file) => [file, fs.readFileSync(path.join(folder, file))]));
    expect(linkedFiles(start, source)).toEqual(['code/mean.py', 'images/project-folders.svg']);
    expect(splitStart(start).values).toMatchObject({ title: 'Enter the title', author: 'First name Last name' });
  });

  test('AGENTS.md names the files of the sources by the IDs of decision 22 (R-CITE-001)', () => {
    const agents = newProjectFiles({ layout: plain, source: new Map(), language: 'de-AT', values: {} }, undefined)[0].content as string;
    for (const example of ['bib/hong2024.pdf', 'hong2024a.pdf', 'worldeconomicforum2025.pdf', 'bgbl-ii-262-2015.pdf', 'eu-2024-1689.pdf', 'wirtschaftskammeroesterreich.pdf', 'bgbl-242-1962-fassung-2027-08-01.pdf']) {
      expect(agents).toContain(example);
    }
  });
});

test('the instructions print the documents of docs/ without their license comment (R-CLI-003)', () => {
  expect(topics.map((topic) => topic.name)).toEqual(['document', 'layout', 'render']);
  for (const topic of topics) {
    expect(topic.text.startsWith('# '), topic.name).toBe(true);
    expect(topic.text).toBe(fs.readFileSync(path.join(repository, 'docs', `${topic.name}.md`), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, ''));
  }
  expect(topicList('npx -y @nimblescape/markdownpaper')).toContain('  document   writing a document');
});

test('a file with the field layout is a paper document, and another Markdown file a notes document (R-DOC-004)', () => {
  expect(isPaperDocument('---\nlayout: plain\ntitle: "Ein Bericht"\n---\n\n# Teil\n')).toBe(true);
  expect(isPaperDocument('---\r\nlayout: pht-thesis\r\n---\r\nText\r\n')).toBe(true);
  // Notes, footnotes, figures and links of Markdown Notes make no paper document.
  expect(isPaperDocument('# Notizen\n\nText[^note-7k2q]\n\n![Bild](a.png) <a id="fig-a"></a>\n\n[^note-7k2q]: **hannes** · 2026-10-30\n')).toBe(false);
  expect(isPaperDocument('---\ntitle: "Nur Notizen"\n---\nText\n')).toBe(false);
  // The field must be in the front matter, not in the text.
  expect(isPaperDocument('Text\n\n---\nlayout: plain\n---\n')).toBe(false);
});
