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
  the language of the layout with soft hyphens, also words joined by a slash
  such as "Forschungsfrage/n" but not paths, and leaves out the notes of
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
  nimblescape Markdown Notes, and with `mp format`, whose option
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
- The links of the PDF: every reference inside the paper is a link, also
  each citation to its entry in the reference list and a second reference to
  a footnote, in the color of the text without a mark. A link to the outside
  with its own text gets a footnote with its address, so that a printed page
  shows it. A listing of a public repository has the link to its lines on its
  cite; `mp get` asks GitHub without a sign-in whether a repository is public.
- Without an installed browser, "Export PDF" offers to download Chromium
  once, the headless shell of Chrome for Testing with a checked SHA-256 hash,
  into the cache folder of the user; `mp build --download-browser`
  does the same on the command line.
- Diagrams in every PDF as vector graphics: the PlantUML diagrams with the
  renderer of nimblescape PlantUML, its settings and its included files, in
  VS Code and on the command line, and on the command line the diagrams of
  Mermaid, as the Mermaid extension of VS Code draws them.
- Checks of the front matter: a layout that does not exist, a missing required
  field, a value that is not one of the names of a parameter, and a link to a
  figure, a table or a listing that does not exist are warnings in the text
  editor; the pointer on a field shows its description.
- Parameters of a layout: a field of `layout.json` with `values` lets the
  author choose a variant of the layout in the front matter. VS Code checks
  `layout.json` with the JSON schema `schemas/layout.schema.json`.
- Options for layouts made from a Word template: `headings.numberedSections`
  gives a special section, such as the reference list, a chapter number, and
  `references.hyphenate` hyphenates the reference list but not its links. A
  layout can shrink the spaces of justified lines with a negative
  `word-spacing`, as Word does; the last line of such a paragraph keeps its
  natural spaces.
- The parts of a document: the front part, the body and the appendix part,
  each in an element, so that a layout gives each part its own pages, such as
  no page number in the front part and the numbers I, II, … in the appendix
  part; a `counter-reset: page 1` on a part starts its pages at 1;
  `contents.front: false` leaves the front part out of the table of contents.
- "New Project", "New Document" and "New Layout": a project gets `AGENTS.md`
  for AI agents, a copy of the layout, `paper/paper.md`, the drop folder
  `inbox/` for sources, the folder `bib/` for the files of the sources, and
  `images/`. "New Project" and `mp create` without `--layout`
  list the layouts of the workspace, the built-in layouts and the layouts on
  GitHub (the repositories with the topic
  `nimblescape-markdownpaper-layout`), with their preview PDF; `--layout
  <owner>/<repository>/<folder>@<rev>` names a layout on GitHub. `mp create`
  needs a layout, clones a layout on GitHub into `.markdownpaper/repos/` of
  the project and writes its reference into the field `layout`. "New
  Project" writes the same reference and runs `mp get` in a terminal of
  VS Code.
- The empty paper document and its preview: each layout names in
  `layout.json` its empty paper document (`document`), which a new document
  starts from, with the values of the cover page and example texts that
  explain the layout, and its PDF (`preview`); the files that the document
  links to go into the new project. `mp preview` writes the PDF,
  and `mp layouts` lists the layouts.
- The settings `nimblescape.markdownPaper.browserPath`,
  `nimblescape.markdownPaper.previewDelay` and
  `nimblescape.markdownPaper.openPdf`.
- The npm package `@nimblescape/markdownpaper` with the command `mp`:
  `build`, `check`, `create`, `get`, `new document|layout|project`, `layouts`,
  `preview`, `instructions document|layout|render`, the rules for AI
  agents, and `completion bash|zsh|fish`, the Tab completion scripts.
- The command `mp` in the terminals of VS Code: the extension holds a copy of
  the npm package, and the terminals of VS Code get a script `mp` at the end
  of their `PATH` and the Tab completion of `mp` in bash and zsh.
