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
  turns into pages, for the preview and for the PDF alike. It numbers the
  headings, puts footnotes at the foot of their page, hyphenates the text by
  the language of the layout with soft hyphens, and leaves out the notes of
  nimblescape Markdown Notes.
- Special sections without a chapter number, found by the words of their
  headings in the language of the layout or by a marker such as `{BIB}`: the
  table of contents (`TOC`), the list of figures (`LOF`), the list of tables
  (`LOT`), the list of listings (`LOL`), the reference list (`BIB`), the
  affidavit (`ADT`), the abstract (`AST`), the acknowledgments (`ACC`), the
  foreword (`FWD`) and the appendix (`APX`, with the appendices `APX-A`,
  `APX-B`). The four lists show the list of links that the file holds
  between hidden markers, such as `<!-- toc -->`, with the page numbers; a
  section without the markers gets the list of the renderer.
- Figures and tables: a paragraph `Figure 1: …` directly before an image is
  the caption of the figure, above the image; a paragraph `Table 1: …`
  directly before a table is its caption. The pages keep the numbers of the
  file, which the formatter of Markdown Notes writes, and a caption without a
  number gets the next number. In the appendix they are numbered A1, B1. An
  anchor such as `<a id="fig-plan"></a>` at the end of the line names a
  figure or a table, and a link to it, such as `[Abbildung 1](#fig-plan)`,
  shows the number of the pages. A heading has the ID of GitHub, so a plain
  Markdown link such as `[Kapitel 2.1](#methoden)` shows the number of the
  heading.
- The format step of the paper writes the four lists into the file and keeps
  them current: in VS Code in "Format Document" and the format on save of
  nimblescape Markdown Notes, and with `markdownpaper format`, whose option
  `--check` exits with 1 when the format would change a file.
- Listings of nimblescape Markdown Notes: a paragraph `Listing 1: …` before the
  comment of the source and the code block is the caption of the listing,
  "Listing 1: …", without the link of the caption and with the cite of the
  source of the file after it, such as "(fields.ts, L12-L30)". The layout
  option `listings.lineNumbers` shows the number of each line before the
  code.
- A Markdown file whose front matter names a layout is a paper document. The
  Markdown preview of VS Code shows its pages as the PDF prints them, as white
  paper also in a dark theme, and updates them after a pause in typing and
  after a change of the layout. The preview scrolls with the text editor, a
  double click on a page shows its line in the text editor, and the other
  Markdown extensions work on the pages, for example Mermaid, KaTeX and the
  highlights and "Add Note" of Markdown Notes. "Show Page Preview" opens the
  preview beside the text editor. Another Markdown file keeps the Markdown
  preview as VS Code shows it.
- "Export PDF" writes the PDF with an installed Google Chrome, Chromium or
  Microsoft Edge beside the Markdown file, with the name that the layout
  gives, without the marks of the soft hyphens and with its title, author and
  language in its metadata. In VS Code, the PDF shows what the other Markdown
  extensions add to the Markdown preview, for example the diagrams of Mermaid
  and the math of KaTeX.
- Checks of the front matter: a layout that does not exist, a missing required
  field, a value that is not one of the names of a parameter, and a link to a
  figure, a table or a listing that does not exist are warnings in the text
  editor; the pointer on a field shows its description.
- Parameters of a layout: a field of `layout.json` with `values` lets the
  author choose a variant of the layout in the front matter. VS Code checks
  `layout.json` with the JSON schema `schemas/layout.schema.json`.
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
- Citations: the sources of a document as CSL JSON in a comment at the end of
  the file, citations as links to their source with the place in the title of
  the link, and the format writes the text of each citation and the reference
  list in the citation style of the layout. citeproc-js applies the style: the
  built-in style `apa7` (APA Style 7th edition of the Citation Style Language)
  or a CSL file of the layout folder, with the words of the language of the
  layout.
- `markdownpaper source <file> <input>...` adds sources to the database of a
  document with the metadata of the places that publish it: a DOI from
  doi.org (Crossref, DataCite, mEDRA, JaLC), an ISBN from the German National
  Library, K10plus or Open Library, a PubMed ID from PubMed, an arXiv ID with
  its DOI, a web page from its metadata, an export in RIS, BibTeX or CSL JSON,
  a saved HTML page, and the DOI in the metadata of a PDF. Each new source
  gets its ID; a source that the database has already is not added again.
  `--search <words>` lists works of Crossref with their DOIs.
