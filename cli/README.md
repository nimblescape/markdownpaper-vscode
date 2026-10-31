# @nimblescape/markdownpaper

The command `mp` makes the pages and the PDF of a Markdown document in a layout
that the document names, as the VS Code extension
[nimblescape Markdown Paper](https://github.com/nimblescape/markdownpaper-vscode)
does. It gets the other repositories that a paper names, such as its layout on
GitHub, writes new paper projects, documents and layouts, and prints the rules
of the documents and of the layouts for AI agents.

## Install

```sh
npx -y @nimblescape/markdownpaper create
npm install --global @nimblescape/markdownpaper
```

`npx` runs the command without an installation: `npx -y
@nimblescape/markdownpaper build paper/paper.md`. `mp` needs Node.js 22 or
newer, Git for `get` and for a layout on GitHub, and a Google Chrome, Chromium
or Microsoft Edge for the PDF: without an installed one, `build
--download-browser` downloads Chromium once into the cache folder of the user.
It has no dependencies. Its tests run on Linux and macOS.

The package `mp` of another author on npmjs.com also installs a command `mp`;
npm installs only one of the two globally. A shell alias gives `mp` a second
name, for example `alias paper=mp`.

### Before the release

Until the first release, the package is not on npmjs.com. npm cannot install
the folder `cli/` of a repository, so a build of the repository at a commit
makes the package file:

```sh
git clone https://github.com/nimblescape/markdownpaper-vscode.git
cd markdownpaper-vscode
git checkout <commit>
npm ci
node esbuild.mjs --production
npm pack ./cli
npm install --global ./nimblescape-markdownpaper-0.1.0.tgz
```

CI and AI agents run the command from the file without an installation:
`npx -y --package ./nimblescape-markdownpaper-0.1.0.tgz mp build
paper/paper.md`.

### In VS Code

The extension nimblescape Markdown Paper ships the same command in the
terminals of VS Code: its package holds a copy of this package, and the
`PATH` of the terminals ends with a folder of the extension with a script
`mp`. An author who writes in VS Code with Node.js 22 or newer installs
nothing. A global installation comes first in the `PATH` and decides the
version. A terminal that was open before the extension started gets the
command after a restart. The terminals of VS Code also get the Tab completion
of `mp` in bash and zsh.

### Tab completion

`mp completion <shell>` prints the Tab completion script of bash, zsh or
fish. It completes the commands, their options, the words of `new`,
`instructions` and `completion`, and the Markdown files and the folders.

| Shell | Line in the start file |
| --- | --- |
| bash | `source <(mp completion bash)` in `~/.bashrc` |
| zsh | `source <(mp completion zsh)` in `~/.zshrc`, after `compinit` |
| fish | `mp completion fish \| source` in `~/.config/fish/config.fish` |

## Usage

```sh
mp create --layout majikmate/markdownpaper-layout-pht/thesis@main
mp get
mp build paper/paper.md
mp check paper/paper.md
mp format paper/paper.md
mp source paper/paper.md 10.3390/bs9040039
mp instructions document
```

| Command | Effect |
| --- | --- |
| `create [folder]` | Writes a new paper project; asks for what its options do not give. `--layout`, `--language`, `--title`, `--author`, and `--yes` to ask nothing. It needs a layout: `--layout <owner>/<repository>/<folder>@<rev>` clones a layout on GitHub into `.markdownpaper/repos/` and writes its reference into the document; the name of a folder of `layouts/` or of a built-in layout, such as `plain`, copies that layout into the project. In a terminal without `--layout`, it shows the list of the layouts. |
| `new project <folder>` | Writes a new paper project without questions. |
| `new document <file>` | Writes a new document with the front matter of its layout (`--layout <name>`). |
| `new layout <folder>` | Copies a layout into a new folder (`--from <name>`, `--language <tag>`). |
| `layouts` | Lists the layouts that `create` offers, with the layouts on GitHub and their previews. |
| `preview <layout folder>` | Writes the preview PDF of a layout, the PDF of its empty paper document; `--write` also writes the formatted document back. |
| `get [<file>...]` | Clones each repository that the papers of the project name, their layouts (`layout`) and the repositories of their listings (`repos`), into `.markdownpaper/repos/<name>/`, which Git ignores, and checks out the rev of each reference: the head of a branch, a tag or a commit. It also updates the copies of layouts on GitHub in `layouts/` from their repositories: the files that only the repository changed get their new versions, and the changes of the project stay; `--force` also replaces the files that both changed. `-u` moves each reference to a tag to the newest tag of its repository. It asks GitHub without a sign-in whether each repository of `repos` is public, for the link of a listing in the PDF. Without a file, each paper of the project. |
| `get <owner>/<repository>[@<rev>] [<file>]` | Writes the reference into `repos` of the paper and clones the repository; without a rev, the default branch. `--name <name>` names the reference. |
| `build <file>` | Writes the PDF beside the file, with the name that the layout gives. `--output <file.pdf>`, `--html <file.html>`, `--browser <program>`, `--download-browser` (download Chromium once when no browser is installed). |
| `check <file>...` | Checks the front matter against the layout and the links to figures and tables. |
| `format <file>...` | Writes into each file the text of the citations and the reference list in the citation style of the layout, and the lists of the special sections: the table of contents, the list of figures, of tables and of listings. `--check` writes nothing and exits with 1 when the format would change a file. |
| `source <file> <input>...` | Adds sources to the database of the file, with the metadata from doi.org, the catalogs of the libraries (DNB, K10plus, Open Library), PubMed or arXiv. An input is a DOI, an ISBN, a PubMed ID, an arXiv ID, a web address, or a RIS, BibTeX, CSL JSON, HTML or PDF file. `--id <id>`, `--title <words>` (words of the title from the source itself; a record whose title lacks one adds nothing), `--dry-run`, `--offline`. `source --search <words>` lists up to ten works of Crossref with their DOIs. |
| `instructions [topic]` | Prints the rules of a topic for AI agents: `document`, `layout`, `render`. |
| `completion <shell>` | Prints the Tab completion script of `bash`, `zsh` or `fish`. |
| `--help` | Shows the help. |
| `--version` | Shows the version of the command and of the format of the layouts. |

The exit code is 0 for success, 1 when a document has problems, an input of
`source` gave no source, or `get` left a copy of a layout as it is because the
project and the repository changed the same files, and 2 for a wrong command or
option, or a failure, also of Git. `get` runs Git with your access to GitHub; in
CI, a token in `GITHUB_TOKEN` or `GH_TOKEN` gives Git the access to private
repositories.
`source` connects to the services of the metadata, also through the proxy of
`HTTPS_PROXY` and `NO_PROXY`. The environment variable
`MARKDOWNPAPER_BROWSER` names the program of the browser.

## A project

`create` writes these folders:

| Folder or file | Content |
| --- | --- |
| `AGENTS.md` | The instructions for AI agents: the commands of the rules, of the checks and of the PDF, and the work of `inbox/`. |
| `.markdownpaper/repos/<name>/` | The clone of a layout on GitHub, which Git ignores; `paper/paper.md` names its reference in the field `layout`. |
| `layouts/<name>/` | The copy of a layout of the folder or of a built-in layout: `layout.json`, the style sheet, the templates. |
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
