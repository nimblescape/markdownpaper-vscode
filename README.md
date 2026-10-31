# nimblescape Markdown Paper

Makes pages and PDF files from Markdown in VS Code, for a thesis, a report or
a paper. The layout of the pages is a folder in the repository of the
document: `layouts/<name>/` with the fields of the front matter, the style
sheet of the pages and the templates of fixed pages such as the cover page.
The Markdown preview of VS Code shows the pages of a paper as the PDF prints
them, with the table of contents, the list of figures, the list of tables,
the captions, the footnotes at the foot of the page and the appendix. "Export
PDF" writes the PDF with an installed Google Chrome, Chromium or Microsoft
Edge. The notes of [nimblescape Markdown Notes](https://github.com/nimblescape/markdownnotes-vscode)
in the same file stay out of the pages.

The npm package [`@nimblescape/markdownpaper`](https://github.com/nimblescape/markdownpaper-vscode/blob/main/cli/README.md)
gives the same renderer to people and AI agents on the command line, with the
command `mp`: `npx -y @nimblescape/markdownpaper build paper/paper.md`. `mp get`
clones the repositories that a paper names in its front matter, such as its
layout on GitHub, into `.markdownpaper/repos/` of the project. The extension
ships the same command in the terminals of VS Code, with its Tab completion in
bash and zsh, so an author who writes in VS Code installs nothing more than
Node.js 22 or newer.

## What the extension does on your computer

- **When it works.** The extension starts when a Markdown file opens, or when
  the Markdown preview of VS Code shows one. It does not run in VS Code for the
  Web.
- **Markdown files.** The extension reads the open Markdown files and the
  files of their layouts. It writes files only for "Export PDF" (the PDF
  beside the Markdown file) and for "New Project", "New Document" and "New
  Layout", never over an existing file.
- **Terminals.** The extension writes a small script `mp` and the Tab
  completion scripts of `mp` into its storage folder, and adds them to the
  `PATH`, `XDG_DATA_DIRS` and `FPATH` of the terminals of VS Code. The
  script starts the command of the extension with the Node.js of the `PATH`.
  A global `mp` comes first.
- **Page preview.** The pages are in the Markdown preview of VS Code. The
  extension gives it a markdown-it plugin, a script and a style sheet, as
  other Markdown extensions do. The preview keeps the rules of safety of
  VS Code: only the scripts of the extensions run, among them the script of
  the pages and Paged.js; a script in a Markdown file or in a layout does not
  run.
- **Export PDF.** Only "Export PDF" starts a program: the installed Google
  Chrome, Chromium or Microsoft Edge, or the Chromium that it downloaded after
  your answer, without a window, with a profile of its
  own in a temporary folder, and connected to the extension through a pipe,
  not through a network port. The browser reads the page from a temporary
  file and the images of the document from the disk. For the content of the
  other Markdown extensions, "Export PDF" starts the extensions that
  contribute to the Markdown preview, as the preview does, and the page runs
  their scripts from their folders; a script in a Markdown file or in a
  layout does not run.
- **Network.** The extension collects no telemetry. Its own code connects
  only to GitHub: "New Project" lists the layouts on GitHub, and "Update
  Layout" reads the newest version of a copied layout, with the GitHub sign-in
  of VS Code when one exists; to the Zotero web API after "Connect Zotero";
  and to `storage.googleapis.com` for the download of Chromium, after you
  agreed to it. A document or a layout that names an image or a
  font on the web makes the Markdown preview and the browser load it.
- **Restricted Mode and virtual workspaces.** In Restricted Mode the page
  preview, the checks and the commands work, and only the settings of the
  user can name the program of the browser
  (`nimblescape.markdownPaper.browserPath`). In a virtual workspace, "Export
  PDF" does not work, because the browser needs the file on the disk.

## Features

- **Layouts of the repository.** The front matter of a document names its
  layout: `layout: pht-thesis` is the folder `layouts/pht-thesis/` in the
  folder of the document or in a folder above it. `layout.json` lists the
  fields of the front matter with their descriptions; the style sheet uses CSS
  Paged Media (page size, margins, header and footer); the templates fill the
  cover page with the fields. Without a layout, a document gets the built-in
  layout `plain`.
- **Page preview.** A Markdown file whose front matter names a layout is a
  paper document, and the Markdown preview of VS Code shows its pages:
  Ctrl+Shift+V, Ctrl+K V or "Show Page Preview" in the title of the editor.
  Another Markdown file keeps the Markdown preview as VS Code shows it. The
  pages update after a pause in typing and after a change of the layout, the
  preview scrolls with the text editor, and a double click on a page shows
  its line in the text editor. The other Markdown extensions work on the
  pages: the diagrams of Mermaid, the math of KaTeX, and the highlights and
  "Add Note" of Markdown Notes. The pages are white paper also in a dark
  theme.
- **Numbers and lists.** The headings get numbers such as 1.1. The table of
  contents, the list of figures, the list of tables and the list of listings
  show the lists of the file with the page numbers. A paragraph
  `Figure 1: …` directly before an image, `Table 1: …` before a table and
  `Listing 1: …` before a listing is its caption, with the number that the
  file holds. Links to figures, tables and listings show the numbers of the
  pages.
- **Special sections.** The table of contents, the lists, the reference
  list, the affidavit, the abstract, the acknowledgments, the foreword and the
  appendix get no chapter number. The words of their headings come from the
  language of the layout, for example "Inhaltsverzeichnis" and "Anhang A".
- **Appendix.** Each `##` heading after `# Anhang` or `# Appendix` is an
  appendix: "Anhang A", "Anhang B", with the figures and tables A1, B1.
- **Footnotes and hyphenation.** Footnotes go to the foot of their page. The
  text gets soft hyphens by the language of the layout, so the lines break the
  same on every computer.
- **Checks.** A missing required field of the layout, a layout that does not
  exist and a link to a figure or a table that does not exist show as
  warnings in the text editor. The pointer on a field of the front matter
  shows its description.
- **Front matter form.** The view "Front Matter" in the side bar shows the
  front matter of the active Markdown file as a form, with one row for each
  field of its layout, a choice list for a field with names, and read-only
  rows for `layout` and `repos`. Each change is one edit of the file.
- **Export PDF.** "Export PDF" in the menu "Run" of the title of a Markdown
  file writes the PDF beside the file, with the name that the layout gives,
  for example `{{matrikelnummer}}_{{author}}`. The PDF shows what the other
  Markdown extensions add, such as the diagrams of Mermaid and the math of
  KaTeX. The PlantUML diagrams look as in the Markdown preview with the
  extension [nimblescape PlantUML](https://github.com/nimblescape/nimblescape-plantuml),
  whose renderer draws them as vector graphics in every PDF, also on the
  command line. The command line also draws the diagrams of Mermaid, as
  VS Code does.
- **New project, document and layout.** "New Project" lists the layouts of
  the workspace, the built-in layouts and the layouts on GitHub, with a button
  that opens the preview PDF of a layout on GitHub. It writes the folders of a
  paper: `AGENTS.md` for AI agents, the chosen layout, `paper/paper.md` from
  the empty paper document of the layout, which explains how to work with the
  layout, the drop folder `inbox/` for sources, the folder `bib/` for the
  files of the sources, and `images/`. A layout on GitHub stays in its
  repository: the document names its reference in the field `layout`, and
  "New Project" runs `mp get` in a terminal of VS Code, which clones it into
  `.markdownpaper/repos/`. "New Document" and "New Layout" add a document or
  a layout. "Update Layout" updates a copy of a layout on GitHub in
  `layouts/` of an older project from its repository when the repository has
  a newer version, and keeps the changes of the project.
- **Clones.** "Open Repository in New Window" opens the clone of a reference
  of the paper in `.markdownpaper/repos/` in a new window of VS Code, where
  Source Control shows its Git repository; Ctrl+click on a reference in the
  front matter does the same. The clone of a branch is on that
  branch, so you can add snippets there and push them; the clone of a tag or
  a commit pins the version.
- **Notes.** The notes of nimblescape Markdown Notes do not show on the pages.
  The page preview and the PDF of a file in its clean editing view show the
  file itself. The clean editing view hides the database of the sources.
- **Citations and Zotero.** With Markdown Notes, type `/cite` in a paper
  document and choose a source: the citation goes in at the place, in the
  citation style of the layout. After "Connect Zotero" (with an API key of
  zotero.org), the list also shows the items of your Zotero library and of
  the group libraries that the setting
  `nimblescape.markdownPaper.zoteroGroups` names; a chosen item goes into the
  database of the document, and its PDF file into `bib/`.
  "Update Sources from Zotero" takes the changes of Zotero into the sources of
  the document.
- **Research.** With Markdown Notes, select an argument in a paper document
  and type `/research`: the argument gets a hidden start marker and
  `(RESEARCH)` at its end, where an AI agent puts the citations of the
  sources that it finds.

## Usage

1. Open a folder and run "Markdown Paper: New Project" in the Command Palette
   (Ctrl+Shift+P), or open a Markdown file with a front matter.
2. Write the fields of the layout in the front matter, in the text or in the
   view "Front Matter" of the side bar. The warnings name the missing ones.
3. Press Ctrl+Shift+V or Ctrl+K V (on macOS Cmd) for the Markdown preview,
   or choose "Show Page Preview" in the title of the editor.
4. Choose "Export PDF" in the menu "Run" of the title of the editor.

The rules of the documents and of the layouts, for people and AI agents:

```sh
npx -y @nimblescape/markdownpaper instructions document
npx -y @nimblescape/markdownpaper instructions layout
npx -y @nimblescape/markdownpaper instructions render
```

The
[user guide](https://github.com/nimblescape/markdownpaper-vscode/blob/main/docs/guide.md)
describes every feature.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `nimblescape.markdownPaper.browserPath` | `""` | The program of Google Chrome, Chromium or Microsoft Edge that prints the PDF. Empty: the extension looks for one at the usual places. Only the settings of the user can set it. |
| `nimblescape.markdownPaper.previewDelay` | `800` | The pause in typing, in milliseconds, after which the Markdown preview of a paper document makes its pages again, from 100 to 10000. |
| `nimblescape.markdownPaper.openPdf` | `true` | Opens the PDF with the program of your system for PDF files after "Export PDF". |
| `nimblescape.markdownPaper.zoteroGroups` | `[]` | The group libraries of Zotero that `/cite` and "Update Sources from Zotero" read besides your personal library: the number of each group, or its address on zotero.org, for example `https://www.zotero.org/groups/1234567/thesis`. A project can name its groups in `.vscode/settings.json`. |

## Limits

- "Export PDF" needs a Google Chrome, Chromium or Microsoft Edge. Without
  one, it offers to download Chromium once (about 120 MB), which the command
  line uses too; Chrome for Testing has no Chromium for Linux on ARM.
- The pages in the preview and the PDF use the same renderer, but the preview
  runs in the browser of VS Code and the PDF in the installed browser: with a
  font that only one of them has, a line can break at another place. Fonts in
  the layout folder give the same lines in both.
- Paged.js stops at a single paragraph that is longer than about two pages;
  the pages then end before it.
- The diagrams of Mermaid, PlantUML and the other Markdown extensions of
  VS Code show on the pages of the preview and in the PDF of "Export PDF" in
  VS Code. The command line has no extensions of VS Code: its PDF shows the
  diagrams of PlantUML and Mermaid, without the diagrams of ZenUML and the
  icons of the icon packs of Mermaid, and the source text of the other
  diagrams. The pages of
  the preview show the PlantUML diagrams when nimblescape PlantUML is
  installed.
- A layout has no scripts. Its templates know fields and parts that show
  only with a field, no other logic.
- `/cite` and `/research` need nimblescape Markdown Notes. `/cite` reads the
  personal library of Zotero and the group libraries of a setting through the
  web API of zotero.org, not the other group libraries, and copies a PDF only
  when Zotero stores it on zotero.org. AI agents and the command line do not use Zotero: an agent adds
  sources with `mp source`.

---

[Change log](https://github.com/nimblescape/markdownpaper-vscode/blob/main/CHANGELOG.md) · [Contributing](https://github.com/nimblescape/markdownpaper-vscode/blob/main/CONTRIBUTING.md) · [User guide](https://github.com/nimblescape/markdownpaper-vscode/blob/main/docs/guide.md) · [Requirements](https://github.com/nimblescape/markdownpaper-vscode/blob/main/docs/requirements.md) · [Support](https://github.com/nimblescape/markdownpaper-vscode/blob/main/SUPPORT.md) · [Issues](https://github.com/nimblescape/markdownpaper-vscode/issues) · [Source](https://github.com/nimblescape/markdownpaper-vscode)

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](https://github.com/nimblescape/markdownpaper-vscode/blob/main/LICENSE).
