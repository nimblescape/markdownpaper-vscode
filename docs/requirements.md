<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Requirements

This document lists what nimblescape Markdown Paper must do. It is the
specification of the extension and of the npm package
`@nimblescape/markdownpaper` (Hannes, 2026-10-30, 02:38: "all of our
specifications go as a spec doc into the repository"). Each requirement has
an ID as its heading, so that code, tests and pull requests can link to it,
for example `[R-REN-004](docs/requirements.md#r-ren-004)`. A requirement
names the message of Hannes that asks for it, with its date and time.

Markdown Paper makes the pages and the PDF of a document that is written in
Markdown, in a layout that the repository of the document defines: a folder
with a description of the fields, style sheets and templates. One renderer
makes the page preview in VS Code and the PDF, so the preview shows the pages
of the PDF. The extension nimblescape Markdown Notes keeps the notes of the
authors in the same Markdown files; the pages leave them out.

The first design is the outline
[Markdown Paper: layouts and renderer](https://claude.ai/artifact/JmuuLpVRp9zo2yYBPzaMNk).
This document replaces it where the two differ.

## Plan

| Step | Content | Requirements | State |
| --- | --- | --- | --- |
| 1 | Setup: manifest, build, tests, CI, release workflows, license notices, the same structure as the other nimblescape extensions | [R-GEN-001](#r-gen-001) to [R-GEN-006](#r-gen-006) | done |
| 2 | The front matter and its checks, the hover of the fields | [R-DOC-001](#r-doc-001) to [R-DOC-003](#r-doc-003) | done |
| 3 | The layout folder, `layout.json`, the style sheets, the templates, the words of the language, the built-in layout `plain` | [R-LAY-001](#r-lay-001) to [R-LAY-005](#r-lay-005) | done |
| 4 | The renderer: HTML and Paged.js, the notes left out, numbered headings, footnotes at the foot of the page, hyphenation | [R-REN-001](#r-ren-001) to [R-REN-003](#r-ren-003), [R-REN-007](#r-ren-007), [R-REN-008](#r-ren-008) | done |
| 5 | The special sections without numbers, the table of contents, the list of figures, the list of tables, the captions, the appendix | [R-REN-004](#r-ren-004) to [R-REN-006](#r-ren-006) | done |
| 6 | The PDF with an installed Chrome, Chromium or Edge | [R-PDF-001](#r-pdf-001) to [R-PDF-003](#r-pdf-003) | done |
| 7 | The page preview | [R-PRV-001](#r-prv-001) to [R-PRV-004](#r-prv-004) | done |
| 8 | The scaffold: new document, new layout, new project with `inbox/` and `bib/` | [R-NEW-001](#r-new-001) to [R-NEW-003](#r-new-003) | done |
| 9 | The command `markdownpaper` with `pdf`, `check`, `create`, `new` and `instructions` | [R-CLI-001](#r-cli-001), [R-CLI-003](#r-cli-003) | done |
| 10 | The anchors of figures and tables and the links to them, from the slash commands `/figure`, `/table` and `/ref` of Markdown Notes | [R-REN-009](#r-ren-009) | done |
| 11 | The interface of Markdown Notes: the file behind the clean editing view | [R-GEN-003](#r-gen-003) | done |
| 12 | One formatter command: `markdownpaper format` with the formatter of Markdown Notes, and the format step of the paper in VS Code | [R-CLI-002](#r-cli-002), [R-GEN-003](#r-gen-003) | planned; needs the library of `@nimblescape/markdownnotes` |
| 13 | The citations, the database of the sources, the citation style APA 7 of the PHT, the reference list written by the formatter, the slash commands `/source`, `/cite` and `/research` | [R-CITE-001](#r-cite-001) to [R-CITE-004](#r-cite-004) | planned; the work of Markdown Notes moves here |
| 14 | A layout from a Word template by an AI agent, tried with the template of the PHT | [R-LAY-006](#r-lay-006) | instructions done; the first layout planned |
| 15 | The first release on the Visual Studio Marketplace and on npmjs.com | [R-GEN-005](#r-gen-005) | planned; only when Hannes asks |

## General

### R-GEN-001

**Purpose and the two packages.** Markdown Paper holds the workflow of a
paper: layouts, the renderer, the page preview, the PDF, the scaffold of new
projects, the instructions for AI agents, and the citations
([decision 1](#decisions), [decision 11](#decisions)). Markdown Notes holds
the notes and the footnotes of Markdown files and has its value on its own
(Hannes, 2026-10-29, 22:07: "one markdonw-paper that creates and scaffolds all
the paper workflow, then the markdownnotes which has its value on its own";
22:11: "we want a clean split and and the notes shall still be markdown
related").

- Markdown Paper uses Markdown Notes through its interface
  ([R-GEN-003](#r-gen-003)); Markdown Notes knows nothing of Markdown Paper.
- Markdown Paper works without Markdown Notes: then a Markdown file has no
  clean editing view and no slash commands of the notes, and the pages still
  leave the notes out ([R-REN-002](#r-ren-002)).
- The extension extends the editors that VS Code has for Markdown files. It
  adds one editor of its own, the page preview ([R-PRV-001](#r-prv-001)).

### R-GEN-002

**VS Code, Marketplace rules and privacy.** The extension supports VS Code
1.125 and later and uses no proposed API of VS Code, because the Visual Studio
Marketplace does not accept extensions that use one.

- Restricted Mode: the page preview, the checks and the scaffold work. A
  workspace that is not trusted cannot set the program of the browser
  (`browserPath` of [R-SET-001](#r-set-001)), so it cannot start a program.
- Virtual workspaces: the page preview and the checks work; "Export PDF"
  needs a file on the disk, because the browser reads the file and its images
  from the disk.
- The extension collects no telemetry and connects to no address. It starts
  a program only for "Export PDF": the browser of [R-PDF-002](#r-pdf-002).
- The pages run only the scripts of the renderer ([R-REN-001](#r-ren-001)).

### R-GEN-003

**The interface of Markdown Notes.** Markdown Notes returns a versioned
interface from its activation, as the Git extension of VS Code does:
`getAPI(version)`. Markdown Paper asks for the version that it knows and works
without it. The two threads of the build agreed on it on 2026-10-30, 02:08.

- Version 1: `fileOf(uri)` returns the file behind a document of the clean
  editing view of Markdown Notes (scheme `markdown-notes`), so that the page
  preview, the checks and "Export PDF" read the file itself, with its
  footnotes. Without the interface, the file is the open document with the
  same path.
- Planned in the same version: `registerFormatStep(step)` with
  `applies(lines, file)` and `format(lines, file)`, a step of the formatter of
  Markdown Notes, for [R-CLI-002](#r-cli-002) and
  [R-CITE-004](#r-cite-004); `registerHiddenBlocks({ find(lines) })`, blocks
  at the end of a file that the clean editing view leaves out, for the
  database of [R-CITE-001](#r-cite-001); `registerSlashCommand({ label,
  description, detail, run(editor, range) })`, a slash command of the text
  editor (a slash and small letters), for `/source`, `/cite` and `/research`
  of [R-CITE-002](#r-cite-002). Each call returns a `Disposable`. Markdown
  Notes has them since commit `bf3b719` of its
  [pull request 1](https://github.com/nimblescape/nimblescape-markdown-notes/pull/1).
- The npm package of Markdown Notes, `@nimblescape/markdownnotes`, gives its
  formatter as the library function `formatMarkdown(lines)` for
  [R-CLI-002](#r-cli-002).
- The IDs: Markdown Notes is `nimblescape.nimblescape-markdownnotes`
  (Hannes, 2026-10-30, 02:04).

### R-GEN-004

**Licenses.** `THIRD-PARTY-NOTICES.md` names every package that the build
bundles into the extension or into the npm package, with its version, its
license and the place of its source code, and holds the text of each license.

### R-GEN-005

**Name and release.** The extension ID is `nimblescape.nimblescape-markdownpaper`,
the display name "nimblescape Markdown Paper", and the repository
`nimblescape/markdownpaper-vscode` (Hannes, 2026-10-30, 02:01). The publisher is
`nimblescape`. The npm package is `@nimblescape/markdownpaper` with the command
`markdownpaper` ([decision 5](#decisions)). The release uses the same
workflows and checks as the other extensions of the publisher and follows
the [release rules](../CONTRIBUTING.md#release-rules). Nobody publishes the
extension or the npm package until Hannes asks for it.

### R-GEN-006

**Language.** The code, the settings, the commands and the documentation use
English terms: "table of contents", "list of figures", "list of tables",
"reference list", "appendix" (Hannes, 2026-10-30, 02:07: "use the english terms
for it"). The words that the renderer writes into a document, such as
"Inhaltsverzeichnis", "Abbildung 1" or "Anhang A", come from the language of
the layout ([R-LAY-005](#r-lay-005)).

## Documents

### R-DOC-001

**Front matter.** A document is a Markdown file that starts with a front
matter: YAML between two lines `---`.

- The field `layout` names the layout ([R-LAY-001](#r-lay-001)). A file
  without the field gets the built-in layout `plain`.
- The other fields are the fields of the layout ([R-LAY-002](#r-lay-002)).
  The templates show them, and the PDF name uses them.
- The field `lang`, for example `lang: de-AT`, changes the language of the
  layout for this file: the hyphenation and the words of the renderer.
- A new document gets a YAML comment as its first line in the front matter,
  with the command that prints its rules:
  `# nimblescape Markdown Paper. The rules of this file: npx -y @nimblescape/markdownpaper instructions document`.
  A document gets no HTML comment of a format of its own; the comment of the
  format of Markdown Notes stays the only one.
- The renderer reads the text after the front matter with the lines of the
  front matter as empty lines, so the line of each block is its line in the
  file ([R-PRV-003](#r-prv-003)).

### R-DOC-002

**Checks.** A file whose front matter has the field `layout` gets these checks,
in the text editor as warnings after a pause in typing, and with
`markdownpaper check <file>`:

- The layout must exist and be readable; else an error at the field `layout`.
- A problem of `layout.json` shows at the field `layout` and names the file.
- Each required field of the layout must have a value; else a warning at the
  field, or at the field `layout` when the field is missing.
- Each link to `#fig-…` or `#tab-…` must find its figure or table
  ([R-REN-009](#r-ren-009)).
- The page preview adds the problems of the renderer, for example a template
  that does not exist. Each problem shows once.
- `markdownpaper check` prints each problem as `file:line:column: severity:
  message` on the standard error and exits with 0 without problems, 1 with
  problems and 2 when it cannot check.

### R-DOC-003

**Hover of a field.** The pointer on the key of a field of the front matter
shows the description of the field from `layout.json`, and whether it is
required.

## Layouts

### R-LAY-001

**The layout folder.** A layout is a folder `layouts/<name>/` in the
repository of the document (Hannes, 2026-10-29, 21:51: "a repository could
define the layout, the renderer uses that layout to generate the pdf and even
the preview").

- The renderer looks for the folder in the folder of the document, then in
  each folder above it up to the top folder of the workspace or of the
  command, and then in the built-in layouts. The first one counts.
- The name has letters, digits, `.`, `-` and `_`.
- The extension and the npm package hold the built-in layout `plain`: A4, a
  title page, numbered headings, the author and the page number in the
  footer, in English.
- The folder holds `layout.json`, the style sheets, the templates, fonts,
  images, and, for its maker, the source of the layout, for example a Word
  template.

### R-LAY-002

**`layout.json`.** The file describes the layout:

- `format`: `"nimblescape-layout 1.0.0"`, the name and the semantic version
  of the format. A higher minor version adds fields that an older renderer
  leaves out; a higher major version is a format that an older renderer does
  not read, and the checks say so.
- `instructions`: the command that prints the rules of the format for AI
  agents, `npx -y @nimblescape/markdownpaper instructions layout`.
- `name`, `language` (a language tag such as `de-AT`), `citationStyle`.
- `stylesheets`, `before` and `after` (the templates of the fixed pages before
  and after the text), `document` (the start text of a new document).
- `fields`: the fields of the front matter, each with a description, and with
  `required` and `default` when needed.
- `headings`: `numbered`, `depth`, and `unnumbered`, regular expressions of
  headings without a number. `contents.depth`: the depth of the table of
  contents. `hyphenate`. `pdfName`: the name of the PDF with fields, for
  example `{{matrikelnummer}}_{{author}}_{{type}}`. `terms`
  ([R-LAY-005](#r-lay-005)).
- Every path is relative to the layout folder and stays inside it.

`npx -y @nimblescape/markdownpaper instructions layout` prints the whole
format ([docs/layout.md](layout.md)).

### R-LAY-003

**Style sheets.** The style sheets of a layout use CSS Paged Media, which
Paged.js makes into pages ([decision 2](#decisions)): `@page` with size and
margins, margin boxes for the header and the footer, page counters,
`target-counter`, named pages, page breaks, and `@footnote`. The renderer
gives the style sheets fixed parts: the fields as attributes of `<body>` and
as CSS variables (`var(--field-author)` in a margin box), a class for each
template, the classes of the headings, of the special sections, of the
generated lists, of the captions, of the footnotes, of the reference list and
of the appendix. A relative `url()` names a file of the layout folder, for
example a font.

### R-LAY-004

**Templates.** A template is an HTML file of a fixed page, for example the
cover page or the affidavit, with the fields of the front matter:
`{{field}}` writes the value with HTML escapes, `{{#field}}…{{/field}}` writes
the part only when the field has a value, and `{{^field}}…{{/field}}` only when
it has none. A field without a value has the `default` of `layout.json`. A
template has no logic and no script; the renderer removes scripts and event
attributes. A relative `src` or `href` names a file of the layout folder.

### R-LAY-005

**Words of the language.** The renderer finds the special sections by the
words of their headings ([R-REN-004](#r-ren-004)), and writes the word of a
figure, of a table and of an appendix before its number. The words come from
the language of the layout; German and English are built in:

| Code or word | German | English |
| --- | --- | --- |
| `TOC` | Inhaltsverzeichnis, Inhalt | Table of Contents, Contents |
| `LOF` | Abbildungsverzeichnis | List of Figures, List of Illustrations |
| `LOT` | Tabellenverzeichnis | List of Tables |
| `BIB` | Literaturverzeichnis, Literatur, Quellenverzeichnis, Quellen, Bibliographie, Bibliografie | Bibliography, References, Works Cited |
| `ADT` | Eidesstattliche Erklärung, Eidesstattliche Versicherung | Affidavit, Statutory Declaration, Declaration |
| `AST` | Abstrakt, Abstract, Kurzfassung, Zusammenfassung | Abstract, Summary |
| `ACC` | Danksagung, Dank | Acknowledgments, Acknowledgements |
| `FWD` | Vorwort | Foreword, Preface |
| `APX` | Anhang, Anhänge | Appendix, Appendices |
| figure | Abbildung | Figure |
| table | Tabelle | Table |
| appendix | Anhang | Appendix |

`terms` of `layout.json` replaces the words of a code or of a word for the
layout. Another language gets the English words until a layout gives its own.

### R-LAY-006

**A layout from a Word template.** Many schools give a Word template, so an
AI agent makes the layout from it (Hannes, 2026-10-29, 21:56: "many have just
word templates and we shall generate the layout from such a template by an
agent"). `instructions layout` gives the agent the steps: start the folder
with `new layout`, read the XML files of the template (paper size, margins,
styles, numbering, header, footer, images, fonts), write the style sheet and
the templates, list the fields, make the PDF of an example document, and
compare its pages with a PDF of the template page by page until they match.
What CSS cannot do as Word does stays as a comment in the style sheet.

## Renderer

### R-REN-001

**One renderer for the preview and the PDF.** The renderer makes one HTML page
of a document in its layout; Paged.js turns it into pages in the page preview
and in the browser that prints the PDF (Hannes, 2026-10-29, 21:51: "the
renderer can then also be what the preview shows"; [decision 2](#decisions)).

1. It reads the front matter and finds the layout ([R-LAY-001](#r-lay-001)).
2. It reads the style sheets and fills the templates with the fields.
3. It turns the Markdown text into HTML with markdown-it, with HTML in the
   text, links from addresses and footnotes, and the steps of
   [R-REN-002](#r-ren-002) to [R-REN-009](#r-ren-009).
4. It writes the page: a content security policy that lets only the scripts of
   the renderer run, the folder of the document as the base address for
   images, the style sheets, the fields, the fixed pages and the text, and
   Paged.js. The page reports when Paged.js has made all pages.

The renderer uses no API of VS Code, so the extension and the command line use
the same code. Scripts in the Markdown text or in a template do not run.

### R-REN-002

**Notes left out.** The pages leave out the notes of Markdown Notes, as
version 1 of its format defines them: each footnote whose label is `note-` and
four small letters or digits, its references, and the start markers
`<wbr><!--[note-7k2q color-->`. HTML comments do not show. Until Markdown Notes
gives this as a library function, the renderer does it itself at the level of
the tokens of markdown-it.

### R-REN-003

**Headings.** Each heading gets an ID from its text. When the layout numbers
headings, the renderer numbers them as 1, 1.1, 1.1.1 to the depth of the
layout.

- A heading with `{-}` or `{.unnumbered}` at its end gets no number, nor do
  the headings below it. The marker does not show.
- A heading that a pattern of `headings.unnumbered` of the layout matches gets
  no number, nor do the headings below it.
- A file whose headings start with numbers, such as `# 1 Einleitung`, keeps
  its numbers, and the renderer adds none.

### R-REN-004

**Special sections and generated lists.** These sections have no chapter
number, nor do the headings below them (Hannes, 2026-10-30, 02:24 to 02:25:
"TOC …, BIB …, LOF …, LOT … get no chapter numbers, TOC is not part of the
TOC", "there is also ADT …, AST …, ACC … and FWD …, and APX-A (Anhang A,
Appendix A), APX-B (Anhang B, Appendix B), …", "all of which have no chapter
number"):

| Code | Section |
| --- | --- |
| `TOC` | Table of contents (Inhaltsverzeichnis), generated |
| `LOF` | List of figures (Abbildungsverzeichnis), generated |
| `LOT` | List of tables (Tabellenverzeichnis), generated |
| `BIB` | Reference list (Literaturverzeichnis, Bibliography) |
| `ADT` | Affidavit (Eidesstattliche Erklärung) |
| `AST` | Abstract (Abstrakt) |
| `ACC` | Acknowledgments (Danksagung) |
| `FWD` | Foreword (Vorwort) |
| `APX` | Appendix part, with the appendices `APX-A`, `APX-B`, … ([R-REN-006](#r-ren-006)) |

- The renderer finds a special section by the words of its heading in the
  language of the layout ([R-LAY-005](#r-lay-005)), or by its code in curly
  brackets at the end of the heading, for example `# Quellen und Materialien
  {BIB}`. The marker does not show. `BIB` and `APX` count only as chapters
  (`#`).
- The heading gets the class `section-<code>`, the class `unnumbered` and the
  attribute `data-section` with the code, for example `data-section="BIB"`,
  and an appendix `data-section="APX-A"`.
- The renderer generates the table of contents, the list of figures and the
  list of tables in their sections, and replaces what stands there (Hannes,
  2026-10-30, 02:06: "it will also have a TOC generate, a
  Abbildungsverzeichnis, a Tabellenverzeichnis"). Each entry is a link with
  the page of its target, which Paged.js writes with `target-counter`.
- The table of contents lists the headings to the depth of the layout, with
  their numbers, also the special sections and the appendices, but not its
  own heading.
- The list of figures and the list of tables list the label and the text of
  each caption ([R-REN-005](#r-ren-005)).
- The reference list gets no soft hyphens, and the layout gives its entries
  their indent.

### R-REN-005

**Figures and tables.** The renderer numbers the figures and the tables that
have a caption, and the lists of [R-REN-004](#r-ren-004) list them.

- An image alone in its paragraph is a figure, and its text in the square
  brackets is its caption (Hannes, 2026-10-30, 02:09: "every image in the
  document gets its caption from the ![Caption](image)"):
  `![Die Rollen von Agenten im Team](images/rollen.png)` shows "Abbildung 1:
  Die Rollen von Agenten im Team" below the image. An image with an empty text
  is a figure without a caption and without a number. An image within a line
  of text stays in the line.
- A paragraph that starts with `Table:` directly before a table is the caption
  of the table ([decision 8](#decisions)): `Table: Teilnehmende nach
  Schulstufe` shows "Tabelle 1: Teilnehmende nach Schulstufe" above the table.
  The word of the language, for example `Tabelle:`, works too, and a number in
  the caption, as in `Tabelle 3:`, is replaced by the number of the renderer.
  GitHub shows the caption as a paragraph above the table.
- The label is the word of the language and the number: "Abbildung 1",
  "Figure 1", "Tabelle 2". Figures and tables count apart, through the whole
  document; in the appendix see [R-REN-006](#r-ren-006).

### R-REN-006

**Appendix.** A document can have an appendix part (Hannes, 2026-10-30, 02:11:
"there is also an appendix section"). A chapter heading of the words of `APX`,
such as `# Anhang` or `# Appendix`, starts it, usually after the reference
list; each `##` heading in it is one appendix ([decision 9](#decisions)):

- The appendices are labeled with letters: "Anhang A", "Anhang B"
  (`data-section="APX-A"`, `APX-B`). A single appendix has no letter: "Anhang".
- The figures and the tables of an appendix are numbered by its letter: A1,
  A2, B1, as APA 7 does, also when it is the only appendix.
- The table of contents lists each appendix with its label: "Anhang A:
  Interviewleitfaden".
- The layout `plain` starts the appendix part and each appendix on a new page.

### R-REN-007

**Hyphenation.** Justified lines need hyphens, and the browser has no
hyphenation dictionary for every language on every computer. The renderer
puts soft hyphens into the words of the text by the language of the layout,
with the patterns of TeX, so the lines are the same on every computer. It
leaves out headings, links, code, captions, the generated lists, the
reference list, addresses, and every part with the class `no-hyphens`. A
layout turns it off with `"hyphenate": false`.

### R-REN-008

**Footnotes.** A Markdown footnote goes to the foot of the page of its first
reference. The renderer numbers the footnotes 1, 2, 3 in the order of their
first references, whatever their labels are; a second reference shows the
number again. The style sheet of the renderer holds only the rules without
which this does not work in Paged.js; a layout gives the footnotes their
look.

### R-REN-009

**Links to figures and tables.** The slash commands of Markdown Notes write
figures, tables and links to them (Hannes, 2026-10-30, 02:32 and 02:45;
[decision 15](#decisions)): `/figure` picks an image of the folder and inserts
the figure with its caption and its anchor, `/table` inserts a table with its
caption and its anchor, and `/ref` inserts a link to a figure or a table. The
anchor stands at the end of the line of the image or of the caption:

```markdown
![Der Plan der Studie](images/plan.png) <a id="fig-plan"></a>

Table: Noten nach Schulstufe <a id="tab-grades"></a>

[Abbildung 1](#fig-plan) zeigt den Plan, [Tabelle 1](#tab-grades) die Noten.
```

- The anchor gives the figure or the table its ID, and does not show.
- The renderer writes the label of the target as the text of each link to it
  whose text is a word and a number: "Abbildung 1", "Tabelle A1". The page
  always shows the number of the renderer, also in an appendix. A link with
  other words, such as `[den Plan](#fig-plan)`, keeps its text.
- A link to `#fig-…` or `#tab-…` without its figure or table is a warning
  ([R-DOC-002](#r-doc-002)).
- The formatter of Markdown Notes writes the numbers of the links in the order
  of the file; the format step of the paper ([R-CLI-002](#r-cli-002)) will
  write them by the rules of the layout, so the file shows the numbers of the
  pages.
- Markdown Notes defines the form of the anchors and of the links in
  [R-XREF-001](https://github.com/nimblescape/nimblescape-markdown-notes/blob/claude/project-thread-on67uj/docs/requirements.md#r-xref-001)
  and
  [R-XREF-002](https://github.com/nimblescape/nimblescape-markdown-notes/blob/claude/project-thread-on67uj/docs/requirements.md#r-xref-002):
  it writes an anchor only at the end of the line of the image or of the
  caption, with a name from up to three words of the caption, for example
  `tab-participants-grade`, and its clean editing view hides the anchors. The
  renderer also reads an anchor on the line after the caption.

## PDF

### R-PDF-001

**Export PDF.** "Export PDF" in the title bar of a Markdown file and
`markdownpaper pdf <file>` write the PDF of the document.

- The PDF goes beside the Markdown file, with the name that `pdfName` of the
  layout gives; `--output` names another file, and `--html` also writes the
  HTML page.
- The extension shows the progress, and opens the PDF when the setting
  `openPdf` is on ([R-SET-001](#r-set-001)).
- The command prints the path of the PDF and the problems of the document. It
  exits with 0 for a PDF without problems, 1 for a PDF with problems, and 2
  when it wrote no PDF.

### R-PDF-002

**The browser.** An installed Google Chrome, Chromium or Microsoft Edge prints
the PDF ([decision 6](#decisions)). The extension and the command find it at
its usual places on Windows, macOS and Linux; the setting `browserPath`, the
option `--browser` or the environment variable `MARKDOWNPAPER_BROWSER` names
another program. The browser starts without a window, with a profile of its
own in a temporary folder, and talks with the renderer through a pipe, not
through a network port. Without a browser, the message says how to install
one or how to name it.

### R-PDF-003

**The finished PDF.** The PDF loses the marks of the soft hyphens of
[R-REN-007](#r-ren-007), so search and copy find whole words. It gets the
title, the author, the subject and the language of the document in its
metadata, and "nimblescape Markdown Paper" as its creator.

## Page preview

### R-PRV-001

**Pages beside the editor.** "Show Page Preview" in the title bar of a
Markdown file shows the pages of the document in its layout beside the text
editor, as the PDF prints them. Each file has one page preview, and VS Code
restores it after a restart. A file of the clean editing view of Markdown
Notes shows the pages of its file ([R-GEN-003](#r-gen-003)).

### R-PRV-002

**Updates.** The page preview makes the pages again after a pause in typing
(the setting `previewDelay`, [R-SET-001](#r-set-001)), and after a change of a
file of the layout. It makes the new pages beside the old ones and then shows
them, so the pages do not flicker, and it keeps the place on the page.

### R-PRV-003

**From a page to the line.** A click on a block of a page shows its line in
the text editor. Each block of the HTML names its line in the file
(`data-line`).

### R-PRV-004

**Links and safety.** A link to a place in the document goes to that place on
the pages. A link to a web address or an e-mail address opens outside VS Code.
The page preview loads only the files of the workspace and of the extension,
and runs only the scripts of the renderer.

## New files

### R-NEW-001

**New document.** "New Document" and `markdownpaper new document <file>
--layout <name>` write a Markdown file with the front matter of the layout:
the comment line of [R-DOC-001](#r-doc-001), the field `layout`, and each field
with its description as a YAML comment, and the start text of the layout. The
values come from options or questions (Hannes, 2026-10-29, 22:01: "the command
can create an initial markdown file and an initial layout.json").

### R-NEW-002

**New layout.** "New Layout" and `markdownpaper new layout <folder>` copy a
layout, the built-in layout `plain` by default, into a new folder, with the
name and the language of the new layout in `layout.json`.

### R-NEW-003

**New project.** "New Project", `markdownpaper new project <folder>` and
`npx -y @nimblescape/markdownpaper create` write the folders of a new paper,
as a scaffold of Vite does (Hannes, 2026-10-29, 22:01: "and a folder
structure"; 22:02: "it can scaffold, similar as a vite scaffold works"):

| Folder or file | Content |
| --- | --- |
| `AGENTS.md` | The instructions for AI agents: the folders, the commands of the rules, of the checks and of the PDF, and the work of `inbox/`. |
| `layouts/<name>/` | The copy of the layout. |
| `paper/paper.md` | The document ([R-NEW-001](#r-new-001)). |
| `inbox/` | The drop folder for sources that no program can load on its own. |
| `bib/` | The files of the sources, each named after its citation. |
| `images/` | The figures. |

- `inbox/` and `bib/` (Hannes, 2026-10-30, 02:42: "the paper has a folder
  named inbox, it is a drop folder for documents that cannot be loaded
  automatically, and the agent will process and move it to the bib folder,
  renaming it after the citation"): a person puts a source into `inbox/`, for
  example a PDF file. An AI agent reads it, finds its authors, year and title,
  and moves it to `bib/` with the ID of its citation as its name, for example
  `bib/hong2024.pdf`. With the citations ([R-CITE-001](#r-cite-001)), the agent
  also adds the metadata of the source to the database of the document.
- `create` asks for the name of the folder, the layout, the language, the
  title and the author when its options do not give them and a person runs
  it in a terminal; `--yes` asks nothing, for AI agents.
- No command writes a file over an existing file; then it writes nothing and
  names the files.

## Command line

### R-CLI-001

**The command `markdownpaper`.** The npm package `@nimblescape/markdownpaper`
gives the command `markdownpaper` for people and AI agents, with Node.js 22 or
later, also through `npx` without an installation (Hannes, 2026-10-29, 21:58:
"our npmjs package has several commands to output agent instructions").

- `pdf`, `check`, `create`, `new document|layout|project`, `instructions`,
  and later `format` ([R-CLI-002](#r-cli-002)).
- `--help` prints the use, `--version` the version and the version of the
  layout format.
- The exit code is 0 for success, 1 for problems of a document, and 2 for a
  wrong call or a failure.
- The command uses the same renderer, checks and scaffold as the extension.

### R-CLI-002

**One formatter command.** Hannes asked how one formatter command stays when
the notes and the paper are two packages (2026-10-30, 02:27: "now we do not
have a single formatter command anymore, how to handle this", "in npmjs").
The plan:

- `markdownpaper format <file>` is the one formatter of a paper. It calls the
  formatter of Markdown Notes as a library, `formatMarkdown(lines)` of
  `@nimblescape/markdownnotes` ([R-GEN-003](#r-gen-003)), and then the steps of
  the paper: the citations and the reference list ([R-CITE-004](#r-cite-004)),
  and the numbers of the links to figures and tables
  ([R-REN-009](#r-ren-009)).
- `markdownnotes format` stays the formatter of files without a paper.
- In VS Code, the extension registers the steps of the paper as a format step
  of Markdown Notes, so "Format Document" and format on save run all steps in
  one change.

### R-CLI-003

**Instructions for AI agents.** `markdownpaper instructions [topic]` prints
the rules of a topic as Markdown; without a topic, the list of the topics.
The topics are `document` (writing a document), `layout` (the layout folder,
also from a Word template) and `render` (making the PDF and checking its
pages); with the citations, `citations` and the style `apa7` follow. The
documents in `docs/` are the source of the instructions, and the files and
`layout.json` name the command, so an agent finds it (Hannes, 2026-10-29,
21:56: "we need the agent instructions").

## Citations

The citations and the sources go into Markdown Paper (Hannes, 2026-10-30,
02:25, [decision 11](#decisions)). Their form was decided in the work on
Markdown Notes on 2026-10-29 and is kept. The parts that Markdown Notes shows
or formats use its interface ([R-GEN-003](#r-gen-003)).

### R-CITE-001

**The database of the sources.** A document holds the metadata of its sources,
cited or not, in one HTML comment at the end of the file, its database
(Hannes, 2026-10-29, 21:06: "the hidden metadata is the bib database"):

```markdown
<!-- nimblescape-sources
{"id":"hong2024","type":"paper-conference","author":[{"family":"Hong","given":"Sirui"}],"issued":{"date-parts":[[2024]]},"title":"MetaGPT"}
-->
```

- Each line is the metadata of one source in CSL JSON on one line, the data
  format of Zotero, Mendeley and Pandoc. Each source has an `id`, for example
  `hong2024`, which its citations and its file in `bib/` name
  ([R-NEW-003](#r-new-003)).
- No line holds `-->`: a `>` in a text is written as `>`.
- An AI agent adds a source there, for example from a PDF in `inbox/`.
- The checks report a line that is no JSON object, a source without a valid
  `id`, a second source with the same `id`, and a comment without its end.
- The clean editing view of Markdown Notes leaves the database out (a hidden
  block of [R-GEN-003](#r-gen-003)).

### R-CITE-002

**Citations.** A citation is a Markdown link to the entry of its source in the
reference list, and the title of the link holds the data of the citation
(Hannes, 2026-10-29, 21:34: "the page is only in text form, not as data and
text form can change or even be missing dependent on the citationstyle";
21:43: decided "In the title of the link"):

```markdown
Agents change the work of teams ([Hong et al., 2024, S. 3](#hong2024 "page 3")).
[Hong et al. (2024)](#hong2024 "narrative") describe three ways
([Hong et al., 2024](#hong2024); [Shao, 2025](#shao2025)).
```

- The title holds CSL terms, which do not depend on the style: `narrative`
  for a citation in the sentence, and the place in the source, such as
  `page 3`, `page 13-14`, `chapter 2`. A citation without a title is in
  parentheses, without a place. The parentheses stand outside the link.
- The formatter writes the text of each link from the metadata, the title and
  the style; it reads nothing from the old text (Hannes, 21:32: "how does the
  formatter deterministically know what to remove?").
- `(RESEARCH)` asks an AI agent to find a source for the statement before it,
  to add it to the database, and to replace `(RESEARCH)` with its citation.
  The slash command `/research` inserts it (Hannes, 2026-10-29, about 21:20).
- The slash commands of the sources ([decision 15](#decisions); Hannes,
  2026-10-30, 02:45: "lets rethink which command adds an entry in the
  directory which adds a reference to it"): a command named by a noun adds an
  entry, `/cite` adds a reference. `/source` picks a file of the folder `bib/`
  ([R-NEW-003](#r-new-003)) and adds the source to the database and to the
  reference list; `/cite` inserts a citation of a source of the database.
  Markdown Paper registers `/source`, `/cite` and `/research` as slash
  commands of Markdown Notes ([R-GEN-003](#r-gen-003)).

### R-CITE-003

**The citation style.** The layout names the citation style with
`citationStyle`. For now the only style is APA 7 in the German form of the
guide of the PHT, "Zitationsrichtlinien für Abschlussarbeiten an der PHT,
Zitation nach APA 7", version 2.0 (Hannes, 2026-10-29, 19:18: "for now we only
support this APA 7"): one, two and three or more authors, `o. D.`, the letters
`a`, `b`, the places with German labels such as `S. 13 – 14`, the entries with
initials, `(Hrsg.)`, italics, DOIs and `Abgerufen am … von …`.
`markdownpaper instructions apa7` will print the rules.

### R-CITE-004

**The reference list.** The formatter writes the entries of the cited sources
under the heading of the reference list, the section `BIB` of
[R-REN-004](#r-ren-004) (Hannes, 2026-10-29, 21:17: "the agent does not need to
write the entry, the formatter will do it for the agent"):

- Each entry is one paragraph that starts with the anchor of its source:
  `<a id="hong2024"></a>Hong, S., … (2024). *MetaGPT* …`, in the order of the
  style, one for each cited source. An entry of a source that the text no
  longer cites goes.
- A document with citations and without the section gets the section before
  the appendix part, with the heading of the language of the layout.
- The formatter changes only text whose edges the markup marks: the text of a
  link to a source and a paragraph that starts with the anchor of a source.

## Settings

### R-SET-001

**Settings.** The settings of the extension, under
`nimblescape.markdownPaper`:

| Setting | Value | Default |
| --- | --- | --- |
| `browserPath` | The program of Chrome, Chromium or Edge for the PDF ([R-PDF-002](#r-pdf-002)); empty: the extension finds it. Only in the settings of the user or of the computer, not of a workspace. | `""` |
| `previewDelay` | The pause in typing in milliseconds before the page preview makes the pages again, 100 to 10000 ([R-PRV-002](#r-prv-002)). | `800` |
| `openPdf` | Open the PDF after "Export PDF" ([R-PDF-001](#r-pdf-001)). | `true` |

A value of a wrong type counts as the default.

## Decisions

Hannes decided these questions on 2026-10-29 and 2026-10-30. The requirements
above follow them.

1. **Two packages** ([R-GEN-001](#r-gen-001), 2026-10-29, 22:07): Markdown
   Paper for the paper workflow and Markdown Notes for the notes, with a clean
   split (22:11). The other choice was one package for both.
2. **HTML and CSS with Paged.js** ([R-REN-001](#r-ren-001), 2026-10-29, 21:55):
   the renderer makes HTML, Paged.js makes the pages, a browser prints the
   PDF. The other choices were Typst and Pandoc with LaTeX.
3. **The layout is a folder in the repository of the document**
   ([R-LAY-001](#r-lay-001), 2026-10-29, 21:51 to 21:52), and the renderer is
   also the preview.
4. **Instructions and scaffold as npm commands** ([R-CLI-003](#r-cli-003),
   [R-NEW-003](#r-new-003), 2026-10-29, 21:58 to 22:02), not only linked
   Markdown files.
5. **Names** ([R-GEN-005](#r-gen-005), 2026-10-30, 02:01 and 02:04): the
   extension IDs and repositories of Markdown Paper and Markdown Notes. The npm
   package `@nimblescape/markdownpaper` with the command `markdownpaper`
   follows the IDs; Hannes has not confirmed this name yet.
6. **The installed browser prints the PDF** ([R-PDF-002](#r-pdf-002)): the
   extension downloads no Chromium, because a download of about 150 MB for
   each user is not allowed in the Marketplace package and needs a network.
   This choice of the build waits for a confirmation of Hannes.
7. **Generated lists** ([R-REN-004](#r-ren-004), 2026-10-30, 02:06): table of
   contents, list of figures, list of tables; English terms in code and
   documentation (02:07).
8. **Captions** ([R-REN-005](#r-ren-005), 2026-10-30, 02:09 to 02:10): the text
   of an image is its caption; a table gets its caption from a paragraph
   `Table: …` directly before it, which GitHub shows as well. The other
   choices for tables were a caption after the table and an HTML comment.
9. **Appendix** ([R-REN-006](#r-ren-006), 2026-10-30, 02:11): the appendix
   part `# Anhang` with one `##` heading for each appendix is built. The other
   form, each appendix a chapter of its own (`# Anhang A: …`), waits for the
   answer of Hannes on the card in the project thread.
10. **Special sections without chapter numbers** ([R-REN-004](#r-ren-004),
    2026-10-30, 02:24 to 02:25): `TOC`, `LOF`, `LOT`, `BIB`, `ADT`, `AST`,
    `ACC`, `FWD`, `APX-A`, `APX-B`, …; the table of contents does not list
    itself.
11. **Citations and sources in Markdown Paper** ([R-CITE-001](#r-cite-001) to
    [R-CITE-004](#r-cite-004), 2026-10-30, 02:25), not in Markdown Notes.
12. **One spec doc in the repository** (2026-10-30, 02:38): this document.
13. **Links to figures and tables** ([R-REN-009](#r-ren-009), 2026-10-30,
    02:32): anchors at the end of the line of the image or of the caption, and
    links to them.
14. **`inbox/` and `bib/`** ([R-NEW-003](#r-new-003), 2026-10-30, 02:42): the
    drop folder and the folder of the sources of a project.
15. **Slash commands: entries by noun, references by `/ref` and `/cite`**
    ([R-REN-009](#r-ren-009), [R-CITE-002](#r-cite-002), 2026-10-30, 02:47,
    decided with the option "Entries by noun, /ref and /cite link"): `/figure`,
    `/table` and `/source` add an entry; `/ref` and `/cite` add a reference to
    an entry. `/figure`, `/table` and `/ref` belong to Markdown Notes,
    `/source`, `/cite` and `/research` to Markdown Paper.

## Open questions

- The form of the appendix ([decision 9](#decisions)).
- The npm name `@nimblescape/markdownpaper` ([decision 5](#decisions)) and the
  installed browser ([decision 6](#decisions)).
- One formatter command ([R-CLI-002](#r-cli-002)): the plan waits for the
  library of `@nimblescape/markdownnotes`.
- Links to headings and listings (open in Markdown Notes, no decision of
  Hannes yet): `/ref` for a heading with its section number, such as
  `[Section 2.1](#sec-…)` with the anchor at the end of the heading, and
  `/listing` for a code block from marks in source code, with the caption
  `Listing:` and the anchor `lst-…`. When Hannes decides them, the renderer
  numbers these links by the rules of the layout as in
  [R-REN-009](#r-ren-009), and a list of listings may join `LOF` and `LOT`.
- The layout of the PHT thesis: today it lives in the skill
  `markdown-to-paper` of the repository `scalarion/transcribe`; it becomes a
  layout folder of that repository ([R-LAY-006](#r-lay-006)).
