<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# User guide

This guide describes the features of nimblescape Markdown Paper and how to use
them. The extension makes the pages and the PDF of a document that is written
in Markdown, in a layout that the repository of the document defines. The
Markdown preview of VS Code shows the pages of a paper as the PDF prints them.

The table shows each feature, where it works and its state, and
[requirements.md](requirements.md) defines each feature exactly; the ID in the
last column links to its definition. The key combinations are those of
Windows and Linux; on macOS, use Cmd instead of Ctrl.

| Feature | Where | State | Requirements |
| --- | --- | --- | --- |
| [Start a project](#start-a-project) | Command Palette, command line | available | [R-NEW-001](requirements.md#r-new-001) to [R-NEW-003](requirements.md#r-new-003) |
| [Sources in inbox and bib](#sources-in-inbox-and-bib) | the folders of a project | available | [R-NEW-003](requirements.md#r-new-003), [R-CITE-001](requirements.md#r-cite-001) |
| [Front matter](#front-matter) | the Markdown file | available | [R-DOC-001](requirements.md#r-doc-001) |
| [Checks and hover](#checks-and-hover) | text editor, command line | available | [R-DOC-002](requirements.md#r-doc-002), [R-DOC-003](requirements.md#r-doc-003) |
| [Headings](#headings) | pages | available | [R-REN-003](requirements.md#r-ren-003) |
| [Special sections](#special-sections) | pages | available | [R-REN-004](requirements.md#r-ren-004) |
| [Figures and tables](#figures-and-tables), links to headings | pages | available | [R-REN-005](requirements.md#r-ren-005), [R-REN-009](requirements.md#r-ren-009) |
| [Listings](#listings) | pages | available | [R-REN-011](requirements.md#r-ren-011) |
| [Appendix](#appendix) | pages | available | [R-REN-006](requirements.md#r-ren-006) |
| [Footnotes](#footnotes) | pages | available | [R-REN-008](requirements.md#r-ren-008) |
| [Hyphenation](#hyphenation) | pages | available | [R-REN-007](requirements.md#r-ren-007) |
| [Notes of Markdown Notes](#notes-of-markdown-notes) | pages | available | [R-REN-002](requirements.md#r-ren-002), [R-GEN-003](requirements.md#r-gen-003) |
| [Paper documents and notes documents](#paper-documents-and-notes-documents) | the Markdown file | available | [R-DOC-004](requirements.md#r-doc-004) |
| [Page preview](#page-preview), the pages in the Markdown preview of VS Code | Markdown preview, Ctrl+Shift+V, Ctrl+K V | available | [R-PRV-001](requirements.md#r-prv-001) to [R-PRV-006](requirements.md#r-prv-006) |
| [Export PDF](#export-pdf) | title of the editor, Explorer, command line | available | [R-PDF-001](requirements.md#r-pdf-001) to [R-PDF-003](requirements.md#r-pdf-003) |
| [Layouts](#layouts) | `layouts/<name>/` | available | [R-LAY-001](requirements.md#r-lay-001) to [R-LAY-005](requirements.md#r-lay-005) |
| [A layout from a Word template](#a-layout-from-a-word-template) | AI agent | instructions available | [R-LAY-006](requirements.md#r-lay-006) |
| [Instructions for AI agents](#instructions-for-ai-agents) | command line | available | [R-CLI-003](requirements.md#r-cli-003) |
| [Settings](#settings) | VS Code | available | [R-SET-001](requirements.md#r-set-001) |
| The format step of the paper: the four lists in the file | VS Code (format of Markdown Notes), `markdownpaper format` | available; the steps of Markdown Notes on the command line planned | [R-CLI-002](requirements.md#r-cli-002), [R-REN-004](requirements.md#r-ren-004) |
| [Citations](#citations), the database of the sources, the reference list, the citation style of the layout | the Markdown file, VS Code (format, `/cite` and `/research` of Markdown Notes, Zotero), `markdownpaper format`, `markdownpaper source` | available; the group libraries of Zotero in `/cite` planned | [R-CITE-001](requirements.md#r-cite-001) to [R-CITE-006](requirements.md#r-cite-006) |
| [Mermaid, PlantUML and the other Markdown plugins](#page-preview) of VS Code on the pages | Markdown preview | available | [R-REN-010](requirements.md#r-ren-010), [R-PRV-006](requirements.md#r-prv-006) |
| [Mermaid, PlantUML and the other Markdown plugins of VS Code in the PDF](#export-pdf) | "Export PDF" in VS Code | available; on the command line planned | [R-REN-010](requirements.md#r-ren-010) |

## Start a project

"Markdown Paper: New Project" in the Command Palette (Ctrl+Shift+P) asks for a
folder, the name of the project folder, a layout, a language, the title and
the author, and writes the folders of a paper. On the
command line, `npx -y @nimblescape/markdownpaper create` asks the same
questions; `--yes` asks nothing, for AI agents.

The list of the layouts holds the layouts of the workspace, the built-in
layouts and, when GitHub answers, the layouts on GitHub: each layout folder of
a repository with the topic
[`nimblescape-markdownpaper-layout`](https://github.com/topics/nimblescape-markdownpaper-layout).
In VS Code, the button of a layout on GitHub opens its preview PDF, the pages
of its empty paper document. In a terminal, the arrow keys choose and the
line below the list shows the address of the preview PDF;
`markdownpaper layouts` prints the list. `--layout` chooses without the
list, also a layout on GitHub:

```sh
npx -y @nimblescape/markdownpaper create my-thesis --layout github:majikmate/markdownpaper-layout-pht/thesis
```

With a sign-in to GitHub in VS Code, or with a token in `GITHUB_TOKEN` on the
command line, the list also holds the private repositories that you can read,
and GitHub allows more requests.

| Folder or file | Content |
| --- | --- |
| `AGENTS.md` | The instructions for AI agents: the commands of the rules, of the checks and of the PDF. |
| `layouts/<name>/` | The copy of the layout. |
| `paper/paper.md` | The document: the empty paper document of the layout, with the values of the cover page in the front matter and chapters that explain how to work with the layout. |
| `images/` | The figures, first the example figure of the empty paper document, if it has one. |
| `code/`, … | The other files that the empty paper document links to, such as the code of an example listing. |
| `inbox/` | The drop folder for sources. |
| `bib/` | The files of the sources. |

"New Document" writes a Markdown file from the empty paper document of a
layout of the workspace, and "New Layout" copies a layout into a new folder. Both are also
in the context menu of a folder in the Explorer. No command writes a file over
an existing file.

A layout from GitHub stays as it is in the project until you update it. Its
`layout.json` names where it comes from in the field `origin`. "Update
Layout", in the Command Palette and in the context menu of a folder in
`layouts/`, reads the newest version from the repository of the layout: the
files that only the repository changed get their new versions, and your own
changes stay. When you and the repository changed the same file, VS Code asks
before it replaces your change. On the command line:
`npx -y @nimblescape/markdownpaper update`.

## Sources in inbox and bib

Put a source that no program can load on its own, for example a PDF file,
into `inbox/`. An AI agent reads it, finds its authors, its year and its
title, and moves it to `bib/` with the ID of its citation as its name, for
example `bib/hong2024.pdf`. `AGENTS.md` of the project tells the agent this
work. The agent adds the metadata of the source to the database of the
document ([Citations](#citations)).

## Citations

The sources of a document are lines of CSL JSON in the comment
`nimblescape-sources` at the end of the file; GitHub and the pages do not show
it. A citation is a link to the ID of its source, with the place in the source
in the title of the link:

```markdown
Agents change the work of teams ([Hong et al., 2024, S. 3](#hong2024 "page 3")).
[Hong et al. (2024)](#hong2024 "narrative") describe three ways.
```

In VS Code with nimblescape Markdown Notes, type `/cite` in a paper document
and choose a source from the list, which you can search by author, title and
year: the citation goes in at the place, in parentheses. Add the title
`"narrative"` or `"page 3"` to the link for another citation.

With Zotero, `/cite` also lists the items of your Zotero library. Run
"Markdown Paper: Connect Zotero" once and give it an API key that may read
your library; you make the key on the page of the API keys of zotero.org,
<https://www.zotero.org/settings/keys>. VS Code keeps the key in its secret
storage. Without words,
the list shows the items that changed last; type words to search the library.
A chosen item goes into the database of the document:

- The item finds its line by the field `zotero` of the line (the library and
  the item key), then by the DOI, then by the ISBN; else it gets a new line
  with an ID such as `hong2024`, and the field `zotero`.
- A field that the line does not have is added. A field with another value in
  Zotero changes only after you confirm it. Nothing is removed, and the ID
  stays, so no citation breaks.
- The PDF attachment of the item goes to `bib/<ID>.pdf` when Zotero stores the
  file on zotero.org and the file does not exist yet.

"Markdown Paper: Update Sources from Zotero" does the same for all lines of
the database of the open document at once, with one question for all changed
values.

"Format Document" in VS Code (with Markdown Notes) and
`markdownpaper format` write the text of each citation and the entries of the
cited sources under the heading of the reference list, in the citation style
of the layout: `citationStyle` in `layout.json`, the built-in style `apa7` or a
CSL file of the layout, such as `pht-apa7.csl` of the PHT layouts. An AI agent
searches and collects the sources and adds them with `markdownpaper source`,
which takes the metadata from doi.org, the catalogs of the libraries, PubMed,
arXiv, a web page, an export of a reference manager or the DOI of a PDF; the
agent must not write metadata from memory (`instructions document`,
section 9). The checks name a line of the database that is no source, a title
of a link that is no data of a citation, a cited source without an entry, and
each `(RESEARCH)`. `(RESEARCH)` asks an AI agent for the evidence of an
argument: in VS Code with nimblescape Markdown Notes, select the argument in a
paper document and type `/research`; the selection gets a hidden start marker
and `(RESEARCH)` at its end, before a punctuation mark at its end. The clean
editing view of Markdown Notes hides the start marker and the database of the
sources.

## Front matter

A document starts with a front matter in YAML:

```markdown
---
# nimblescape Markdown Paper. The rules of this file: npx -y @nimblescape/markdownpaper instructions document
layout: plain
title: "Agents in the work of teams"
author: "Hannes Stauss"
---
```

`layout` names the layout, the folder `layouts/<name>/` in the folder of the
document or in a folder above it. The other fields are the fields of the
layout, which its cover page and the name of its PDF use. `lang: de-AT`
changes the language of the layout for one document. A document without the
field `layout` gets the built-in layout `plain`.

## Paper documents and notes documents

A Markdown file whose front matter has the field `layout` is a paper
document; another Markdown file, also one with the notes, footnotes, figures
and tables of Markdown Notes, is a notes document. A paper document gets the
checks, its pages in the Markdown preview, and the buttons "Show Page
Preview" and "Export PDF" in the title of the editor. A notes document keeps
the Markdown preview as VS Code shows it.

## Checks and hover

A Markdown file whose front matter names a layout gets warnings in the text
editor and in the Problems view after a pause in typing:

- a layout that does not exist, or a problem of its `layout.json`;
- a required field of the layout without a value;
- a value of a parameter of the layout that is not one of its names;
- a link to `#fig-…`, `#tab-…`, `#lst-…` or `#sec-…`, or a link whose text
  is a word and a number such as `[Kapitel 2.1](#methoden)`, whose figure,
  table, listing or heading does not exist;
- a citation style that cannot be applied, a line of the database of the
  sources that is no source, a title of a citation that is no data of a
  citation, each `(RESEARCH)`, a paragraph of the reference list that is no
  entry, and a cited source without an entry ([Citations](#citations)).

The pointer on the key of a field shows its description from `layout.json`.
`npx -y @nimblescape/markdownpaper check paper/paper.md` prints the same
problems on the command line.

## Headings

The headings get numbers such as 1, 1.1 and 1.1.1, to the depth of the layout.
Do not write the numbers. A heading with `{-}` at its end gets no number, nor
do the headings below it: `# Vorbemerkung {-}`. A file whose headings start
with numbers keeps them.

A heading has the same ID as on GitHub, so a plain Markdown link to it works
on GitHub and on the pages: `## Methoden` is `#methoden`, and
`# Quellen {BIB}` is `#quellen-bib`. A link such as
`[Kapitel 2.1](#methoden)`, which the slash command `/ref` of Markdown Notes
writes, shows the number of the heading on the pages, and a link to an
appendix its label, "Anhang A". A heading needs no anchor.

## Special sections

These sections have no chapter number. The renderer finds them by the words of
their headings in the language of the layout, or by their code in curly
brackets at the end of the heading, for example `# Quellen und Materialien
{BIB}`.

| Code | Section | German | English |
| --- | --- | --- | --- |
| `TOC` | Table of contents, a list | Inhaltsverzeichnis | Table of Contents |
| `LOF` | List of figures, a list | Abbildungsverzeichnis | List of Figures |
| `LOT` | List of tables, a list | Tabellenverzeichnis | List of Tables |
| `LOL` | List of listings, a list | Listingverzeichnis | List of Listings |
| `BIB` | Reference list | Literaturverzeichnis | Bibliography, References |
| `ADT` | Affidavit | Eidesstattliche Erklärung | Affidavit |
| `AST` | Abstract | Abstrakt, Kurzfassung | Abstract |
| `ACC` | Acknowledgments | Danksagung | Acknowledgments |
| `FWD` | Foreword | Vorwort | Foreword, Preface |
| `APX` | Appendix part, with `APX-A`, `APX-B`, … | Anhang | Appendix |

The file holds the four lists as lists of links between two hidden markers,
such as `<!-- toc -->` and `<!-- /toc -->`, under their headings, and the
pages show them with the page of each entry. The format step of the paper
writes these lists and keeps them current: in VS Code in "Format Document"
and the format on save of Markdown Notes, on the command line with
`npx -y @nimblescape/markdownpaper format paper/paper.md`. A section without
the markers gets the list of the renderer. The table of contents does not list
itself.

## Figures and tables

A paragraph `Figure 1:` directly before an image is the caption of the
figure, which the page shows above the image:

```markdown
Figure 1: Die Rollen von Agenten im Team <a id="fig-rollen"></a>

![Die Rollen von Agenten im Team](images/rollen.png)
```

The page shows "Abbildung 1: Die Rollen von Agenten im Team"; an image
without a caption has no number. A paragraph `Table 1:` directly before a
table is the caption of the table:

```markdown
Table 1: Teilnehmende nach Schulstufe <a id="tab-teilnehmende"></a>

| Schulstufe | Anzahl |
| --- | --- |
| 10 | 12 |
```

The file holds the numbers of the captions, which the formatter of Markdown
Notes writes, and the pages keep them. The anchor at the end of the line,
which the slash commands `/figure` and `/table` of Markdown Notes write, names
the figure or the table. A link to it
whose text is a word and a number, such as `[Abbildung 1](#fig-rollen)`, shows
the number of the pages; the slash command `/ref` of Markdown Notes writes
such a link.

## Listings

The slash command `/listing` of Markdown Notes adds code of a source file of
the repository as a listing: a caption line `Listing 1:`, a comment that names
the source and a code block, whose code the formatter of Markdown Notes keeps
current, with the cite of the source after the caption:

````markdown
Listing 1: [Reading the fields](../src/fields.ts#L12-L30) (fields.ts, L12-L30)<a id="lst-reading-fields"></a>

<!-- listing: ../src/fields.ts#read-fields -->

```typescript
export function readFields(lines: readonly string[]): Map<string, string> {
  …
}
```
````

The page shows "Listing 1: Reading the fields (fields.ts, L12-L30)" above the
code: the text of the caption without the link, and the cite of the file. A
link such as `[Listing 1](#lst-reading-fields)` shows the number of the pages.
A layout can show the number of each line before the code
([Layouts](#layouts)).

## Appendix

`# Anhang` or `# Appendix` starts the appendix part, after the reference list.
Each `##` heading in it is an appendix: "Anhang A", "Anhang B"; a single
appendix is "Anhang". The figures, tables and listings of an appendix are
numbered A1, A2, B1.

## Footnotes

A Markdown footnote, `[^1]` with its definition `[^1]: …`, goes to the foot of
the page of its first reference. The pages number the footnotes in the order
of their references.

## Hyphenation

The text gets soft hyphens by the language of the layout (German, English,
Spanish, French and Italian), so the lines break the same in the preview,
in the PDF and on every computer. Headings, links, code, captions and the
reference list get none. The PDF loses the marks of the soft hyphens, so
search and copy find whole words.

## Notes of Markdown Notes

The notes of nimblescape Markdown Notes, footnotes with the label `note-` and
four letters or digits, do not show on the pages. When Markdown Notes shows a
file in its clean editing view, the pages in the preview and "Export PDF" use
the file itself.

## Page preview

The Markdown preview of VS Code shows the pages of a paper document; there
is no other view for the pages. Its keys and buttons open it as for any
Markdown file: Ctrl+Shift+V in the group of the text editor, Ctrl+K V beside
the text editor, and "Open Preview" in the context menu of the Explorer.
"Show Page Preview" in the title of the editor of a paper document (the icon
of a book) opens it beside the text editor too. The preview of a notes
document stays as VS Code shows it. The pages in the preview:

- are white paper on a grey background, also in a dark theme, and get
  smaller when the preview is narrower than a page;
- are made again after a pause in typing
  (`nimblescape.markdownPaper.previewDelay`) and after a change of a file of
  the layout, without a flicker and at the same place; a note "Making the
  pages…" shows meanwhile;
- scroll with the text editor, and a double click on a block shows its line
  in the text editor;
- show what the other Markdown extensions of VS Code add, for example the
  diagrams of Mermaid and the math of KaTeX, and the functions of their
  scripts work on the pages, for example the highlights of the notes and "Add
  Note" of Markdown Notes above a selected passage;
- open a web link outside VS Code, and go to the place of a link in the
  document;
- come back after a restart of VS Code, as the Markdown preview does.

A paragraph longer than about two pages stops Paged.js; the pages then end
before it.

## Export PDF

"Export PDF" in the menu "Run" of the title of a Markdown file, or in the
context menu of the Explorer, writes the PDF beside the file, with the name
that `pdfName` of the layout gives, and opens it
(`nimblescape.markdownPaper.openPdf`). It needs an installed Google Chrome,
Chromium or Microsoft Edge; `nimblescape.markdownPaper.browserPath` names
another program. The PDF shows what the Markdown extensions of VS Code add to
the Markdown preview, for example the diagrams of Mermaid and the math of
KaTeX, in the colors of a light theme; a diagram stands in the middle of the
text. On the command line, which has no extensions of VS Code:

```sh
npx -y @nimblescape/markdownpaper pdf paper/paper.md
```

## Layouts

A layout is a folder `layouts/<name>/`:

| File | Content |
| --- | --- |
| `layout.json` | The format, the name, the language, the fields of the front matter, the numbers of the headings, the depth of the table of contents, the name of the PDF and the words of the language. |
| `page.css` | The style sheet with CSS Paged Media: page size, margins, header and footer. |
| `cover.html` and other templates | The fixed pages, with the fields as `{{title}}`. |
| `document.md` | The empty paper document: the start of a new document, with example texts that explain the layout. |
| `document.pdf` | The preview: the PDF of `document.md`, written by `markdownpaper preview layouts/<name>`. |
| `fonts/`, `images/` | Fonts and images of the layout, also the images of `document.md`. |

`npx -y @nimblescape/markdownpaper instructions layout` prints the whole
format. A change of a file of the layout updates the pages in the preview.

## A layout from a Word template

Many schools give a Word template. Put it into `source/` of a new layout
folder and ask an AI agent to make the layout:
`instructions layout` gives it the steps, from the paper size and the styles
of the template to the comparison of the pages with a PDF of the template.

## Instructions for AI agents

```sh
npx -y @nimblescape/markdownpaper instructions document   # writing a document
npx -y @nimblescape/markdownpaper instructions layout     # the layout folder, also from a Word template
npx -y @nimblescape/markdownpaper instructions render     # making the PDF and checking its pages
```

`AGENTS.md` of a new project names these commands, and each new document
names the first one in its front matter.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `nimblescape.markdownPaper.browserPath` | `""` | The program of Google Chrome, Chromium or Microsoft Edge that prints the PDF. Empty: the extension looks for one at the usual places. Only the settings of the user can set it, not the settings of a workspace. |
| `nimblescape.markdownPaper.previewDelay` | `800` | The pause in typing, in milliseconds, after which the page preview shows the changed text, from 100 to 10000. |
| `nimblescape.markdownPaper.openPdf` | `true` | Opens the PDF with the program of your system for PDF files after "Export PDF". |
