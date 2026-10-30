<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Requirements

This document lists what nimblescape Markdown Paper must do. It is the
specification of the extension and of the npm package
`@nimblescape/markdownpaper`. Each requirement has an ID as its heading, so
that code, tests and pull requests can link to it, for example
`[R-REN-004](docs/requirements.md#r-ren-004)`. The requirements state what is
decided, as a clean summary; the discussions that led to them are not part of
this document ([R-GEN-007](#r-gen-007)).

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
| 1 | Setup: manifest, build, tests, CI, release workflows, license notices, the same structure as the other nimblescape extensions, this specification | [R-GEN-001](#r-gen-001) to [R-GEN-007](#r-gen-007) | done |
| 2 | The front matter and its checks, the hover of the fields | [R-DOC-001](#r-doc-001) to [R-DOC-003](#r-doc-003) | done |
| 3 | The layout folder, `layout.json`, the style sheets, the templates, the words of the language, the built-in layout `plain`, no logic in a layout | [R-LAY-001](#r-lay-001) to [R-LAY-005](#r-lay-005), [R-LAY-008](#r-lay-008) | done |
| 4 | The renderer: HTML and Paged.js, the notes left out, numbered headings, footnotes at the foot of the page, hyphenation | [R-REN-001](#r-ren-001) to [R-REN-003](#r-ren-003), [R-REN-007](#r-ren-007), [R-REN-008](#r-ren-008) | done |
| 5 | The special sections without numbers, the table of contents, the list of figures, the list of tables, the captions, the appendix | [R-REN-004](#r-ren-004) to [R-REN-006](#r-ren-006) | done |
| 6 | The PDF with an installed Chrome, Chromium or Edge, only PDF | [R-PDF-001](#r-pdf-001) to [R-PDF-004](#r-pdf-004) | done |
| 7 | The page preview, first as a view of its own | [R-PRV-001](#r-prv-001) to [R-PRV-004](#r-prv-004) | done; replaced by the pages in the Markdown preview of VS Code in step 16 |
| 8 | The scaffold: new document, new layout, new project with `inbox/` and `bib/` | [R-NEW-001](#r-new-001) to [R-NEW-003](#r-new-003) | done |
| 9 | The command `markdownpaper` with `pdf`, `check`, `create`, `new` and `instructions` | [R-CLI-001](#r-cli-001), [R-CLI-003](#r-cli-003) | done |
| 10 | The anchors of figures and tables, the links to them and to headings, from the slash commands `/figure`, `/table` and `/ref` of Markdown Notes | [R-REN-003](#r-ren-003), [R-REN-009](#r-ren-009) | done |
| 11 | The interface of Markdown Notes: the file behind the clean editing view | [R-GEN-003](#r-gen-003) | done |
| 12 | One formatter command: `markdownpaper format` with the formatter of Markdown Notes, and the format step of the paper in VS Code | [R-CLI-002](#r-cli-002), [R-GEN-003](#r-gen-003) | the steps of the paper done (step 22); the steps of Markdown Notes on the command line need the library of `@nimblescape/markdownnotes` |
| 13 | The citations, the database of the sources, the citation style APA 7 of the PHT, the reference list written by the formatter, the slash commands `/cite` and `/research` | [R-CITE-001](#r-cite-001) to [R-CITE-004](#r-cite-004) | the database, the citations, the reference list and their checks done, in the format step and in `markdownpaper format`; the slash commands and the database hidden in the clean editing view of Markdown Notes planned |
| 14 | A layout from a Word template by an AI agent, tried with the template of the PHT | [R-LAY-006](#r-lay-006), [R-LAY-007](#r-lay-007) | done: the instructions, and the PHT layouts `thesis/` and `concept/` |
| 15 | The first release on the Visual Studio Marketplace and on npmjs.com | [R-GEN-005](#r-gen-005) | planned; only when the owner asks |
| 16 | Paper documents and notes documents: the Markdown preview of VS Code shows the pages of a paper document, with the functions of all plugins; a notes document keeps the Markdown preview as it is | [R-DOC-004](#r-doc-004), [R-PRV-001](#r-prv-001) to [R-PRV-006](#r-prv-006) | done |
| 17 | The Markdown plugins of VS Code, such as Mermaid and PlantUML, in the PDF | [R-REN-010](#r-ren-010) | done in VS Code; the command line is open |
| 18 | Layouts of another repository or of an npm package, found on GitHub by their mark | [R-LAY-007](#r-lay-007) | the repositories on GitHub done in step 28; the name of a layout on GitHub in the front matter and the npm packages wait for a decision |
| 19 | The download of Chromium when no browser is installed | [R-PDF-002](#r-pdf-002) | planned |
| 20 | Listings of Markdown Notes: numbered captions `Listing:` with the cite of the source after them, links `lst-…`, and the numbers of the lines as an option of the layout | [R-REN-011](#r-ren-011), [R-LAY-002](#r-lay-002) | done |
| 21 | Document driven pages: the numbers of the captions from the file, the caption line of a figure, the lists of the special sections from the file, the list of listings | [R-GEN-008](#r-gen-008), [R-REN-004](#r-ren-004), [R-REN-005](#r-ren-005) | done |
| 22 | The format step of the paper that writes the table of contents, the list of figures, the list of tables and the list of listings, in VS Code and in `markdownpaper format` | [R-REN-004](#r-ren-004), [R-CLI-002](#r-cli-002) | done |
| 23 | Citation styles in CSL with citeproc-js: the built-in style `apa7`, a CSL file of the layout, the CSL locales; `pht-apa7.csl` in the PHT layouts | [R-CITE-003](#r-cite-003), [R-GEN-004](#r-gen-004) | done |
| 24 | The metadata of new sources: `markdownpaper source` with DOI, ISBN, PubMed ID, arXiv ID, web address, RIS, BibTeX, CSL JSON, HTML and PDF files, and the title search of Crossref | [R-CITE-005](#r-cite-005) | done |
| 25 | Parameters of a layout (fields with `values`), their check and hover, and the JSON schema of `layout.json` | [R-LAY-002](#r-lay-002), [R-DOC-002](#r-doc-002), [R-DOC-003](#r-doc-003) | done |
| 26 | Layouts close to a Word template: numbered special sections (`headings.numberedSections`), a hyphenated reference list (`references.hyphenate`), the natural spaces of the last line of a justified paragraph whose spaces shrink; the PHT concept layout in the look of its Word template | [R-REN-004](#r-ren-004), [R-REN-007](#r-ren-007), [R-REN-012](#r-ren-012), [R-LAY-002](#r-lay-002) | done |
| 27 | The parts of a document (front part, body, appendix part) as elements for their own pages, and a table of contents without the front part (`contents.front`); the PHT thesis layout in the look of its Word template | [R-REN-013](#r-ren-013), [R-REN-004](#r-ren-004), [R-LAY-002](#r-lay-002) | done |
| 28 | The empty paper document and its preview PDF in each layout; the list of the layouts of `create` and "New Project" with the layouts on GitHub; `markdownpaper layouts` and `markdownpaper preview` | [R-LAY-009](#r-lay-009), [R-NEW-004](#r-new-004), [R-LAY-007](#r-lay-007) | done; the PHT layouts have their empty paper documents and previews |
| 29 | `/cite` with the sources of Zotero: one list with the database of the document and the items of a running Zotero, and the merge of a chosen item into the database | [R-CITE-002](#r-cite-002), [R-CITE-006](#r-cite-006) | planned; the open questions of the discussion document come first |
| 30 | `/research` on a selected argument: the start marker and `(RESEARCH)`, the rules for AI agents and the checks; the slash command needs the slash commands on selected text of Markdown Notes | [R-CITE-002](#r-cite-002), [R-GEN-003](#r-gen-003) | the rules for AI agents and the checks done; the slash command planned |

## General

### R-GEN-001

**Purpose and the two packages.** Markdown Paper holds the workflow of a
paper: layouts, the renderer, the page preview, the PDF, the scaffold of new
projects, the instructions for AI agents, and the citations
([decision 1](#decisions), [decision 11](#decisions)). Markdown Notes holds
the notes and the footnotes of Markdown files and has its value on its own;
the two packages are split cleanly, and the notes stay plain Markdown.

- Markdown Paper uses Markdown Notes through its interface
  ([R-GEN-003](#r-gen-003)); Markdown Notes knows nothing of Markdown Paper.
- Markdown Paper works without Markdown Notes: then a Markdown file has no
  clean editing view and no slash commands of the notes, and the pages still
  leave the notes out ([R-REN-002](#r-ren-002)).
- The extension extends the editors that VS Code has for Markdown files and
  adds no editor of its own: the pages are in the Markdown preview of VS Code
  ([R-PRV-001](#r-prv-001)).

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
  Only the command `markdownpaper source` connects to addresses: to the
  services of the metadata of sources in [R-CITE-005](#r-cite-005), and only
  for the identifiers and files that its call names.
- The pages run only the scripts of the extensions of VS Code
  ([R-PRV-004](#r-prv-004)) and, in the PDF, those of the renderer
  ([R-REN-001](#r-ren-001)); a script in a Markdown file or in a layout does
  not run.

### R-GEN-003

**The interface of Markdown Notes.** Markdown Notes returns a versioned
interface from its activation, as the Git extension of VS Code does:
`getAPI(version)`. Markdown Paper asks for the version that it knows and works
without it.

- Version 1: `fileOf(uri)` returns the file behind a document of the clean
  editing view of Markdown Notes (scheme `markdown-notes`), so that the page
  preview, the checks and "Export PDF" read the file itself, with its
  footnotes. Without the interface, the file is the open document with the
  same path.
- Planned in the same version: `registerFormatStep(step)` with `applies(lines,
  file)` and `format(lines, file)`, a step of the formatter of Markdown Notes,
  for [R-CLI-002](#r-cli-002) and [R-CITE-004](#r-cite-004);
  `registerHiddenBlocks({ find(lines) })`, blocks at the end of a file that the
  clean editing view leaves out, for the database of [R-CITE-001](#r-cite-001);
  `registerSlashCommand({ label, description, detail, run(editor, range) })`, a
  slash command of the text editor (a slash and small letters), for `/cite`
  and `/research` of [R-CITE-002](#r-cite-002). Each call returns a
  `Disposable`. Markdown Notes has them since commit `bf3b719` of its
  [pull request 1](https://github.com/nimblescape/markdownnotes-vscode/pull/1).
  Markdown Paper adds its format step with `registerFormatStep`
  ([R-CLI-002](#r-cli-002)); an older version of Markdown Notes without it
  gets no step.
- Needed from Markdown Notes for `/research` ([decision 43](#decisions)): a
  slash command of another extension that works on selected text, as `/note`
  does: `registerSlashCommand` with `selection: true` offers the command only
  when a typed slash replaced selected text, and `run(editor, range)` gets the
  range of the selected text, which Markdown Notes puts back; and the clean
  editing view hides the start marker `<wbr><!--[research-->` as it hides the
  start marker of a note.
- The npm package of Markdown Notes, `@nimblescape/markdownnotes`, gives its
  formatter as the library function `formatMarkdown(lines)` for
  [R-CLI-002](#r-cli-002).
- The ID of Markdown Notes is `nimblescape.nimblescape-markdownnotes`.

### R-GEN-004

**Licenses.** `THIRD-PARTY-NOTICES.md` names every package that the build
bundles into the extension or into the npm package, with its version, its
license and the place of its source code, and holds the text of each license.
It also names the data files of other projects in the bundle, the CSL style
and the CSL locales of `csl/` ([R-CITE-003](#r-cite-003)), with their
authors and their license. citeproc-js has two licenses to choose from; the
extension uses it under the CPAL 1.0 and does not change its files
([decision 30](#decisions)).

### R-GEN-005

**Name and release.** The extension ID is `nimblescape.nimblescape-markdownpaper`,
the display name "nimblescape Markdown Paper", and the repository
`nimblescape/markdownpaper-vscode`. The publisher is
`nimblescape`. The npm package is `@nimblescape/markdownpaper` with the command
`markdownpaper` ([decision 5](#decisions)). The release uses the same
workflows and checks as the other extensions of the publisher and follows
the [release rules](../CONTRIBUTING.md#release-rules). Nobody publishes the
extension or the npm package until the owner asks for it. Until the release,
nothing is published: no npm package, no extension on the Marketplace and no
release tag. Tests, the CI and other repositories that need a package or a
layout before the release install it from its GitHub repository, at a branch
or a commit ([decision 36](#decisions)).

### R-GEN-006

**Language.** The code, the settings, the commands and the documentation use
English terms: "table of contents", "list of figures", "list of tables",
"list of listings", "reference list", "appendix". The words that the renderer
writes into a document, such as "Inhaltsverzeichnis", "Abbildung 1" or "Anhang A", come from
the language of the layout ([R-LAY-005](#r-lay-005)).

### R-GEN-007

**This specification.** This document holds all requirements of Markdown
Paper, the plan and the decisions ([decision 12](#decisions)). Everything that
is built or decided is in it: each decision is also a requirement, each
function of the extension and of the command is described, and a change of
the code changes this document in the same commit
([decision 34](#decisions)).

- A requirement is the clean summary of a decision: what the extension or
  the command does. It holds no texts of the discussion, such as quotes of
  messages, their dates and times, or the choices that were not taken
  ([decision 23](#decisions)). The discussion stays in discussion documents
  outside the repository.
- The same holds for every file of the repository: the other documents, the
  lists of features, the code comments and the titles of the tests state a
  request as a short summary, without quotes, names, dates or times.

### R-GEN-008

**Document driven.** The Markdown file holds everything that the reader reads
as text, so that it is complete on GitHub and for AI agents without a
renderer ([decision 26](#decisions)):

- The file holds the numbers of the captions (`Figure 1:`, `Table 2:`,
  `Listing 3:`), the numbers in the links to figures, tables, listings and
  headings, the lists of the special sections
  ([R-REN-004](#r-ren-004)), the code of the listings and the reference list.
- The formatter writes these parts and keeps them current, only from the
  file and its source files, the same in VS Code and on the command line, so
  that a check of the format in CI finds a file whose parts are old.
- The headings keep no numbers in the file, because a number changes the ID
  that GitHub gives a heading, and links from other files would break. The
  renderer numbers the headings ([R-REN-003](#r-ren-003)).
- The renderer adds only the look: the layout, the numbers of the headings,
  the page numbers, the numbers of the lines of a listing and the source
  after the caption of a listing. It does not number a caption again.

## Documents

### R-DOC-001

**Front matter.** A document is a Markdown file that starts with a front
matter: YAML between two lines `---`.

- The field `layout` names the layout ([R-LAY-001](#r-lay-001)). A file
  without the field gets the built-in layout `plain`.
- The other fields are the fields of the layout ([R-LAY-002](#r-lay-002)).
  The templates show them, and the PDF name uses them.
- The field `lang`, for example `lang: de-AT`, changes the language of the
  layout for this file: the hyphenation, the words of the renderer and the
  CSL locale of the citations ([R-CITE-003](#r-cite-003)).
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
- The value of a parameter must be one of its names; else a warning at the
  field that lists them ([decision 37](#decisions)).
- Each link to `#fig-…`, `#tab-…`, `#lst-…` or `#sec-…`, and each link whose
  text is a word and a number, such as `[Kapitel 2.1](#methoden)`, must find
  its figure, table, listing or heading ([R-REN-009](#r-ren-009)), and so must
  each entry of the list of a special section ([R-REN-004](#r-ren-004)).
- The checks of the sources and the citations: a citation style that cannot
  be applied ([R-CITE-003](#r-cite-003)), the lines of the database that are
  no source ([R-CITE-001](#r-cite-001)), the titles of citations and each
  `(RESEARCH)` ([R-CITE-002](#r-cite-002)), and the paragraphs of the
  reference list ([R-CITE-004](#r-cite-004)). All of them are warnings.
- The Markdown preview of a paper document adds the problems of the renderer,
  for example a template that does not exist. Each problem shows once.
- `markdownpaper check` prints each problem as `file:line:column: severity:
  message` on the standard error and exits with 0 without problems, 1 with
  problems and 2 when it cannot check.

### R-DOC-003

**Hover of a field.** The pointer on the key of a field of the front matter
shows the description of the field from `layout.json`, whether it is
required, the names of a parameter, and the default. The comment of a field in
a new document lists the names of a parameter too.

### R-DOC-004

**Paper documents and notes documents.** A Markdown file is a paper document
when it uses a feature of Markdown Paper, and a notes document when it uses
only features of Markdown Notes or none ([decision 17](#decisions)).

- The feature of Markdown Paper that makes a file a paper document is the
  field `layout` of the front matter ([R-DOC-001](#r-doc-001)). Whether the
  citations ([R-CITE-002](#r-cite-002)) also make a file a paper document is
  an [open question](#open-questions).
- The features of Markdown Notes, such as notes, footnotes, figures and
  tables with their anchors, and links of `/ref`, do not make a file a paper
  document.
- A paper document gets the checks ([R-DOC-002](#r-doc-002)), its pages in
  the Markdown preview ([R-PRV-005](#r-prv-005)), and the buttons "Show Page
  Preview" and "Export PDF" in the title bar of the editor.
- A notes document keeps the Markdown preview of VS Code, which Markdown Notes
  uses. "Export PDF" in the Command Palette and in the Explorer, and the
  command line, still make the PDF of any Markdown file, with the built-in
  layout `plain` when the file names no layout.

## Layouts

### R-LAY-001

**The layout folder.** A layout is a folder `layouts/<name>/` in the
repository of the document ([decision 3](#decisions)).

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
- `name`, `language` (a language tag such as `de-AT`), `citationStyle` (a
  built-in style or a CSL file of the layout folder,
  [R-CITE-003](#r-cite-003)).
- `stylesheets`, `before` and `after` (the templates of the fixed pages before
  and after the text), `document` and `preview` (the empty paper document and
  its PDF, [R-LAY-009](#r-lay-009)).
- `fields`: the fields of the front matter, each with a description, and with
  `required` and `default` when needed. A field with `values`, a list of
  names, is a parameter of the layout: the author chooses one name in the
  front matter, and the style sheets read the choice from
  `data-field-<field>` ([R-LAY-008](#r-lay-008)). A layout can have any number
  of parameters, each with any number of names, and the layout keeps to itself
  what each name changes, for example the font and the margins of a variant
  ([decision 37](#decisions)).
- `$schema`: the JSON schema of `layout.json`,
  `schemas/layout.schema.json` of this repository. VS Code checks each
  `layouts/<name>/layout.json` with it and completes its keys; a layout of
  another repository names it with its address on GitHub.
- `headings`: `numbered`, `depth`, `unnumbered`, regular expressions of
  headings without a number, and `numberedSections`, the codes of the special
  sections that get a number ([R-REN-004](#r-ren-004)). `contents.depth`: the
  depth of the table of contents; `contents.front: false`: a table of contents
  without the chapters of the front part ([R-REN-013](#r-ren-013)).
  `hyphenate`, and `references.hyphenate` for
  the soft hyphens of the reference list ([R-REN-007](#r-ren-007)).
  `listings.lineNumbers`: the numbers of the lines
  before the code of a listing (`false` by default,
  [R-REN-011](#r-ren-011)). `pdfName`: the name of the PDF with fields, for
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
generated lists, of the captions, of the listings and the numbers of their
lines, of the footnotes, of the reference list and of the appendix. A relative `url()` names a file of the layout folder, for
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
figure, of a table, of a listing and of an appendix before its number. The words come from
the language of the layout; German and English are built in:

| Code or word | German | English |
| --- | --- | --- |
| `TOC` | Inhaltsverzeichnis, Inhalt | Table of Contents, Contents |
| `LOF` | Abbildungsverzeichnis | List of Figures, List of Illustrations |
| `LOT` | Tabellenverzeichnis | List of Tables |
| `LOL` | Listingverzeichnis, Verzeichnis der Listings | List of Listings |
| `BIB` | Literaturverzeichnis, Literatur, Quellenverzeichnis, Quellen, Bibliographie, Bibliografie | Bibliography, References, Works Cited |
| `ADT` | Eidesstattliche Erklärung, Eidesstattliche Versicherung | Affidavit, Statutory Declaration, Declaration |
| `AST` | Abstrakt, Abstract, Kurzfassung, Zusammenfassung | Abstract, Summary |
| `ACC` | Danksagung, Dank | Acknowledgments, Acknowledgements |
| `FWD` | Vorwort | Foreword, Preface |
| `APX` | Anhang, Anhänge | Appendix, Appendices |
| figure | Abbildung | Figure |
| table | Tabelle | Table |
| listing | Listing | Listing |
| appendix | Anhang | Appendix |

`terms` of `layout.json` replaces the words of a code or of a word for the
layout. Another language gets the English words until a layout gives its own.

### R-LAY-006

**A layout from a Word template.** Many schools give a Word template, so an AI
agent makes the layout from it. `instructions layout` gives the agent the
steps: start the folder with `new layout`, read the XML files of the template
(paper size, margins, styles, numbering, header, footer, images, fonts), write
the style sheet and the templates, list the fields, make the PDF of an example
document, and compare its pages with a PDF of the template page by page until
they match. What CSS cannot do as Word does stays as a comment in the style
sheet.

### R-LAY-007

**A layout of another repository or of an npm package.** A layout can also
come from another repository or from an npm package, for example one layout
of the PHT for many students ([decision 18](#decisions)). The folder
`layouts/` of the repository of the document counts first. The PHT layouts
have the repository `majikmate/markdownpaper-layout-pht`, under
CC BY-SA 4.0, and such a repository has a mark on GitHub by which Markdown Paper finds it and applies
it. The mark is the GitHub topic `nimblescape-markdownpaper-layout`: its name
names Markdown Paper, and the page of the topic,
<https://github.com/topics/nimblescape-markdownpaper-layout>, lists every
layout repository ([decision 29](#decisions)). The papers of one repository
can have different layouts, for example the thesis paper and the concept
paper of `scalarion/transcribe`. The PHT layouts are one folder for each
version, for example `thesis-v2/`, where each chapter starts on a new page,
and `concept-v2/`, the same pages for the concept paper, where a chapter
follows the text before it; both have the look of the PHT template and its
citation style.

- A layout repository holds one layout at its root, or several layout
  folders, each with its own `layout.json`, up to two folder levels deep. The
  name of a folder is the name of its layout ([decision 41](#decisions)).
- A layout on GitHub has the name
  `github:<owner>/<repository>/<folder>`, with `@<branch, tag or commit>` for
  another version than the default branch, for example
  `github:majikmate/markdownpaper-layout-pht/thesis-v2`. A new project copies
  it into `layouts/<folder>/` ([R-NEW-004](#r-new-004)), so its documents
  name the copy, for example `layout: thesis-v2`.
- The name of a layout on GitHub in the front matter, without a copy, and the
  form of a layout in an npm package are not decided yet (see the
  [open questions](#open-questions)).

### R-LAY-008

**No logic in a layout.** A layout of version 1 holds only style sheets, the
templates and the fields of the front matter, which the pages get as
attributes, for example `kapitelumbruch: false` as
`data-field-kapitelumbruch="false"` ([R-REN-001](#r-ren-001)), on the body,
on the text `main.paper-text` and on each template section. Paged.js applies
the breaks and the named pages to the content without its body, so a rule
of a break or of a named page that depends on a field starts at the text or
at the template section, for example
`main.paper-text[data-field-kapitelumbruch="nein"] h1 { break-before: auto; }`. It holds no
script, because a layout from another repository would run its code on the
computer of the author ([decision 19](#decisions)). The renderer removes
scripts and event attributes from the templates ([R-LAY-004](#r-lay-004)).

### R-LAY-009

**The empty paper document and its preview.** Each layout holds an empty
paper document and its PDF, so that a person sees the pages of the layout
before choosing it, and a new document starts with an example of each
function ([decision 40](#decisions)).

- `document` of `layout.json` names the empty paper document, a Markdown file
  of the layout folder, and `preview` names its PDF, by convention
  `document.md` and `document.pdf`. The JSON schema of `layout.json` requires
  both fields. The checks of a document do not report a missing one, because
  the author of a document cannot change the layout.
- The front matter of the empty paper document holds the values of the cover
  page, for example the placeholder texts of the Word template of a school;
  its field `layout` is not used. A new document gets these values for the
  fields that its options or answers do not give, and a field without a value
  gets the `default` of `layout.json`.
- The text after the front matter explains how to write a document of the
  layout, with example texts: the text, the headings, the footnotes, the
  figures, the tables, the listings, the citations, the special sections, the
  notes and the PDF. It can link to VS Code and to the extensions.
- The files that the empty paper document links to, for example an image in
  `images/` or the code of a listing in `code/`, are files of the layout
  folder. A new project gets them at the same paths, and the links in
  `paper/paper.md` get `../` before them; a new document gets them beside it.
  Links in code blocks and in code spans stay as they are.
- `markdownpaper preview <layout folder>` makes the preview: it writes a
  project with the empty paper document into a temporary folder, runs the
  format steps of the paper (the citations, the reference list and the lists
  of the special sections), and writes the PDF into the layout folder, with
  the name of `preview`. `--write` also writes the formatted document back
  into the layout folder, with its own front matter.
- "New Layout" and a new project copy a layout without its preview PDF,
  because the PDF shows the pages of the other layout.

## Renderer

### R-REN-001

**One renderer for the preview and the PDF.** The renderer makes one HTML page
of a document in its layout; Paged.js turns it into pages in the page preview
and in the browser that prints the PDF ([decision 2](#decisions),
[decision 3](#decisions)).

1. It reads the front matter and finds the layout ([R-LAY-001](#r-lay-001)).
2. It reads the style sheets and fills the templates with the fields.
3. It turns the Markdown text into HTML with markdown-it, with HTML in the
   text, links from addresses and footnotes, and the steps of
   [R-REN-002](#r-ren-002) to [R-REN-010](#r-ren-010).
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

**Headings.** Each heading gets the ID that GitHub gives it, so that a Markdown
link to a heading, such as `[Kapitel 2.1](#methoden)`, works on GitHub and on
the pages without an added anchor ([decision 16](#decisions)). When the layout
numbers headings, the renderer numbers them as 1, 1.1, 1.1.1 to the depth of
the layout.

- The ID is the text of the heading as the file writes it, also a marker such
  as `{BIB}`, in small letters, without punctuation and with a hyphen for each
  space: `# Quellen {BIB}` is `quellen-bib`. The space before an HTML element
  at the end counts, as on GitHub: `## Leitfaden <a id="x"></a>` is
  `leitfaden-`. A second heading with the same ID gets `-1`, a third `-2`.

- A heading with `{-}` or `{.unnumbered}` at its end gets no number, nor do
  the headings below it. The marker does not show.
- A heading that a pattern of `headings.unnumbered` of the layout matches gets
  no number, nor do the headings below it.
- A file whose headings start with numbers, such as `# 1 Einleitung`, keeps
  its numbers, and the renderer adds none.

### R-REN-004

**Special sections and lists.** These sections have no chapter number, nor do
the headings below them ([decision 10](#decisions)), unless
`headings.numberedSections` of the layout names their code, for a template
that numbers its reference list ([decision 38](#decisions)):

| Code | Section |
| --- | --- |
| `TOC` | Table of contents (Inhaltsverzeichnis), a list |
| `LOF` | List of figures (Abbildungsverzeichnis), a list |
| `LOT` | List of tables (Tabellenverzeichnis), a list |
| `LOL` | List of listings (Listingverzeichnis), a list |
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
- The heading gets the class `section-<code>`, the class `unnumbered` (not
  when it has a number) and the attribute `data-section` with the code, for
  example `data-section="BIB"`, and an appendix `data-section="APX-A"`.
- The file holds the list of each of these four sections, between two hidden
  markers under the heading that the author writes; the formatter writes the
  list and keeps it current ([decision 28](#decisions),
  [R-GEN-008](#r-gen-008)):

  ```markdown
  # Inhaltsverzeichnis

  <!-- toc -->
  - [1 Einleitung](#einleitung)
  - [1.1 Methoden](#methoden)
  - [Anhang A: Interviewleitfaden](#interviewleitfaden)
  <!-- /toc -->

  # Abbildungsverzeichnis

  <!-- lof -->
  - [Abbildung 1: Teilnehmende nach Schulstufe](#fig-teilnehmende)
  <!-- /lof -->
  ```

  The markers of the other lists are `<!-- lot -->` and `<!-- lol -->`. The
  numbers stand in the texts of the links; each figure, table and listing of
  a list needs its anchor `fig-…`, `tab-…` or `lst-…`, which the formatter of
  Markdown Notes gives each caption of a kind whose list marker the file
  holds. On GitHub the lists are lists of links. A list that the format
  writes for the first time gets these anchors in the same format: Markdown
  Notes runs its steps and the steps of other extensions again while the text
  changes, at most three rounds, so the step of the paper writes the entries
  with the anchors ([R-CLI-002](#r-cli-002)).
- The pages show the list of the file with the page of the target of each
  entry, which Paged.js writes with `target-counter`; the rest of the
  section does not show. An entry of the table of contents gets the level of
  its heading, and its number its own element, for the indent of the layout.
  An entry whose target is not in the file is a warning
  ([R-DOC-002](#r-doc-002)). The renderer compares the decoded target, so an
  entry of a heading with letters outside ASCII, such as
  `#eidesstattliche-erklärung`, finds its heading and its page.
- The format step of the paper writes the lists ([R-CLI-002](#r-cli-002)),
  and a section without the markers gets the same list from the renderer:
  the table of contents lists the headings to the depth of the layout, with
  their numbers, also the special sections and the appendices, but not its
  own heading; the list of figures, the list of tables and the list of
  listings list the label and the text of each caption
  ([R-REN-005](#r-ren-005), [R-REN-011](#r-ren-011)).
- The reference list gets no soft hyphens, and the layout gives its entries
  their indent.

### R-REN-005

**Figures and tables.** A figure and a table have their caption in a
paragraph directly before them, with the number that the formatter of
Markdown Notes writes ([decision 8](#decisions), [decision 27](#decisions)),
and the lists of [R-REN-004](#r-ren-004) list them.

- A paragraph that starts with `Figure 1:` directly before an image alone in
  its paragraph is the caption of the figure, and the page shows it above the
  image, as APA 7 does:

  ```markdown
  Figure 1: Teilnehmende nach Schulstufe

  ![Teilnehmende nach Schulstufe](images/teilnehmende.png)
  ```

  An image alone in its paragraph without such a paragraph is a figure
  without a caption and without a number. An image within a line of text
  stays in the line.
- A paragraph that starts with `Table 1:` directly before a table is the
  caption of the table: `Table 1: Teilnehmende nach Schulstufe` shows
  "Tabelle 1: Teilnehmende nach Schulstufe" above the table.
- The word of the language works too, for example `Abbildung 1:` and
  `Tabelle 1:`. GitHub shows a caption as a paragraph above its figure or
  table.
- The pages keep the number of the caption in the file and do not number it
  again ([R-GEN-008](#r-gen-008)). A caption without a number, such as
  `Table:`, gets the next number of its kind, so that a file without the
  format still has numbers.
- The label is the word of the language and the number: "Abbildung 1",
  "Figure 1", "Tabelle 2". Figures and tables count apart, through the whole
  document; in the appendix see [R-REN-006](#r-ren-006).

### R-REN-006

**Appendix.** A document can have an appendix part. A chapter heading of the
words of `APX`, such as `# Anhang` or `# Appendix`, starts it, usually after
the reference list; each `##` heading in it is one appendix ([decision
9](#decisions)):

- The appendices are labeled with letters: "Anhang A", "Anhang B"
  (`data-section="APX-A"`, `APX-B`). A single appendix has no letter: "Anhang".
- The figures, the tables and the listings of an appendix are numbered by its
  letter: A1, A2, B1, as APA 7 does, also when it is the only appendix.
- The table of contents lists each appendix with its label: "Anhang A:
  Interviewleitfaden".
- The layout `plain` starts the appendix part and each appendix on a new page.

### R-REN-007

**Hyphenation.** Justified lines need hyphens, and the browser has no
hyphenation dictionary for every language on every computer. The renderer
puts soft hyphens into the words of the text by the language of the layout,
with the patterns of TeX, so the lines are the same on every computer. It
leaves out headings, links, code, captions, the generated lists, the
reference list, addresses, paths, and every part with the class `no-hyphens`.
Words joined by a slash, such as "Forschungsfrage/n", are words of the text;
a path starts with a slash or has a file name with an extension. A
layout turns it off with `"hyphenate": false`, and hyphenates the reference
list, but not its links, with `"references": { "hyphenate": true }`, as a
Word template with automatic hyphenation does ([decision 38](#decisions)).

### R-REN-008

**Footnotes.** A Markdown footnote goes to the foot of the page of its first
reference. The renderer numbers the footnotes 1, 2, 3 in the order of their
first references, whatever their labels are; a second reference shows the
number again. The style sheet of the renderer holds only the rules without
which this does not work in Paged.js; a layout gives the footnotes their
look.

### R-REN-009

**Links to figures, tables, listings and headings.** The slash commands of Markdown Notes
write figures, tables and links to them ([decision 13](#decisions), [decision
15](#decisions)): `/figure` picks an image of the folder and inserts the figure
with its caption and its anchor, `/table` inserts a table with its caption and
its anchor, and `/ref` inserts a link to a figure, a table or a heading, with
the number of a chapter. The anchor stands at the end of the line of the
caption; the renderer also reads the anchor of a figure at the end of the line
of the image. A heading needs no anchor: a link to a heading is a plain
Markdown link to the ID of the heading ([R-REN-003](#r-ren-003), [decision
16](#decisions)):

```markdown
## Methoden

Figure 1: Der Plan der Studie <a id="fig-plan"></a>

![Der Plan der Studie](images/plan.png)

Table 1: Noten nach Schulstufe <a id="tab-grades"></a>

[Abbildung 1](#fig-plan) zeigt den Plan, [Tabelle 1](#tab-grades) die Noten,
[Kapitel 2.1](#methoden) die Methoden.
```

- The anchor gives the figure or the table its ID, and does not show.
- An anchor at the end of a heading, `## Methoden<a id="sec-methods"></a>`,
  is a second ID of the heading for links, for files that have one; it does
  not show, and the table of contents shows the heading without it.
- The renderer writes the text of each link whose text is a word and a
  number anew: the label of a figure, a table or a listing ("Abbildung 1",
  "Tabelle A1", "Listing 2"), the label of an appendix ("Anhang A"), and for
  another heading the word of the link and the number of the heading
  ("Kapitel 2.1"). So the page always shows the number of the caption or of
  the heading, also in a file whose links are old. A link with other words,
  such as `[den Plan](#fig-plan)`, and a link to a heading without a number,
  for example of a special section, keep their text.
- A link to `#fig-…`, `#tab-…`, `#lst-…` or `#sec-…`, or a link whose text
  is a word and a number, without its target is a warning
  ([R-DOC-002](#r-doc-002)).
- The formatter of Markdown Notes writes the numbers of the captions and of
  the links in the order of the file ([R-GEN-008](#r-gen-008)); the format
  step of the paper ([R-CLI-002](#r-cli-002)) will write the numbers of the
  headings in the links by the rules of the layout, so the file shows the
  numbers of the pages.
- Markdown Notes defines the form of the anchors and of the links in
  [R-XREF-001](https://github.com/nimblescape/markdownnotes-vscode/blob/claude/project-thread-on67uj/docs/requirements.md#r-xref-001),
  [R-XREF-002](https://github.com/nimblescape/markdownnotes-vscode/blob/claude/project-thread-on67uj/docs/requirements.md#r-xref-002)
  and
  [R-XREF-003](https://github.com/nimblescape/markdownnotes-vscode/blob/claude/project-thread-on67uj/docs/requirements.md#r-xref-003):
  it writes an anchor only at the end of the line of the image or of the
  caption, with a name from up to three words of the caption, for example
  `tab-participants-grade`, and its clean editing view hides the anchors. The
  renderer also reads an anchor on the line after the caption.

### R-REN-010

**Markdown plugins.** The page preview and the PDF show what the Markdown
extensions of VS Code add to the Markdown preview, for example the diagrams of
Mermaid and PlantUML ([decision 17](#decisions)).

- In the page preview, the plugins work because the pages are in the
  Markdown preview of VS Code ([R-PRV-005](#r-prv-005)).
- For the PDF, the renderer takes the markdown-it plugins of the extensions
  that contribute `markdown.markdownItPlugins`, as the Markdown preview of
  VS Code does: the extension activates them and gives their function
  `extendMarkdownIt` to the renderer, which calls it on its markdown-it before
  its own steps. The page of the PDF loads the scripts that these extensions
  contribute with `markdown.previewScripts`, also ECMAScript modules, and has
  their style sheets of `markdown.previewStyles` as text. Paged.js makes the
  pages after these scripts have drawn their content: when the page has not
  changed for 200 milliseconds and no diagram of Mermaid waits, at the latest
  10 seconds after the page has loaded. The PDF leaves out the plugin, the
  scripts and the style sheets of the Markdown extension of VS Code itself
  and of Markdown Notes, because the PDF shows no notes
  ([R-REN-002](#r-ren-002)).
- The page of the PDF gives these scripts what the Markdown preview gives
  them: the colors of the theme with the values of a light theme, as in
  [R-PRV-005](#r-prv-005), and the class `vscode-light` on the body.
- A diagram of Mermaid stands in the middle of the text of its page, at most
  as wide as the text, without the parts for the screen: Mermaid puts each
  diagram into an area that the mouse moves and zooms, moved to the middle of
  the width of the page at the time of the drawing, with buttons. The pages of
  the PDF and of the preview leave out the movement and the buttons.
- Footnotes are part of the renderer ([R-REN-008](#r-ren-008)).
- The renderer itself stays without an API of VS Code
  ([R-REN-001](#r-ren-001)): it takes the plugins, the scripts and the style
  sheets as input. On the command line there are no extensions of VS Code
  (see the [open questions](#open-questions)).

### R-REN-011

**Listings.** Markdown Notes writes listings of source code with `/listing`
([R-CODE-001](https://github.com/nimblescape/markdownnotes-vscode/blob/claude/project-thread-on67uj/docs/requirements.md#r-code-001)): a caption line with the cite of
the source, the comment of the source and a fenced code block, whose code
and cite its formatter keeps current
([R-CODE-002](https://github.com/nimblescape/markdownnotes-vscode/blob/claude/project-thread-on67uj/docs/requirements.md#r-code-002)):

````markdown
Listing 1: [Reading the fields](../src/fields.ts#L12-L30) (fields.ts, L12-L30)<a id="lst-reading-fields"></a>

<!-- listing: ../src/fields.ts#read-fields -->

```typescript
export function readFields(lines: readonly string[]): Map<string, string> {
  …
}
```
````

- A paragraph that starts with `Listing:` before a fenced code block, with
  the comment of the source between them or not, is the caption of the
  listing: the page shows "Listing 1: Reading the fields" above the code. The
  word of the language works too. The pages keep the number of the caption
  in the file, `Listing 1:`, which the formatter of Markdown Notes writes, and
  a caption without a number gets the next number, as for a table
  ([R-REN-005](#r-ren-005)). The listings count apart from the figures and
  the tables, through the whole document; in the appendix see
  [R-REN-006](#r-ren-006).
- The caption is a link to its source: the target names the file and the
  lines, `#L12-L30`, one line `#L12`, or the whole file without `#L`. After
  the link, the file holds the cite of the source in parentheses, "(fields.ts,
  L12-L30)", "(fields.ts)" for a whole file ([decision 25](#decisions)). A
  page cannot open the source, so the page shows the text of the caption
  without the link, and the cite of the file after it: "Reading the fields
  (fields.ts, L12-L30)". The renderer adds no cite of its own, and the list
  of listings has the caption without the cite.
- With `"listings": { "lineNumbers": true }` the page shows the number of
  each line before the code of each listing, from 1 in each listing; the
  default is no numbers ([decision 24](#decisions)). Other code blocks get no
  numbers. A number is an element without text that the style sheet shows,
  so a copy of the code from the page preview leaves the numbers out.
- The anchor `lst-…` names the listing for links, and a link such as
  `[Listing 1](#lst-reading-fields)` gets its label
  ([R-REN-009](#r-ren-009)). A listing without an anchor has the ID
  `listing-1`.
- The style sheet of a layout finds the caption by the classes `caption
  listing-caption`, the cite by `caption-source`, the code block by
  `listing`, and the numbers of the lines by `line-number`
  ([R-LAY-003](#r-lay-003)). The captions get no soft hyphens
  ([R-REN-007](#r-ren-007)).
- GitHub and the Markdown preview of a notes document show the caption as a
  link to the source with the cite, and hide the comment and the anchor; the
  clean editing view of Markdown Notes also hides the brackets, the target of
  the link and the cite.

### R-REN-012

**Justified lines with shrinking spaces.** Word shrinks the spaces of a
justified line to fit one more word or syllable on it. A layout does the same
with a negative `word-spacing` on its justified paragraphs, for example
`word-spacing: -0.045em`: the browser breaks the lines with the narrow spaces
and then widens the spaces of each full line to the width of the text. The
last line of a paragraph is not justified, so after Paged.js has made a page,
the renderer gives the last line of each such paragraph that ends on the page
its natural spaces again, in the PDF and in the page preview; when the line
fits only with narrower spaces, they shrink only as far as the line needs. A
change that would add a line to the paragraph does not happen
([decision 38](#decisions)).

### R-REN-013

**The parts of a document.** A document has up to three parts, each from a
chapter (`#`) on, and each part is an element of its own, so that a layout can
give it its own pages, for example a footer without a page number in the front
part, the page number 1 on the first page of the body, and the numbers I, II,
… in the appendix part ([decision 39](#decisions)):

| Part | Element | Chapters |
| --- | --- | --- |
| Front part | `div.paper-part.paper-front` | The special sections `ADT`, `AST`, `ACC`, `FWD`, `TOC`, `LOF`, `LOT` and `LOL` before the first other chapter |
| Body | `div.paper-part.paper-body` | The chapters, from the first other chapter on, with the reference list |
| Appendix part | `div.paper-part.paper-appendix` | The appendix part, from its heading (`APX`) on ([R-REN-006](#r-ren-006)) |

- Text before the first chapter is in no part.
- A special section of the front part gets no number, also when
  `headings.numberedSections` names its code ([R-REN-004](#r-ren-004)); in the
  body it gets one, for example a list of figures after the chapters.
- With `contents.front: false` in `layout.json`, the table of contents lists
  no chapter of the front part, in the list of the formatter and in the list of
  the renderer.
- An entry of the table of contents for a heading of the front part or of the
  appendix part has the class `contents-front` or `contents-appendix`, so that
  the layout can show its page in other numbers, such as I, II, ….
- A `counter-reset: page 1` on a part makes its first page the page 1, and the
  pages after it count on from there, in the footers and in the table of
  contents. The browser does not carry a reset on one page to the pages after
  it, so the renderer sets the number of each page after the layout of the
  page.

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

- When no Chrome, Chromium or Edge is installed, the extension and the command
  download Chromium once and use it ([decision 6](#decisions)). The download
  asks first in VS Code, and needs the option `--download-browser` on the
  command line. Planned.

### R-PDF-003

**The finished PDF.** The PDF loses the marks of the soft hyphens of
[R-REN-007](#r-ren-007), so search and copy find whole words. It gets the
title, the author, the subject and the language of the document in its
metadata, and "nimblescape Markdown Paper" as its creator.

### R-PDF-004

**Only PDF.** The only output of a document is the PDF; there is no Word file
([decision 21](#decisions)).

## Page preview

### R-PRV-001

**The pages in the Markdown preview.** The Markdown preview of VS Code shows
the pages of a paper document ([R-DOC-004](#r-doc-004)) in its layout, as the
PDF prints them ([R-PRV-005](#r-prv-005)). "Show Page Preview" in the title
bar of a paper document opens the Markdown preview beside the text editor;
the keys and buttons of the Markdown preview of VS Code work as for any
Markdown file, and VS Code restores the preview after a restart. A file of
the clean editing view of Markdown Notes shows the pages of its text
([R-GEN-003](#r-gen-003)).

### R-PRV-002

**Updates.** The preview makes the pages again after a pause in typing (the
setting `previewDelay`, [R-SET-001](#r-set-001)), and after a change of a
file of the layout. It makes the new pages beside the old ones and then shows
them, so the pages do not flicker, and it keeps the place on the page.

### R-PRV-003

**From a page to the line, and back.** The pages keep the lines of the file
on their blocks (`data-line`), so the Markdown preview of VS Code works on the
pages as on any Markdown file: a double click on a page shows its line in the
text editor, and the preview follows the scrolling of the text editor and the
other way round.

### R-PRV-004

**Links and safety.** A link to a place in the document goes to that place on
the pages. A link to a web address, an e-mail address or a file works as in
the Markdown preview of VS Code. The page preview runs in the Markdown
preview of VS Code with its rules of safety: only the scripts of the
extensions of VS Code run, among them the script of the pages and Paged.js of
this extension; a script in a Markdown file or in a layout does not run.

### R-PRV-005

**The Markdown preview of a paper.** The Markdown preview of a paper document
shows its pages: there is no other view for the pages ([decision
17](#decisions), [decision 20](#decisions)). A notes document keeps the
Markdown preview as VS Code shows it.

- The extension gives VS Code a markdown-it plugin, as other extensions do
  (`markdown.markdownItPlugins`). For a paper document, the plugin adds the
  steps of the renderer ([R-REN-002](#r-ren-002) to [R-REN-009](#r-ren-009))
  and a hidden element with the layout: its style sheets, its templates
  filled with the fields, and the language.
- The script of the pages (`markdown.previewScripts`) finds that element after
  each update of the preview, waits until the scripts of other extensions
  have drawn their content, for example the diagrams of Mermaid, and lets
  Paged.js make the pages from a copy of the content of the preview.
- The pages stand before the content of the preview, which stays in the page
  but hidden, so that the scripts of other extensions keep their elements and
  VS Code finds the lines on the pages. After the new pages show, the script
  lets VS Code read the lines of the pages again.
- While a paper document shows, the style sheets of the Markdown preview of
  VS Code and of the theme do not apply, and the pages are white paper also
  in a dark theme. The colors of the theme that the scripts of other
  extensions read for their drawings, such as the diagrams of Mermaid, get the
  values of the light theme "Light Modern" of VS Code, so a diagram has the
  colors of white paper.
- The front matter of a paper document does not show on the pages: its
  fields go into the templates of the layout. (VS Code shows the front matter
  of a notes document as a table, as set in `markdown.preview.frontMatter`.)
- When the preview is narrower than a page, the pages get smaller until they
  fit its width; they never get larger than the size of the paper.
- The extension keeps each layout that it read, and reads it again after a
  change of one of its files; then it lets the Markdown preview render again.
  While the extension reads a layout for the first time, the preview shows a
  note "Making the pages…" and then the pages.
- Limit: Paged.js 0.4.3 stops at a single paragraph that is longer than about
  two pages ("Layout repeated"); the pages then end before that paragraph. A
  paragraph of a paper is much shorter, so the extension does not split it.

### R-PRV-006

**The functions of plugins on the pages.** Every function that a Markdown
plugin gives the Markdown preview works on the pages as well
([decision 20](#decisions)). For Markdown Notes: the highlights of the notes,
a click on a highlight that selects its note, and "Add Note" above a selected
passage.

- The pages are copies of the blocks of the preview, with their attributes,
  among them `data-line`; a script that listens on the document, not on one
  element, works on them.
- A script that draws into elements of the preview after each update, such as
  the script of Mermaid, does not find the copies on the pages, so it does not
  remove or draw them again: the copy of an element `.mermaid` gets the class
  `nimblescape-paper-mermaid`, and each ID of a drawing (`svg[id]`) gets the
  prefix `nimblescape-paper-`, also in the style sheet of the drawing. The
  script of the pages makes the pages after such a drawing is done; when a
  drawing is still missing after 5 seconds, it makes the pages and tries once
  more after the next pause.
- After each new set of pages, the script of the pages sends the event
  `nimblescape-paper-rendered` to `window`, with the number of the pages, so
  that another script can mark the pages again.
- The text on the pages has soft hyphens (U+00AD) where the layout
  hyphenates words ([R-REN-007](#r-ren-007)); a script that compares a
  selected passage with the Markdown text leaves them out. The text of a page
  is in `.pagedjs_page_content`; a highlight is drawn only inside it.
- Markdown Notes adapts its preview script to the pages where it needs to
  ([R-GEN-003](#r-gen-003)).

## New files

### R-NEW-001

**New document.** "New Document" (in the Command Palette and in the context
menu of a folder in the Explorer) and `markdownpaper new document <file>
--layout <name>` write a Markdown file with the front matter of the layout:
the comment line of [R-DOC-001](#r-doc-001), the field `layout`, and each field
with its description as a YAML comment, and the text of the empty paper
document of the layout ([R-LAY-009](#r-lay-009)), with the files that it links
to beside the new document. The values come from options or questions, else
from the empty paper document.

### R-NEW-002

**New layout.** "New Layout" (in the Command Palette and in the context menu
of a folder in the Explorer) and `markdownpaper new layout <folder>` copy a
layout, the built-in layout `plain` by default, into a new folder, with the
name and the language of the new layout in `layout.json`.

### R-NEW-003

**New project.** "New Project", `markdownpaper new project <folder>` and
`npx -y @nimblescape/markdownpaper create` write the folders of a new paper,
as a scaffold of Vite does ([decision 4](#decisions)):

| Folder or file | Content |
| --- | --- |
| `AGENTS.md` | The instructions for AI agents: the folders, the commands of the rules, of the checks and of the PDF, and the work of `inbox/`. |
| `layouts/<name>/` | The copy of the layout, without its preview PDF. |
| `paper/paper.md` | The document from the empty paper document of the layout ([R-NEW-001](#r-new-001), [R-LAY-009](#r-lay-009)). |
| `images/`, `code/`, … | The files that the empty paper document links to, at the same paths as in the layout folder. |
| `inbox/` | The drop folder for sources that no program can load on its own. |
| `bib/` | The files of the sources, each named after its citation. |
| `images/` | The figures. |

- `inbox/` and `bib/` ([decision 14](#decisions)): a person puts a source into
  `inbox/`, for example a PDF file. An AI agent reads it, finds its authors,
  year and title, and moves it to `bib/` with the ID of its citation as its
  name, for example `bib/hong2024.pdf`. With the citations
  ([R-CITE-001](#r-cite-001)), the agent also adds the metadata of the source
  to the database of the document.
- `create` asks for the name of the folder, the layout (from the list of
  [R-NEW-004](#r-new-004)), the language, the title and the author when its
  options do not give them and a person runs it in a terminal; `--yes` asks
  nothing and takes the layout `plain` when `--layout` names none, for AI
  agents.
- No command writes a file over an existing file; then it writes nothing and
  names the files.
- A project can hold more than one document in `paper/`, for example
  `paper/paper.md` for the thesis and `paper/concept.md` for its concept
  paper, which share `bib/`. A project can have more folders than
  the scaffold writes, for example `instructions/` for the documents of the
  school, `research/` for working notes and `archive/`.

### R-NEW-004

**The list of the layouts.** A new project chooses its layout from a list of
all layouts that Markdown Paper can find ([decision 41](#decisions)):

- The list holds the folders of `layouts/` of the current folder (in VS Code,
  of the workspace), the built-in layouts, and the layouts on GitHub: each
  layout folder ([R-LAY-007](#r-lay-007)) of the repositories with the topic
  of [decision 29](#decisions), in the order of the stars of the repositories.
  Archived repositories stay out.
- `markdownpaper create` without `--layout` shows the list in a terminal, as
  `npm create vite` does: the arrow keys move, Enter chooses, Esc or Ctrl+C
  stops without writing a file. The chosen entry shows the address of its
  preview PDF ([R-LAY-009](#r-lay-009)) below the list.
- "New Project" in VS Code shows the same list in a Quick Pick: first the
  layouts of the workspace and the built-in layouts, then the layouts on
  GitHub when GitHub answers. The button of a layout on GitHub opens its
  preview PDF.
- `--layout github:<owner>/<repository>/<folder>` names a layout on GitHub
  without the list, with `@<branch, tag or commit>` if needed
  ([R-LAY-007](#r-lay-007)).
- The scaffold reads the files of a layout on GitHub at one commit and copies
  them into `layouts/<folder>/` of the new project, without the preview PDF.
- `markdownpaper layouts` prints the list, with the name of each layout for
  `--layout`.
- GitHub limits the number of requests without a sign-in. The command uses
  the token of `GITHUB_TOKEN` or `GH_TOKEN`; VS Code uses the GitHub sign-in
  of VS Code when one exists, without asking, so that the private
  repositories of the author count too. When the search fails, the list has
  no layouts of GitHub and says why.

## Command line

### R-CLI-001

**The command `markdownpaper`.** The npm package `@nimblescape/markdownpaper`
gives the command `markdownpaper` for people and AI agents, with Node.js 22 or
later, also through `npx` without an installation ([decision 4](#decisions)).
Until the release the package is not on npmjs.com, so `npx -y
@nimblescape/markdownpaper` works only after the release; before it, the
command comes from the GitHub repository ([decision 36](#decisions)). npm
cannot install the folder `cli/` of a repository, so the way to install the
command from GitHub is planned.

- `pdf`, `check`, `format` ([R-CLI-002](#r-cli-002)), `source`
  ([R-CITE-005](#r-cite-005)), `create`, `new document|layout|project`,
  `layouts` ([R-NEW-004](#r-new-004)), `preview` ([R-LAY-009](#r-lay-009)),
  `instructions`.
- `--help` prints the use, `--version` the version and the version of the
  layout format.
- The exit code is 0 for success, 1 for problems of a document, for a file
  that `format --check` would change, or for an input of `source` that gave
  no source, and 2 for a wrong call or a failure.
- The command uses the same renderer, checks and scaffold as the extension.

### R-CLI-002

**One formatter command.** A paper has one formatter command, although the
notes and the paper are two packages. The plan:

- `markdownpaper format <file>` is the one formatter of a paper. It calls the
  formatter of Markdown Notes as a library, `formatMarkdown(lines)` of
  `@nimblescape/markdownnotes` ([R-GEN-003](#r-gen-003)), and then the steps of
  the paper: the citations and the reference list ([R-CITE-004](#r-cite-004)),
  the lists of the special sections ([R-REN-004](#r-ren-004)), and the
  numbers of the headings in the links ([R-REN-009](#r-ren-009)).
- `markdownnotes format` stays the formatter of files without a paper.
- In VS Code, the extension registers the steps of the paper as a format step
  of Markdown Notes, so "Format Document" and format on save run all steps in
  one change. The step needs the layout of the file and its citation style,
  which the extension reads when the file opens and when its front matter or
  a file of a layout changes; a format before that leaves out the step of the
  paper once. The steps of the paper run in one order: first the citations
  and the reference list, then the lists, so that a new reference list is in
  the table of contents after one format.
- Today `markdownpaper format` runs the steps of the paper; the steps of
  Markdown Notes join it with the library of Markdown Notes. Until the
  release, the build checks out the GitHub repository
  `nimblescape/markdownnotes-vscode` at a fixed commit, builds it and installs
  its folder `cli/` as a file dependency, because npm cannot install a folder
  of a Git repository ([decision 36](#decisions)). Then it runs the
  steps of Markdown Notes and the steps of the paper again while the text
  changes, at most three rounds, as Markdown Notes does in VS Code, so that
  `--check` passes after one format. The steps of the paper keep a text that
  they formatted already as it is. `--check` writes
  nothing and exits with 1 when the format would change a file, for a check
  in CI ([R-GEN-008](#r-gen-008)).
- The step of the lists writes the four lists of
  [R-REN-004](#r-ren-004) from what the renderer reads in the file: the
  numbers of the headings by the rules of the layout, and the labels and
  anchors of the captions. A section without the markers gets them after its
  heading; the rest of the section stays.

### R-CLI-003

**Instructions for AI agents.** `markdownpaper instructions [topic]` prints
the rules of a topic as Markdown; without a topic, the list of the topics.
The topics are `document` (writing a document, also its sources and
citations), `layout` (the layout folder, also from a Word template) and
`render` (making the PDF and checking its pages). The
documents in `docs/` are the source of the instructions, and the files and
`layout.json` name the command, so an agent finds it.

## Citations

The citations and the sources go into Markdown Paper
([decision 11](#decisions)). Their form was decided in the work on Markdown
Notes and is kept. The parts that Markdown Notes shows or formats use its
interface ([R-GEN-003](#r-gen-003)).

### R-CITE-001

**The database of the sources.** A document holds the metadata of its sources,
cited or not, in one HTML comment at the end of the file, its database:

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
- An AI agent searches and collects the sources and adds each one there, also
  with the browser of the author in the databases that the author can read,
  such as databases with a paywall; it puts the files of the sources into
  `inbox/`. It takes the metadata of a source with a DOI from doi.org as CSL
  JSON, else from the source itself, for example a PDF in `inbox/`, or from
  the record of the source in the database where it found it
  ([decision 33](#decisions)), with the command `markdownpaper source`
  ([R-CITE-005](#r-cite-005)).
  An agent must not write metadata from memory: each field comes from doi.org
  or from the source, and a field that it cannot take from there stays out.
  The ID of the downloaded metadata is replaced by the ID of the next item.
  A web page that can change gets the day of the access (`accessed`).
- The ID of a source is in small letters, without spaces and accents, with
  "ae", "oe" and "ue" for the German umlauts and "ss" for "ß"; the letters of
  other scripts, such as Japanese, stay ([decision 22](#decisions)):
  - a source by persons: the family name of the first author and the year,
    for example `hong2024`; a second work of the same author and year gets
    `a`, `b` (`hong2024a`);
  - an organization: its full name as cited and the year, for example
    `worldeconomicforum2025`;
  - a law or a regulation: its Fundstelle (the place of its publication) with
    hyphens, for example `bgbl-ii-262-2015`, `eu-2024-1689`;
  - a source without a date: no year, for example
    `wirtschaftskammeroesterreich`;
  - a second file of one source: the ID, a hyphen and an addition, for
    example `bib/bgbl-242-1962-fassung-2027-08-01.pdf`.
- The checks report a line that is no JSON object, a source without a valid
  `id`, a second source with the same `id`, and a comment without its end.
- The clean editing view of Markdown Notes leaves the database out (a hidden
  block of [R-GEN-003](#r-gen-003)).

### R-CITE-002

**Citations.** A citation is a Markdown link to the entry of its source in the
reference list, and the title of the link holds the data of the citation,
because the text of a citation depends on the style and can change:

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
  the style; it reads nothing from the old text. A link in code, in an HTML
  comment or in a fenced code block is no citation.
- The checks warn of a title with words that are no CSL term or value, such
  as `"S. 3"`, and the formatter keeps the text of such a link.
- `(RESEARCH)` asks an AI agent to research the evidence for an argument
  ([decision 43](#decisions)). The author selects the argument in the text
  editor and types `/research`, which works only with selected text. The
  selection gets the hidden start marker `<wbr><!--[research-->` before it,
  and `(RESEARCH)` at its end, before a period at the end of the selection,
  where the citation goes:

  ```markdown
  <wbr><!--[research-->Feedback changes learning more than praise does (RESEARCH).
  ```

  The argument is the text from the start marker to `(RESEARCH)`; a
  `(RESEARCH)` without a start marker asks for the sentence before it. The
  agent finds sources that support the argument, adds them to the database
  with `markdownpaper source` ([R-CITE-005](#r-cite-005)), removes the start
  marker, and replaces `(RESEARCH)` with the citations. When no source
  supports the argument, the agent keeps both marks and says so. The checks
  warn of each `(RESEARCH)` and of a start marker without a `(RESEARCH)` after
  it in its paragraph. The pages and the PDF show `(RESEARCH)` and leave the
  start marker out.
- The slash commands of the sources ([decision 15](#decisions),
  [decision 42](#decisions)): `/cite` inserts a citation of a source of the
  database, and with Zotero also of an item of Zotero
  ([R-CITE-006](#r-cite-006)). There is no slash command that only adds a
  source: the database gets its sources from Zotero through `/cite`, or from
  an AI agent through `markdownpaper source` ([R-CITE-005](#r-cite-005)).
  Markdown Paper registers `/cite` and `/research` as slash commands of
  Markdown Notes ([R-GEN-003](#r-gen-003)).

### R-CITE-003

**The citation style.** The layout names the citation style with
`citationStyle`, and only the layout: a document does not repeat the style,
not in its front matter and not in the DOCTYPE comment of Markdown Notes.

- A style is a file of the Citation Style Language (CSL), the format of
  Zotero and of more than 10,000 styles of
  <https://github.com/citation-style-language/styles>. citeproc-js applies it
  to the metadata of the sources and writes the text of the citations and of
  the entries as Markdown ([decision 30](#decisions)).
- `citationStyle` names a built-in style or a `.csl` file of the layout
  folder, for example `"citationStyle": "pht-apa7.csl"`. The built-in style
  `apa7` is "APA Style 7th edition" of the CSL styles (`csl/apa.csl`). A
  layout without the field gets `apa7`; a style that does not exist or is no
  CSL style gets `apa7` and a warning ([decision 31](#decisions)).
- The language of the layout chooses the CSL locale, the words of the style
  such as `S.`, `Hrsg.` and the names of the months: the bundle has `de-AT`
  (with "Jänner"), `de-DE`, `en-US` and `en-GB`. Another tag takes the locale
  of its first part (`de-CH` takes `de-DE`), else `en-US`.
- The style of the PHT is `pht-apa7.csl` in the PHT layouts of the repository
  `majikmate/markdownpaper-layout-pht`: a copy of `apa.csl` with
  the rules of the guide of the PHT, "Zitationsrichtlinien für
  Abschlussarbeiten an der PHT, Zitation nach APA 7", version 2.0: `o. D.`,
  the places with their short German labels such as `S. 13 – 14`, `Kap. 2`,
  `Abb. 1`, the day before the month (`2018, 1. Oktober`) and
  `Abgerufen am … von …` whenever a source has the day of the access
  ([decision 32](#decisions)). A no-break space stands in `o. D.`, after a
  short label such as `S.`, and on both sides of the dash between two pages,
  so that a line does not break there.
- The text that the style writes is Markdown: italic parts between `*`, and
  the characters of Markdown in the metadata, such as `*`, `_` and `[`, with a
  backslash. A DOI and an address stay plain text, which GitHub and the pages
  show as links.
- In a citation in the sentence, the last two names are joined by the word
  "and" of the language, as APA writes it: `Festman und Schwieter (2019)`,
  but `(Festman & Schwieter, 2019)` in parentheses. Italic parts that only a
  comma separates become one italic part: `*Behavioral Science, 9*`.

### R-CITE-004

**The reference list.** The formatter writes the entries of the cited sources
under the heading of the reference list, the section `BIB` of
[R-REN-004](#r-ren-004); an AI agent does not write the entries:

- Each entry is one paragraph that starts with the anchor of its source:
  `<a id="hong2024"></a>Hong, S., … (2024). *MetaGPT* …`, in the order of the
  style, one for each cited source. An entry of a source that the text no
  longer cites goes.
- A document with citations and without the section gets the section before
  the appendix part, else before the database, as a chapter (`#`) with the
  first heading of `BIB` in the language of the layout, for example
  `# Literaturverzeichnis` ([R-REN-004](#r-ren-004)).
- The formatter changes only text whose edges the markup marks: the text of a
  link to a source and a paragraph that starts with the anchor of a source.
  Other paragraphs of the reference list stay, after the entries, for example
  a note on the day of the access of all links. In a reference list with a sub-heading or with
  a note of Markdown Notes, the formatter writes each entry without a note
  anew in its place and adds, moves or removes none.
- The checks warn of a paragraph of the reference list that is no entry of a
  source of the database, and of a cited source without an entry before the
  format writes it.

### R-CITE-005

**The metadata of new sources.** `markdownpaper source <file.md> <input>...`
adds sources to the database of a document, with the metadata from the place
that publishes it, in the ways that Zotero fills the metadata of a source, so
that no AI agent writes metadata from memory ([decision 35](#decisions)). An
input is an identifier or a file:

| Input | Example | Where the metadata comes from |
| --- | --- | --- |
| DOI | `10.3390/bs9040039` | doi.org as CSL JSON; doi.org asks the registry of the DOI: Crossref, DataCite, mEDRA or JaLC |
| ISBN | `978-3-8252-4753-9` | the catalog of the German National Library (DNB), else the union catalog K10plus, else Open Library |
| PubMed ID | `37189997`, `pmid:37189997` | PubMed of the NCBI; a record with a DOI: doi.org, with the PubMed ID added |
| arXiv ID | `2308.00352`, `arXiv:2308.00352` | doi.org with the DOI that arXiv gives each paper, `10.48550/arXiv.2308.00352`; the command names the DOI of a published version that arXiv knows |
| Web address | `https://…` | the page: its tags `citation_*` of Google Scholar, else Dublin Core, else JSON-LD of schema.org, else its title, author and date as a web page with the day of the access; a page whose tags have a DOI: doi.org |
| RIS, BibTeX or CSL JSON file | `inbox/export.ris`, `.bib`, `.json` | the file, the export of a database or of a reference manager, with all its sources; a source with a DOI: doi.org |
| HTML file | `inbox/page.html` | a page that the agent saved, read as a web address |
| PDF file | `inbox/paper.pdf` | the DOI in the metadata of the PDF, then doi.org |

- An address of doi.org, of arxiv.org or of PubMed counts as its identifier.
- A PDF without a DOI in its metadata adds nothing: the command lists the
  DOIs and arXiv IDs that the file holds elsewhere, because they can be the
  references of the paper, and the agent gives the one of the title page.
- The command keeps only the fields of CSL JSON that describe a source,
  turns the types of Crossref and of MARC records into CSL types, joins a
  title and its subtitle with ": ", leaves out a first edition, the address
  of a source with a DOI and the day of a lookup.
- Each new source gets its ID by [decision 22](#decisions); `--id <id>` gives
  the ID of the one new source of a call, for example of a law. A source
  whose DOI, ISBN, or title and year the database has already is not added
  again. The command makes the database at the end of the file when the file
  has none ([R-CITE-001](#r-cite-001)).
- For each input, the command prints the ID, where the metadata came from,
  and the fields that a source of its type needs and did not get, for
  example `publisher` of a book; the agent takes such a field from the source
  itself, or leaves it out.
- `--offline` asks no service and keeps the metadata of the files.
  `--dry-run` prints the new lines and writes nothing. `--search <words>`
  lists up to ten works of Crossref whose title matches, with their DOIs,
  and adds nothing; the agent then adds the right one by its DOI.
- The exit code is 0 when each input gave a source, 1 when an input gave
  none, and 2 for a wrong call.
- The command connects to these hosts, which the cloud environment of an AI
  agent must allow: `doi.org`, `api.crossref.org`, `data.crosscite.org`,
  `data.medra.org`, `japanlinkcenter.org`, `services.dnb.de`,
  `sru.k10plus.de`, `openlibrary.org`, `api.ncbi.nlm.nih.gov`,
  `export.arxiv.org`, and the host of a web address that the call names. Each
  request names the command and its repository in the header `User-Agent`,
  and goes through the proxy of the environment variables `HTTPS_PROXY` and
  `NO_PROXY` when they name one.
- A source that a service gives without an author or another field that its
  type needs keeps the gap: the command does not guess a field, for example
  from a person whom a library record names without the role of an author.
- The command stays the way of AI agents to add sources; the author adds
  sources from Zotero with `/cite` ([R-CITE-006](#r-cite-006)).

### R-CITE-006

**Sources from Zotero in `/cite`.** In VS Code, `/cite` reads the library of
the Zotero of the author, so that the author cites the sources of Zotero and
writes no metadata ([decision 42](#decisions)). This is planned; the design
waits for the answers to the questions of the discussion document.

- `/cite` shows one list of the sources of the database of the document and,
  when Zotero is set up and running, of the items of Zotero; a source that
  both have shows once. A search box filters the list by author, title and
  year.
- A chosen item of Zotero is merged into the database as well as the data
  allows: a field that the line of the database does not have is added; a
  field with another value in Zotero is updated from Zotero only after the
  author confirms the change; nothing is removed from the line; the ID of the
  line never changes, so no citation breaks. An item that the database does
  not have becomes a new line with an ID by [decision 22](#decisions).
- The extension reads Zotero through the local API of Zotero 7 on the same
  computer (`http://localhost:23119/api/`), which the author allows in the
  settings of Zotero. It sends nothing to the internet for Zotero.
- AI agents and the command `markdownpaper` do not use Zotero; agents add
  sources with `markdownpaper source` ([R-CITE-005](#r-cite-005)).

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

The requirements above follow these decisions, and each decision is a
requirement ([R-GEN-007](#r-gen-007)).

1. **Two packages** ([R-GEN-001](#r-gen-001)): Markdown Paper for the paper
   workflow and Markdown Notes for the notes, with a clean split.
2. **HTML and CSS with Paged.js** ([R-REN-001](#r-ren-001)): the renderer
   makes HTML, Paged.js makes the pages, a browser prints the PDF.
3. **The layout is a folder in the repository of the document**
   ([R-LAY-001](#r-lay-001)), and the renderer also makes the preview.
4. **Instructions and scaffold as npm commands** ([R-CLI-001](#r-cli-001),
   [R-CLI-003](#r-cli-003), [R-NEW-003](#r-new-003)).
5. **Names** ([R-GEN-005](#r-gen-005)): the extension IDs and repositories of
   Markdown Paper and Markdown Notes. The npm package
   `@nimblescape/markdownpaper` with the command `markdownpaper` follows the
   IDs (see the [open questions](#open-questions)).
6. **The installed browser prints the PDF** ([R-PDF-002](#r-pdf-002)): an
   installed Chrome, Chromium or Edge first, and a download of Chromium only
   when none is found. The package holds no Chromium.
7. **Lists of the special sections** ([R-REN-004](#r-ren-004)): table of
   contents, list of figures, list of tables, and list of listings
   ([decision 28](#decisions)); English terms in code and documentation
   ([R-GEN-006](#r-gen-006)).
8. **Captions** ([R-REN-005](#r-ren-005)): a table gets its caption from a
   paragraph `Table 1: …` directly before it, which GitHub shows as well; a
   figure the same way ([decision 27](#decisions)).
9. **Appendix** ([R-REN-006](#r-ren-006)): the appendix part `# Anhang` with
   one `##` heading for each appendix.
10. **Special sections without chapter numbers** ([R-REN-004](#r-ren-004)):
    `TOC`, `LOF`, `LOT`, `BIB`, `ADT`, `AST`, `ACC`, `FWD`, `APX-A`, `APX-B`,
    …; the table of contents does not list itself.
11. **Citations and sources in Markdown Paper** ([R-CITE-001](#r-cite-001) to
    [R-CITE-004](#r-cite-004)), not in Markdown Notes.
12. **One specification in the repository** ([R-GEN-007](#r-gen-007)): this
    document, in which each decision is a requirement.
13. **Links to figures and tables** ([R-REN-009](#r-ren-009)): anchors at the
    end of the line of the image or of the caption, and links to them.
14. **`inbox/` and `bib/`** ([R-NEW-003](#r-new-003)): the drop folder and the
    folder of the sources of a project.
15. **Slash commands: entries by noun, references by `/ref` and `/cite`**
    ([R-REN-009](#r-ren-009), [R-CITE-002](#r-cite-002)): `/figure` and
    `/table` add an entry; `/ref` and `/cite` add a reference to an entry.
    `/figure`, `/table` and `/ref` belong to Markdown Notes, `/cite` and
    `/research` to Markdown Paper; `/source` was dropped by
    [decision 42](#decisions).
16. **Plain Markdown links to headings** ([R-REN-003](#r-ren-003),
    [R-REN-009](#r-ren-009)): the formats stay as close to Markdown as
    possible. A heading has the ID of GitHub, and a link to it is a Markdown
    link such as `[Kapitel 2.1](#methoden)`, without an added HTML anchor.
    The anchors `sec-…` still work.
17. **The page preview is the Markdown preview of a paper**
    ([R-DOC-004](#r-doc-004), [R-PRV-005](#r-prv-005),
    [R-REN-010](#r-ren-010)): a file with features of the paper is a paper
    document, and its Markdown preview shows its pages, with all Markdown
    plugins of VS Code; a file with only features of Markdown Notes is a
    notes document with the Markdown preview of VS Code.
18. **Layouts from other places** ([R-LAY-007](#r-lay-007)): a layout can also
    come from another repository or from an npm package; `layouts/` of the
    repository counts first.
19. **No logic in a layout** ([R-LAY-008](#r-lay-008)): style sheets,
    templates and fields only, no scripts.
20. **The pages are in the Markdown preview of VS Code**
    ([R-PRV-005](#r-prv-005), [R-PRV-006](#r-prv-006)): every function of a
    Markdown plugin, such as "Add Note" of Markdown Notes, works on the pages
    as in the Markdown preview, because the pages are made there.
21. **Only PDF** ([R-PDF-004](#r-pdf-004)): no Word file.
22. **The IDs of the sources** ([R-CITE-001](#r-cite-001)): small letters,
    with "ae", "oe" and "ue" for the German umlauts; a person is the
    family name of the first author and the year, an organization its full
    name as cited and the year, a law or a regulation its Fundstelle with
    hyphens, a source without a date has no year, and a second file of one
    source is the ID, a hyphen and an addition.
23. **Clean requirements** ([R-GEN-007](#r-gen-007)): the requirements and
    every other file of the repository hold only the clean summary of the
    decisions, without the texts of the discussion; the details stay in
    discussion documents.
24. **Numbers of the lines of a listing** ([R-REN-011](#r-ren-011)): an option
    of the layout, `listings.lineNumbers`, off by default; the numbers start
    at 1 in each listing.
25. **The caption of a listing is a link to its source, with the cite in the
    file** ([R-REN-011](#r-ren-011), [R-GEN-008](#r-gen-008)): Markdown Notes
    writes the caption as a link to the file and the lines of the source,
    and after it the cite of the file and the lines, and keeps both current.
    The pages show the text of the caption without the link, and the cite.
26. **Document driven** ([R-GEN-008](#r-gen-008)): the file holds what the
    reader reads as text, and the formatter keeps it current: the numbers of
    the captions and of the links, the lists of the special sections, the
    code of the listings and the reference list. The headings keep no
    numbers in the file. The renderer adds only the look.
27. **The caption of a figure is a paragraph before the image**
    ([R-REN-005](#r-ren-005)): `Figure 1: …`, as for a table, shown above
    the image as APA 7 does; an image without it has no caption and no
    number.
28. **The lists of the special sections are in the file**
    ([R-REN-004](#r-ren-004)): the formatter writes the table of contents,
    the list of figures, the list of tables and the list of listings as lists
    of links between hidden markers, such as `<!-- toc -->` and
    `<!-- /toc -->`, under a heading that the author writes; the renderer
    adds the page numbers.
29. **The mark of a layout repository** ([R-LAY-007](#r-lay-007)): the GitHub
    topic `nimblescape-markdownpaper-layout`, whose name names Markdown Paper.
30. **Citation styles in CSL with citeproc-js** ([R-CITE-003](#r-cite-003),
    [R-GEN-004](#r-gen-004)): a layout can bring its own style as a CSL file;
    citeproc-js (npm `citeproc`, CPAL 1.0 or AGPL) applies it, under the CPAL
    1.0, without changes to its files, with its notice and the place of its
    source in `THIRD-PARTY-NOTICES.md`. Its package names no attribution of
    "Exhibit B", so the extension shows none.
31. **The built-in style `apa7`** ([R-CITE-003](#r-cite-003)): "APA Style 7th
    edition" of the CSL styles and the CSL locales in the bundle, CC BY-SA
    3.0; the default of a layout without `citationStyle`.
32. **The style of the PHT** ([R-CITE-003](#r-cite-003)): `pht-apa7.csl`, a
    copy of `apa.csl` with the rules of the guide of the PHT, in the PHT
    layouts of `majikmate/markdownpaper-layout-pht`, which is
    under CC BY-SA 4.0.
33. **AI agents collect the sources without a reference manager**
    ([R-CITE-001](#r-cite-001)): an AI agent searches and collects the
    sources with `markdownpaper source`; agents and the command
    `markdownpaper` use no Zotero and no other reference manager. For the
    author, [decision 42](#decisions) adds Zotero to `/cite`.
34. **Everything in the requirements** ([R-GEN-007](#r-gen-007)): every
    function that is built and every decision is in this document, as a clean
    summary, in the same commit as the change of the code.
35. **The metadata of new sources** ([R-CITE-005](#r-cite-005)): the command
    `markdownpaper source` fills the metadata in the ways that Zotero does:
    identifiers through the services that publish their metadata, the
    metadata in web pages, the exports of databases, and the DOI in a PDF.
36. **Nothing published before the release** ([R-GEN-005](#r-gen-005)): no
    npm package, no extension on the Marketplace and no release tag before
    the release; tests and other repositories install a package or a layout
    from its GitHub repository.
37. **Parameters of a layout** ([R-LAY-002](#r-lay-002)): `layout.json` can
    give any field a list of names to choose from, so one layout holds
    several variants, for example the look of a Word template and an older
    look. The front matter names the variant; how it looks stays inside the
    layout. A JSON schema of `layout.json` describes the format.
38. **A layout as close to its Word template as the browser allows**
    ([R-REN-004](#r-ren-004), [R-REN-007](#r-ren-007), [R-REN-012](#r-ren-012),
    [R-LAY-002](#r-lay-002)):
    a layout made from a Word template keeps its measures, fonts with the
    same metrics, and the spacing of Word, measured on a PDF of Word. Two
    options of `layout.json` serve such templates: `headings.numberedSections`
    numbers a special section, such as a numbered reference list, and
    `references.hyphenate` hyphenates the reference list. A negative
    `word-spacing` shrinks the spaces of justified lines as Word does, and the
    last line of a paragraph keeps its natural spaces
    ([R-REN-012](#r-ren-012)). The browser and Word choose some line breaks
    differently, and the hyphenation patterns of TeX differ from those of
    Word, so a few lines can still break at other places than in Word.
39. **The parts of a document** ([R-REN-013](#r-ren-013)): the renderer puts
    the front part, the body and the appendix part each into an element, so
    that a layout can give each part its own page style, as Word templates do
    with their sections: the PHT thesis template has no page number before the
    first chapter, starts the body with page 1 and numbers the appendix I, II,
    …. A special section of the front part is never numbered, and
    `contents.front: false` leaves the front part out of the table of contents,
    as the PHT template does.
40. **An empty paper document and its preview in each layout**
    ([R-LAY-009](#r-lay-009)): each layout holds an empty paper document with
    the cover texts of its template and chapters that explain how to work with
    the document and its functions, with example texts, and the PDF of this
    document as the preview of the layout. A new document starts from it.
41. **The layouts on GitHub in the list of a new project**
    ([R-NEW-004](#r-new-004), [R-LAY-007](#r-lay-007)): `create` without
    `--layout` and "New Project" list the layouts of all repositories with the
    topic of [decision 29](#decisions) for a choice, as `npm create vite` lists
    its templates. A repository holds one folder for each layout, and a new
    project gets a copy of the chosen layout in `layouts/<folder>/`.
42. **Zotero only through `/cite`, for the author** ([R-CITE-002](#r-cite-002),
    [R-CITE-006](#r-cite-006)): the author cites with `/cite`, which searches
    the database of the document and, when Zotero is set up and running, the
    items of Zotero, as one list. There is no slash command `/source`. A
    chosen item of Zotero is merged into the database: a missing field is
    added, a field with another value is updated from Zotero only after the
    author confirms, and nothing is removed. The database gets its sources
    from Zotero through `/cite` or from an AI agent through `markdownpaper
    source`, which stays. AI agents and the command `markdownpaper` do not use
    Zotero. The discussion document is
    [Zotero integration of Markdown Paper](https://claude.ai/artifact/2Q4BZy6wJzcqRn9SjTDFa3).
43. **`/research` on a selected argument** ([R-CITE-002](#r-cite-002),
    [R-GEN-003](#r-gen-003)): `/research` works only with selected text. The
    selection is the argument for which an AI agent researches the evidence;
    a hidden start marker before it and `(RESEARCH)` at its end mark the
    argument in the file.

## Open questions

- The mark of a paper document ([R-DOC-004](#r-doc-004)): the field `layout`
  of the front matter, and later the citations; not confirmed yet.
- The name of a layout on GitHub in the front matter, without a copy in
  `layouts/` ([R-LAY-007](#r-lay-007)). The proposal: a document names a
  layout with a release tag, so its pages stay the same:
  `layout: github:majikmate/markdownpaper-layout-pht/thesis-v2@v1.0.0`. Until
  the release there is no release tag, so a document names a branch or a
  commit ([decision 36](#decisions)). The form for an npm package is open
  too.
- Zotero in `/cite` ([R-CITE-006](#r-cite-006)): how an item finds its line
  in the database, the Zotero key in the line, the copy of the PDF of an item
  into `bib/`, VS Code on another computer, and a command that updates all
  sources at once; the questions are in the discussion document of
  [decision 42](#decisions).
- Mermaid and PlantUML on the command line ([R-REN-010](#r-ren-010)):
  `markdownpaper` has no extensions of VS Code, so its PDF shows a diagram as
  its source text. It can bring Mermaid itself; PlantUML needs Java or a
  PlantUML server. In VS Code, "Export PDF" shows the diagrams.
- The npm name `@nimblescape/markdownpaper` ([decision 5](#decisions)).
- One formatter command ([R-CLI-002](#r-cli-002)): the plan waits for the
  library of `@nimblescape/markdownnotes`.
- Values of the front matter in the text (planned in Markdown Notes): `/ref`
  inserts a field between hidden markers, `<!--{title}-->value<!--{/title}-->`,
  and the formatter writes the value anew from the front matter. The pages
  show the value.
