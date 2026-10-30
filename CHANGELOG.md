# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

## 0.1.0

The first version.

- Layouts: a layout is a folder `layouts/<name>/` in the repository of the
  document, with `layout.json` (the format `nimblescape-layout 1.0.0`: the
  fields of the front matter, the language, the numbers of the headings, the
  depth of the table of contents, the name of the PDF and the words of the
  language), style sheets with CSS Paged Media and HTML templates of fixed
  pages, such as the cover page, with the fields of the front matter. The
  built-in layout `plain` is the layout of a document without the field
  `layout`.
- The renderer turns a Markdown document into one HTML page, which Paged.js
  turns into pages, for the page preview and for the PDF alike. It numbers the
  headings, puts footnotes at the foot of their page, hyphenates the text by
  the language of the layout with soft hyphens, and leaves out the notes of
  nimblescape Markdown Notes.
- Special sections without a chapter number, found by the words of their
  headings in the language of the layout or by a marker such as `{BIB}`: the
  table of contents (`TOC`), the list of figures (`LOF`), the list of tables
  (`LOT`), the reference list (`BIB`), the affidavit (`ADT`), the abstract
  (`AST`), the acknowledgments (`ACC`), the foreword (`FWD`) and the appendix
  (`APX`, with the appendices `APX-A`, `APX-B`). The table of contents, the
  list of figures and the list of tables are generated, with the page
  numbers.
- Figures and tables: an image alone in its paragraph is a figure whose text
  is its caption, "Abbildung 1: …"; a paragraph `Table: …` directly before a
  table is its caption, "Tabelle 1: …". In the appendix they are numbered A1,
  B1. An anchor such as `<a id="fig-plan"></a>` at the end of the line names a
  figure or a table, and a link to it, such as `[Abbildung 1](#fig-plan)`,
  shows the number of the pages. A heading has the ID of GitHub, so a plain
  Markdown link such as `[Kapitel 2.1](#methoden)` shows the number of the
  heading.
- A Markdown file whose front matter names a layout is a paper document. Its
  preview is the page preview: Ctrl+Shift+V and Ctrl+K V open it, and the
  buttons of the Markdown preview of VS Code hide while it is open. Another
  Markdown file keeps the Markdown preview of VS Code.
- The page preview beside the text editor shows the pages as the PDF prints
  them, updates them after a pause in typing and after a change of the layout,
  and shows the line of a click on a page in the text editor.
- "Export PDF" writes the PDF with an installed Google Chrome, Chromium or
  Microsoft Edge beside the Markdown file, with the name that the layout
  gives, without the marks of the soft hyphens and with its title, author and
  language in its metadata.
- Checks of the front matter: a layout that does not exist, a missing required
  field and a link to a figure or a table that does not exist are warnings in
  the text editor; the pointer on a field shows its description.
- "New Project", "New Document" and "New Layout": a project gets `AGENTS.md`
  for AI agents, a copy of the layout, `paper/paper.md`, the drop folder
  `inbox/` for sources, the folder `bib/` for the files of the sources, and
  `images/`.
- The settings `nimblescape.markdownPaper.browserPath`,
  `nimblescape.markdownPaper.previewDelay` and
  `nimblescape.markdownPaper.openPdf`.
- The npm package `@nimblescape/markdownpaper` with the command
  `markdownpaper`: `pdf`, `check`, `create`, `new document|layout|project` and
  `instructions document|layout|render`, the rules for AI agents.
