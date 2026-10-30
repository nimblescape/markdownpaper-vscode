# @nimblescape/markdownpaper

The command `markdownpaper` makes the pages and the PDF of a Markdown document
in a layout that the repository of the document defines, as the VS Code
extension
[nimblescape Markdown Paper](https://github.com/nimblescape/markdownpaper-vscode)
does. It also writes new paper projects, documents and layouts, and prints the
rules of the documents and of the layouts for AI agents.

## Install

```sh
npx -y @nimblescape/markdownpaper create
npm install --global @nimblescape/markdownpaper
```

`npx` runs the command without an installation. `markdownpaper` needs Node.js
22 or newer, and an installed Google Chrome, Chromium or Microsoft Edge for
the PDF. It has no dependencies. Its tests run on Linux and macOS.

## Usage

```sh
markdownpaper create
markdownpaper pdf paper/paper.md
markdownpaper check paper/paper.md
markdownpaper format paper/paper.md
markdownpaper source paper/paper.md 10.3390/bs9040039
markdownpaper instructions document
```

| Command | Effect |
| --- | --- |
| `create [folder]` | Writes a new paper project; asks for what its options do not give. `--layout`, `--language`, `--title`, `--author`, and `--yes` to ask nothing. |
| `new project <folder>` | Writes a new paper project without questions. |
| `new document <file>` | Writes a new document with the front matter of its layout (`--layout <name>`). |
| `new layout <folder>` | Copies a layout into a new folder (`--from <name>`, `--language <tag>`). |
| `pdf <file>` | Writes the PDF beside the file, with the name that the layout gives. `--output <file.pdf>`, `--html <file.html>`, `--browser <program>`. |
| `check <file>...` | Checks the front matter against the layout and the links to figures and tables. |
| `format <file>...` | Writes into each file the text of the citations and the reference list in the citation style of the layout, and the lists of the special sections: the table of contents, the list of figures, of tables and of listings. `--check` writes nothing and exits with 1 when the format would change a file. |
| `source <file> <input>...` | Adds sources to the database of the file, with the metadata from doi.org, the catalogs of the libraries (DNB, K10plus, Open Library), PubMed or arXiv. An input is a DOI, an ISBN, a PubMed ID, an arXiv ID, a web address, or a RIS, BibTeX, CSL JSON, HTML or PDF file. `--id <id>`, `--dry-run`, `--offline`. `source --search <words>` lists up to ten works of Crossref with their DOIs. |
| `instructions [topic]` | Prints the rules of a topic for AI agents: `document`, `layout`, `render`. |
| `--help` | Shows the help. |
| `--version` | Shows the version of the command and of the format of the layouts. |

The exit code is 0 for success, 1 when a document has problems or an input of
`source` gave no source, and 2 for a wrong command or option, or a failure.
`source` connects to the services of the metadata, also through the proxy of
`HTTPS_PROXY` and `NO_PROXY`. The environment variable
`MARKDOWNPAPER_BROWSER` names the program of the browser.

## A project

`create` writes these folders:

| Folder or file | Content |
| --- | --- |
| `AGENTS.md` | The instructions for AI agents: the commands of the rules, of the checks and of the PDF, and the work of `inbox/`. |
| `layouts/<name>/` | The layout: `layout.json`, the style sheet, the templates. |
| `paper/paper.md` | The document. |
| `inbox/` | The drop folder for sources that no program can load on its own. An AI agent moves each file to `bib/`. |
| `bib/` | The files of the sources, each named after its citation, for example `hong2024.pdf`. |
| `images/` | The figures. |

## Third-party code

The command contains markdown-it, markdown-it-footnote, yaml, hyphen and
pdf-lib, and the package holds the file of Paged.js.
[THIRD-PARTY-NOTICES.md](https://github.com/nimblescape/markdownpaper-vscode/blob/main/THIRD-PARTY-NOTICES.md)
names their licenses.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/markdownpaper-vscode/blob/main/LICENSE).
