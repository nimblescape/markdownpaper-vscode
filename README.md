# nimblescape Markdown Paper

Makes pages and PDF files from Markdown in VS Code, for a thesis, a report or
a paper. The layout of the pages is a folder in the repository of the
document: `layouts/<name>/` with the fields of the front matter, the style
sheet of the pages and the templates of fixed pages such as the cover page.
The page preview beside the text editor shows the pages as the PDF prints
them, with the table of contents, the list of figures, the list of tables,
the captions, the footnotes at the foot of the page and the appendix. "Export
PDF" writes the PDF with an installed Google Chrome, Chromium or Microsoft
Edge. The notes of [nimblescape Markdown Notes](https://github.com/nimblescape/nimblescape-markdown-notes)
in the same file stay out of the pages.

The npm package [`@nimblescape/markdownpaper`](https://github.com/nimblescape/markdownpaper-vscode/blob/main/cli/README.md)
gives the same renderer to people and AI agents on the command line:
`npx -y @nimblescape/markdownpaper pdf paper/paper.md`.

## What the extension does on your computer

- **When it works.** The extension starts when a Markdown file opens, or when
  VS Code restores a page preview. It does not run in VS Code for the Web.
- **Markdown files.** The extension reads the open Markdown files and the
  files of their layouts. It writes files only for "Export PDF" (the PDF
  beside the Markdown file) and for "New Project", "New Document" and "New
  Layout", never over an existing file.
- **Page preview.** The page preview is a webview of the extension. Its page
  runs only the scripts of the extension and Paged.js; a script in a Markdown
  file or in a layout does not run. It loads only the files of the workspace
  and of the extension.
- **Export PDF.** Only "Export PDF" starts a program: the installed Google
  Chrome, Chromium or Microsoft Edge, without a window, with a profile of its
  own in a temporary folder, and connected to the extension through a pipe,
  not through a network port. The browser reads the page from a temporary
  file and the images of the document from the disk.
- **Network.** The extension's own code connects to no address and collects
  no telemetry. A document or a layout that names an image or a font on the
  web makes the page preview and the browser load it.
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
- **Page preview.** "Show Page Preview" in the title of a Markdown file shows
  the pages beside the text editor. It updates them after a pause in typing
  and after a change of the layout, and a click on a page shows its line in
  the text editor.
- **Numbers and lists.** The headings get numbers such as 1.1. A heading of
  the table of contents, of the list of figures or of the list of tables gets
  its list with the page numbers. An image alone in its paragraph is a
  figure, whose text is its caption: `![Die Rollen](images/rollen.png)` shows
  "Abbildung 1: Die Rollen". A paragraph `Table: …` directly before a table
  is its caption. Links to figures and tables show the numbers of the pages.
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
- **Export PDF.** "Export PDF" in the menu "Run" of the title of a Markdown
  file writes the PDF beside the file, with the name that the layout gives,
  for example `{{matrikelnummer}}_{{author}}`.
- **New project, document and layout.** "New Project" writes the folders of a
  paper: `AGENTS.md` for AI agents, the layout, `paper/paper.md`, the drop
  folder `inbox/` for sources, the folder `bib/` for the files of the
  sources, and `images/`. "New Document" and "New Layout" add a document or a
  layout.
- **Notes.** The notes of nimblescape Markdown Notes do not show on the pages.
  The page preview and the PDF of a file in its clean editing view show the
  file itself.

## Usage

1. Open a folder and run "Markdown Paper: New Project" in the Command Palette
   (Ctrl+Shift+P), or open a Markdown file with a front matter.
2. Write the fields of the layout in the front matter. The warnings name the
   missing ones.
3. Choose "Show Page Preview" in the title of the editor.
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
| `nimblescape.markdownPaper.previewDelay` | `800` | The pause in typing, in milliseconds, after which the page preview shows the changed text, from 100 to 10000. |
| `nimblescape.markdownPaper.openPdf` | `true` | Opens the PDF with the program of your system for PDF files after "Export PDF". |

## Limits

- "Export PDF" needs an installed Google Chrome, Chromium or Microsoft Edge;
  the extension downloads no browser.
- The page preview and the PDF use the same renderer, but the page preview
  runs in the browser of VS Code and the PDF in the installed browser: with a
  font that only one of them has, a line can break at another place. Fonts in
  the layout folder give the same lines in both.
- A layout has no scripts. Its templates know fields and parts that show
  only with a field, no other logic.
- The citations and the reference list from a database of sources are
  planned; until then, write the reference list by hand.

---

[Change log](https://github.com/nimblescape/markdownpaper-vscode/blob/main/CHANGELOG.md) · [Contributing](https://github.com/nimblescape/markdownpaper-vscode/blob/main/CONTRIBUTING.md) · [User guide](https://github.com/nimblescape/markdownpaper-vscode/blob/main/docs/guide.md) · [Requirements](https://github.com/nimblescape/markdownpaper-vscode/blob/main/docs/requirements.md) · [Support](https://github.com/nimblescape/markdownpaper-vscode/blob/main/SUPPORT.md) · [Issues](https://github.com/nimblescape/markdownpaper-vscode/issues) · [Source](https://github.com/nimblescape/markdownpaper-vscode)

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](https://github.com/nimblescape/markdownpaper-vscode/blob/main/LICENSE).