- The references of a paper: the front matter names its layout on GitHub
  (`layout: <owner>/<repository>/<folder>@<rev>`) and the repositories of the
  code of its listings (`repos`), each with a branch, a tag or a commit. `mp
  get` clones them with Git into `.markdownpaper/repos/<name>/`, which Git
  ignores, brings the head of each branch and keeps the pins; `mp get
  <owner>/<repository>@<rev>` adds a reference, and `mp get -u` moves the
  references to tags to the newest tags. The renderer reads a layout from its
  clone, and the checks name a missing clone. "Open Repository in New Window"
  opens the clone of a reference in a new window of VS Code.
- Citations: the sources of a document as CSL JSON in a comment at the end of
  the file, citations as links to their source with the place in the title of
  the link, and the format writes the text of each citation and the reference
  list in the citation style of the layout. citeproc-js applies the style: the
  built-in style `apa7` (APA Style 7th edition of the Citation Style Language)
  or a CSL file of the layout folder, with the words of the language of the
  layout.
- `mp source <file> <input>...` adds sources to the database of a
  document with the metadata of the places that publish it: a DOI from
  doi.org (Crossref, DataCite, mEDRA, JaLC), an ISBN from the German National
  Library, K10plus or Open Library, a PubMed ID from PubMed, an arXiv ID with
  its DOI, a web page from its metadata, an export in RIS, BibTeX or CSL JSON,
  a saved HTML page, and the DOI in the metadata of a PDF. Each new source
  gets its ID; a source that the database has already is not added again.
  `--search <words>` lists works of Crossref with their DOIs.
- `/research` in VS Code with nimblescape Markdown Notes: on selected text of a
  paper document, it puts a hidden start marker before the argument and
  `(RESEARCH)` at its end, where an AI agent puts the citations of the sources
  that it finds. The checks warn of each `(RESEARCH)` and of a start marker
  without one, the pages leave the start marker out, and the clean editing
  view of Markdown Notes hides the start marker and the database of the
  sources.
- Alerts of GitHub: a block quote whose first line is `[!NOTE]`, `[!TIP]`,
  `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` becomes the element of an alert
  as GitHub writes it, which a layout draws as a box, for example the hint of
  a Word template under a heading; the built-in layout `plain` draws it as
  GitHub does. A hint at the start of the reference list stays before the
  entries and keeps the form of its box: the hanging indent of the reference
  list is only for the entries, `.references > p`.
- The update of a copy of a layout on GitHub: the copy names its origin in
  the field `origin` (the layout, the ref and the commit) of its
  `layout.json`. `mp get` and "Update Layout" read the newest commit of
  the ref and update the copy: a file that only the repository changed gets
  its new version, a file that only the project changed stays, and a file that
  both changed stops the update unless `--force` or a confirmation replaces it.
  The `layout.json` of a
  copy keeps the form of the file of the layout, with `origin` at its end.
- `/cite` with Markdown Notes inserts a citation of a source of the database
  of the document or of an item of the Zotero library of the author. "Connect
  Zotero" keeps an API key of zotero.org in the secret storage of VS Code. A
  chosen item is merged into its line of the database (found by the field
  `zotero`, the DOI or the ISBN): missing fields are added, other values
  change after a confirmation, and nothing is removed; a new item gets a new
  line, and its stored PDF goes to `bib/<ID>.pdf`. "Update Sources from
  Zotero" merges all lines of the database at once.
- A citation in the sentence of a source without names, such as a law, has its
  title in the place of the names: `Schulorganisationsgesetz (1962, § 65)`.
- A comma between two citations in one pair of parentheses joins a work of the
  same authors: the format writes "(Levitt, 1972, 1976)".
- The instructions for AI agents name the fields of a law or an ordinance:
  `container-title` and `number` of the first publication, `references` for
  the cited version, and `issued` for its day.
- `mp source` adds nothing for a catalog record of an ISBN whose
  year comes before ISBNs of its form existed, such as the book of 1968 that
  Open Library gives for the ISBN 978-92-3-100709-5, and notes a source that
  only Open Library knows. `--title <words>` checks the title of the record
  against words of the title of the source in hand.
- The format step of the paper writes the numbers of the headings into the
  links to them, by the rules of the layout: `[Kapitel 7](#methoden)` becomes
  `[Kapitel 2.1](#methoden)` in the file, as on the pages.
