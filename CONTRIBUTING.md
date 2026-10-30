# Contributing

This guide explains the files, the development, the tests and the release of
the extension and of its npm package. The [README](README.md) describes the use
in short, the [user guide](docs/guide.md) describes every feature, and
[docs/requirements.md](docs/requirements.md) lists what the extension must do,
each requirement with an ID, with the plan of the steps and the decisions of
Hannes. A change of a feature updates its requirement in the same pull
request.

## Files

| File | Purpose |
| --- | --- |
| `src/extension.ts` | The editor wiring: activation starts the page previews, the checks of the front matter and the commands, and returns the export `Api` for the tests in VS Code. |
| `src/settings.ts` | The settings of the extension, their defaults, and the check of their values ([R-SET-001](docs/requirements.md#r-set-001)). It uses no API of VS Code. |
| `src/notesApi.ts` | The interface of nimblescape Markdown Notes ([R-GEN-003](docs/requirements.md#r-gen-003)): `getAPI(1).fileOf(uri)`, the file behind a document of its clean editing view, and the open document with the same path without the interface. |
| `src/workspaceHost.ts` | The host of the renderer in VS Code: it reads the files through VS Code, the open documents first, and finds the layouts in the workspace and in the extension. |
| `src/pagePreview.ts`, `media/pagePreview.js`, `media/pagePreview.css` | The page preview ([R-PRV-001](docs/requirements.md#r-prv-001) to [R-PRV-004](docs/requirements.md#r-prv-004)): the webview panel of each file, its first page and its updates after a pause, the restore after a restart, and the script of the webview that makes the new pages with Paged.js beside the old ones, keeps the place on the page and passes a click to the extension. |
| `src/frontMatterChecks.ts` | The warnings of the checks in the text editor and the hover of the fields of the front matter ([R-DOC-002](docs/requirements.md#r-doc-002), [R-DOC-003](docs/requirements.md#r-doc-003)). |
| `src/commands.ts` | "Export PDF", "New Project", "New Document" and "New Layout" in VS Code. |
| `src/paper/frontMatter.ts` | The front matter: its fields with their places in the file, and the text after it with an empty line for each line of the front matter. |
| `src/paper/layout.ts` | `layout.json` and its format `nimblescape-layout 1.0.0`, the codes of the special sections, the words of the languages, and the problems of a layout ([R-LAY-002](docs/requirements.md#r-lay-002), [R-LAY-005](docs/requirements.md#r-lay-005)). |
| `src/paper/template.ts` | The templates of a layout with their fields, and the name of the PDF ([R-LAY-004](docs/requirements.md#r-lay-004)). |
| `src/paper/markdown.ts` | The text of the pages: markdown-it with its footnotes and the rule of the renderer, which leaves out the notes, places the footnotes, numbers the headings, finds the special sections, makes the figures, the captions of the tables, the appendices and the links to figures and tables, and writes the generated lists ([R-REN-002](docs/requirements.md#r-ren-002) to [R-REN-009](docs/requirements.md#r-ren-009)). |
| `src/paper/hyphenate.ts` | The soft hyphens by the language of the layout ([R-REN-007](docs/requirements.md#r-ren-007)). |
| `src/paper/baseCss.ts` | The style sheet of the renderer before the style sheets of the layout ([R-REN-008](docs/requirements.md#r-ren-008)). |
| `src/paper/render.ts` | The renderer ([R-REN-001](docs/requirements.md#r-ren-001)): the layout of a document, its style sheets and templates, and the HTML page with its security policy, which Paged.js turns into pages. |
| `src/paper/checks.ts` | The checks of a document against its layout ([R-DOC-002](docs/requirements.md#r-doc-002)). |
| `src/paper/scaffold.ts` | The files of a new document, layout and project ([R-NEW-001](docs/requirements.md#r-new-001) to [R-NEW-003](docs/requirements.md#r-new-003)), with `AGENTS.md`. |
| `src/paper/instructions.ts` | The topics of `markdownpaper instructions` ([R-CLI-003](docs/requirements.md#r-cli-003)): the documents `docs/document.md`, `docs/layout.md` and `docs/render.md`, which esbuild bundles as text. |
| `src/pdf/browser.ts`, `src/pdf/cdp.ts`, `src/pdf/pdf.ts`, `src/pdf/export.ts` | The PDF ([R-PDF-001](docs/requirements.md#r-pdf-001) to [R-PDF-003](docs/requirements.md#r-pdf-003)): the search for an installed browser, its start without a window with the DevTools protocol over a pipe, the print of the page after Paged.js made all pages, and the PDF without the marks of the soft hyphens and with its metadata, by pdf-lib. |
| `src/cli/cli.ts`, `src/cli/main.ts` | The command `markdownpaper` of the npm package ([R-CLI-001](docs/requirements.md#r-cli-001)), without an API of VS Code in `cli.ts`; `main.ts` runs it with the files, the questions and the standard streams of Node.js. |
| `src/types/` | The types of the packages without types of their own, and of the imports of text with `?raw`. |
| `layouts/plain/` | The built-in layout `plain`: `layout.json`, `page.css`, the title page `title.html` and the start text `document.md` of a new document. |
| `docs/requirements.md` | The specification: the requirements, each with an ID as its heading, the plan of the steps, the decisions and the open questions. |
| `docs/guide.md` | The user guide: every feature, how to use it, and its state. |
| `docs/document.md`, `docs/layout.md`, `docs/render.md` | The rules for people and AI agents, which `markdownpaper instructions document`, `layout` and `render` print. A new document names the first command in its front matter, and `layout.json` the second. |
| `resources/icon.png`, `resources/icon.svg` | The Marketplace icon (256 × 256 PNG, because the Marketplace takes no SVG icon) and its source. |
| `resources/page-preview.svg` | The icon of the tab of the page preview. |
| `src/**/*.test.ts` | The unit tests, with vitest: the manifest, the package contents, the third-party notices and the documents (`src/manifest.test.ts`), the text of the pages (`src/paper/markdown.test.ts`), the front matter, the layouts, the templates, the hyphenation, the page, the checks, the scaffold and the instructions (`src/paper/paper.test.ts`), the PDF (`src/pdf/pdf.test.ts`), the command (`src/cli/cli.test.ts`) and the settings. |
| `test/cli/` | The tests of the built command `markdownpaper` (`cli/dist/markdownpaper.js`) in the temporary folder of the system; the test of the PDF runs when a Chrome, Chromium or Edge is installed. |
| `test/vscode/` | The tests in a real VS Code: the commands, the warnings and the hover of the front matter, the page preview with its pages, and "Export PDF". |
| `dist/`, `media/paged.polyfill.js` | The bundle `dist/extension.js` and the copy of Paged.js, built by `esbuild.mjs` and kept out of Git. |
| `cli/package.json`, `cli/package-lock.json`, `cli/README.md` | The npm package `@nimblescape/markdownpaper`: its manifest, its lock file without dependencies and its page on npmjs.com. The build writes `cli/dist/markdownpaper.js`, copies Paged.js and the built-in layouts into `cli/dist/`, and `LICENSE` and `THIRD-PARTY-NOTICES.md` into `cli/`, all kept out of Git. |
| `out/`, `.vscode-test/` | The bundled tests in VS Code (`scripts/build-vscode-tests.mjs`) and the VS Code that `@vscode/test-cli` downloads for them, kept out of Git. |
| `THIRD-PARTY-NOTICES.md` | The packages that the bundle contains and the packages of the file of Paged.js, their licenses and the places of their source code. |
| `SUPPORT.md` | Where to ask questions and report problems, and what a report contains. |
| `esbuild.mjs` | Bundles `src/extension.ts` into `dist/extension.js` for the Node.js of VS Code, and `src/cli/main.ts` into `cli/dist/markdownpaper.js` for Node.js 22 or later; imports with `?raw` become text. It copies Paged.js into `media/` and `cli/dist/`, the layouts into `cli/dist/layouts/`, and `LICENSE` and `THIRD-PARTY-NOTICES.md` into `cli/`. The editor API stays outside the bundles. The bundles are readable JavaScript, not minified; a production build (`--production`) has no source map. |
| `tsconfig.json` | The settings of the type check: strict, and no output, because esbuild builds the bundle. It covers `src/` and `test/`. |
| `vitest.config.mts`, `vitest.cli.config.mts` | The settings of the unit tests, and of the tests of the built command `markdownpaper`. |
| `.vscode-test.mjs` | The settings of the tests in VS Code: the VS Code version (`VSCODE_TEST_VERSION`, stable by default), the files of `out/test/vscode/`, and mocha. |
| `package.json` | The extension manifest. The section [Manifest](#manifest) explains it. |
| `package-lock.json` | The locked development tools. npm writes this file, and nobody edits it by hand. |
| `.node-version` | The Node release of the development tools. `actions/setup-node` in the workflows and local Node version managers read it. |
| `.vscodeignore` | Lists the files of the package: `dist/extension.js`, `media/paged.polyfill.js`, `media/pagePreview.css`, `media/pagePreview.js`, `layouts/**`, `resources/icon.png`, `resources/page-preview.svg`, `package.json`, `README.md`, `CHANGELOG.md`, `SUPPORT.md`, `LICENSE` and `THIRD-PARTY-NOTICES.md`. |
| `.github/workflows/ci.yml` | Checks the types, runs all tests, packages the VSIX and the npm package for every push to `main`, every pull request and the commit of every release, and runs the tests of `markdownpaper` on Ubuntu and macOS with Node.js 22 and 26. The tests of the PDF use the Google Chrome of the runners. The release publishes the packages of this workflow, so a change of it needs a dry run (rule 4 of the [release rules](#release-rules)). |
| `.github/workflows/vscode-versions.yml` | Runs `ci.yml` once per week with VS Code Insiders and with the lowest supported VS Code version. |
| `.github/workflows/release.yml` | Releases a version on a manual start. The section [Release](#release) explains it. |
| `.github/workflows/release-dry-run.yml` | Fails on a pull request that changes the release process (`release.yml`, `ci.yml` or `scripts/release-checks.mjs`) until a dry run on its branch tested the change (rule 4 of the [release rules](#release-rules)). |
| `.github/workflows/marketplace-identity.yml` | Prints the Marketplace member ID of the publishing identity, to check the setup of the repository. |
| `.github/dependabot.yml` | Proposes weekly updates of the development tools and of the pinned actions. |
| `scripts/build-vscode-tests.mjs` | Bundles each test of `test/vscode/` into `out/test/vscode/` for the tests in VS Code. |
| `scripts/install-local.mjs`, `scripts/uninstall-local.mjs` | Install the built package into every profile of the VS Code of this computer, and remove it again. |
| `scripts/marketplace-setup.sh` | Sets up the Marketplace publishing of the repository ([Setup of a repository](#setup-of-a-repository)). |
| `scripts/npm-setup.sh` | Sets up the npm publishing of the package ([npmjs.com setup](#npmjscom-setup)). |
| `scripts/release-checks.mjs`, `scripts/release-checks.test.mjs` | The check of rule 4 of the [release rules](#release-rules), which the workflows run, and its test. |
| `.vscode/launch.json`, `.vscode/tasks.json` | Build the bundle and start a VS Code window that loads the extension from this folder. |

## Development

The development tools are TypeScript, esbuild, vitest,
[`@vscode/test-cli`](https://github.com/microsoft/vscode-test-cli) for the
tests in VS Code, and [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce),
the Microsoft tool that packages and publishes extensions. Everything runs on
Node.js 24: the release in `.node-version` for the tools and CI, and the
runtime of VS Code 1.125 and later (`engines.vscode`) for the extension. The
command `markdownpaper` of the npm package runs on the Node.js of the `PATH`,
Node.js 22 or later (`engines` of `cli/package.json`).

| Command | Effect |
| --- | --- |
| `npm ci --ignore-scripts` | Installs the locked development tools and runs no install script of a dependency. |
| `npm run typecheck` | Checks the types with `tsc`. esbuild does not check them. |
| `npm test` | Runs the unit tests with vitest. The tests touch no installed editor and start no browser. |
| `npm run test:cli` | Builds the bundles and runs the tests of the built `markdownpaper` in the temporary folder of the system. The test of the PDF needs an installed Chrome, Chromium or Edge, or `MARKDOWNPAPER_BROWSER`. |
| `npm run test:vscode` | Builds the bundle and the tests in VS Code, downloads VS Code to `.vscode-test/` and runs the tests in it. On Linux without a display, run it as `xvfb-run -a npm run test:vscode`. `VSCODE_TEST_VERSION=insiders` or a version such as `1.125.0` selects another VS Code. |
| `npm run build` | Bundles `dist/extension.js` and `cli/dist/markdownpaper.js` with source maps. `node cli/dist/markdownpaper.js pdf <file>` then runs the built `markdownpaper`. |
| `npm run package` | Builds `nimblescape-markdownpaper-<version>.vsix` with vsce, which first runs the production build (`vscode:prepublish`). vsce also validates the manifest and the README. |
| `npm pack ./cli` | Builds the npm package `nimblescape-markdownpaper-<version>.tgz` from `cli/`, after a production build (`node esbuild.mjs --production`). `npx -y ./nimblescape-markdownpaper-<version>.tgz create` runs it. |
| `npm run install-local` | Builds the package and installs it into every profile of the VS Code of this computer; `-- --profile <name>` installs into one profile. Reload the window after an update of an active extension. |
| `npm run uninstall-local` | Removes `nimblescape.nimblescape-markdownpaper` from every profile of the VS Code of this computer. |

The launch configuration "Run the extension" builds the bundle and starts a
second VS Code window that loads the extension from this folder, so that a
change can be tried without a package.

## Reviewing the package

The VSIX holds the bundle `dist/extension.js` as readable JavaScript: not
minified, with the names of the source, and with a comment that names each
source file. To compare a VSIX with the sources, unpack it (a VSIX is a ZIP
file), run `npm ci --ignore-scripts` and `npm run vscode:prepublish` at the
tag of its version, and compare `extension/dist/` of the VSIX with `dist/`.
`media/paged.polyfill.js` is the file `dist/paged.polyfill.js` of the npm
package `pagedjs` of `package-lock.json`, unchanged. The npm package holds the
same files in `package/dist/`.

## Manifest

`package.json` is the extension manifest. It has these parts:

- The name and the publisher define the extension ID `nimblescape.nimblescape-markdownpaper`; the section [Naming](#naming) explains the name.
- The description, the keywords, the categories, the banner (`galleryBanner`), `preview` and `qna` make the page of the Marketplace. A test checks that the description adds no search tag of vsce.
- The version is the only source of the package version, and the tag of a release names it.
- The engine range defines the compatible VS Code versions. `@types/vscode` stays at the lowest version of that range. The manifest enables no proposed API. A test checks both.
- `main` selects the bundle `dist/extension.js`. A test checks it.
- `.vscodeignore` lists the files of the package. A test checks the list.
- `extensionKind` selects the workspace host, where the documents and the browser are.
- The activation event `onLanguage:markdown` starts the extension when a Markdown file opens, and `onWebviewPanel:nimblescape.markdownPaper.pagePreview` when VS Code restores a page preview.
- The commands are in the category "Markdown Paper". "Show Page Preview" is a button in the title of a Markdown file (`editor/title`), "Export PDF" an entry of its menu "Run" (`editor/title/run`), also in the title of the page preview, and "Export PDF", "New Document" and "New Layout" are entries of the context menu of the Explorer. A test checks the commands against `src/extension.ts`.
- The configuration contribution declares the settings of `src/settings.ts` in the section `nimblescape.markdownPaper`. `browserPath` has the scope `machine`, so that only the settings of the user name a program, and the capability `untrustedWorkspaces` lists it as restricted. A test keeps the defaults equal to `src/settings.ts`, and a test checks that the README, the guide and the requirements name every setting.
- The package has no runtime dependency: the bundle contains every package, and the package holds Paged.js as a file. `allowScripts` lists the install scripts of dependencies that npm may run: those of esbuild and `@vscode/vsce-sign`, and not the one of fsevents.

`README.md` is the page of the Marketplace and `CHANGELOG.md` its tab
"Changelog". Both files, `SUPPORT.md` and `cli/README.md` use full
`https://github.com/…` links outside code, so that every link works in the
repository, in the package and on the Marketplace. A test checks it.

## npm package

`cli/` is the npm package `@nimblescape/markdownpaper`, in the scope of the
organization `nimblescape` on npmjs.com, with the command `markdownpaper`
([R-CLI-001](docs/requirements.md#r-cli-001)). Its manifest
`cli/package.json` has these parts:

- The name `@nimblescape/markdownpaper` and the command `markdownpaper` (`bin`) ([decision 5](docs/requirements.md#decisions)).
- The version, which the release sets to the version of the extension. A test checks that both manifests and `cli/package-lock.json` have one version.
- `files` keeps the bundles of `dist/`, Paged.js, the built-in layouts of `dist/layouts/` and `THIRD-PARTY-NOTICES.md`; npm adds `package.json`, `README.md` and `LICENSE`. A test checks the list with `npm pack --dry-run`.
- `engines.node` is `>=22`, and the package has no dependency: the bundle imports only modules of Node.js, which a test checks.
- `repository.directory` is `cli`, and `publishConfig.access` is `public`, which a scoped package needs for its first version.

## Renderer

The renderer is one module without an API of VS Code (`src/paper/`), so the
extension and the command use the same code: a host gives it the reader of the
files and the addresses that the page loads. The extension reads through
VS Code and gives the addresses of the webview; the command reads the disk and
gives `file:` addresses. The renderer writes one HTML page; Paged.js makes its
pages in the webview of the page preview and in the browser of the PDF. The
page reports the end with the event `paper-rendered` and
`window.paperRendered`, which the PDF waits for before the print.

A change of the text of the pages starts in `src/paper/markdown.ts`, as a step
of the rule `nimblescape_paper` on the tokens of markdown-it, with a test in
`src/paper/markdown.test.ts` and its requirement in
[docs/requirements.md](docs/requirements.md). A class that a layout can style
goes into the table of section 5 of `docs/layout.md`, so that agents find it.

## Tests in VS Code

`npm run test:vscode` runs the tests of `test/vscode/` in a real VS Code with
the extension of the development build. The tests write a layout and Markdown
files into a temporary folder, check the commands, the warnings and the hover
of the front matter, count the pages of the page preview with the export
`pagesOf` of the extension, and run "Export PDF" when a Chrome, Chromium or
Edge is installed. CI runs them under `xvfb-run` with the stable VS Code, and
the workflow "VS Code versions" once per week with VS Code Insiders and with
the lowest supported version.

## Naming

Every extension of the publisher `nimblescape` uses one name,
`nimblescape-<name>`, for the package and the extension, and the repository
`<name>-vscode` (Hannes, 2026-10-30, 02:01 and 02:04):

| What | Form | This extension |
| --- | --- | --- |
| Repository | `nimblescape/<name>-vscode` | `nimblescape/markdownpaper-vscode` |
| `name` in `package.json` | `nimblescape-<name>` | `nimblescape-markdownpaper` |
| Extension ID | `nimblescape.nimblescape-<name>` | `nimblescape.nimblescape-markdownpaper` |
| Package file | `nimblescape-<name>-<version>.vsix` | `nimblescape-markdownpaper-<version>.vsix` |
| Display name | `nimblescape <Title>` | `nimblescape Markdown Paper` |
| npm package and command | `@nimblescape/<name>`, `<name>` | `@nimblescape/markdownpaper`, `markdownpaper` |

`scripts/marketplace-setup.sh` checks that the name of the repository is
`<name>-vscode` for the `name` `nimblescape-<name>` of `package.json`. The
prefix keeps the name apart from the names of other publishers, because the
Marketplace accepts a `name` only once. The Marketplace cannot rename an
extension ID: another `name` publishes a new extension, and the old one stays
with its installations. An extension that is no longer wanted is unpublished
(More Actions > Unpublish; this can be undone), never removed: the Marketplace
keeps the `name` of a removed extension reserved permanently, also for its own
publisher.

## Release

A released version is a tag `v<version>` whose `<version>` equals the version
in `package.json` and in `cli/package.json`. The workflow "Release" creates
the version, its tag, its GitHub release, its Marketplace version and its
version on npmjs.com in one run. To release a version,
follow these steps:

1. Optional: add a section `## <version>` to `CHANGELOG.md` on `main`. The section describes the changes for the users (see [Release rules](#release-rules)).
2. In the tab "Actions", choose the workflow "Release", then "Run workflow" on the branch `main`. Enter the version, for example `0.1.7`. When `CHANGELOG.md` has no section for the version, enter its notes too: they become the section. The GitHub website starts a workflow also in the browser of a phone.

The run has five jobs:

1. "Version commit" checks that the run starts from `main`, that the version has the form `<major>.<minor>.<patch>`, that it is not lower than the version in `package.json` and that its tag does not exist, and, in a release, that a dry run tested the files of the release process with `scripts/release-checks.mjs dry-run` (rule 4 of the [release rules](#release-rules)). It sets the version in `package.json`, `package-lock.json`, `cli/package.json` and `cli/package-lock.json`, adds the section of the notes to `CHANGELOG.md` when the file has none, commits the change as "Release `<version>`" and pushes it to the temporary branch `release/run-<run ID>`, not to `main`. When `main` holds the version and its section already, it commits nothing. It also deletes the temporary branches of earlier runs that failed.
2. "CI" runs the workflow `ci.yml` for the commit of the version, because a push with the token of a workflow starts no other workflow. The VSIX and the npm package that this job tests and builds are the files of the release, so the release repeats no test and no build.
3. "Main, tag and GitHub release" runs only when CI passed. It moves `main` to the commit of the version as a fast-forward and deletes the temporary branch. When `main` changed during the run, it stops before the tag. Then it creates the tag `v<version>` on the commit and the release of the tag with the GitHub CLI `gh`. The section of the version in `CHANGELOG.md` becomes the notes, and the VSIX and the npm package (`nimblescape-markdownpaper-<version>.tgz`) become the files of the release. A release that exists keeps its notes and receives only a file that it does not hold.
4. "Publish to the Visual Studio Marketplace" downloads the VSIX of the GitHub release, signs in to Microsoft Entra ID with the official [`azure/login`](https://github.com/Azure/login) action and publishes the VSIX with `vsce publish --azure-credential`.
5. "Publish to npmjs.com" downloads the npm package of the GitHub release and publishes it with `npm publish --access public`, with [trusted publishing](https://docs.npmjs.com/trusted-publishers): npm exchanges the OpenID Connect token of the job for a token of npmjs.com that can publish only this package, and adds the provenance of the build. It skips a version that npmjs.com holds already, and it stops with a message when the package does not exist yet (see [npmjs.com setup](#npmjscom-setup)). This job is the only part of this section that the other extension repositories of nimblescape do not have.

`main` receives the version commit only after CI passed. When CI fails,
`main`, the tags, the releases and the Marketplace stay unchanged, and the
version can still be released: fix the cause on `main` and start the release
of the same version again. The jobs move and push with the token of the
workflow, so a rule of `main` that blocks direct pushes stops the release.

A dry run tests a release without a change: choose "Dry run" when you start
the workflow. The run makes the version commit on its temporary branch, runs
CI for it and deletes the branch; it changes neither `main`, a tag, a release
nor the Marketplace. Its run name ends with "(dry run)". A dry run may start
from another branch than `main`, so it also tests a change of `release.yml` on
that branch before the change reaches `main`.

When a job fails, remove the cause and choose "Re-run failed jobs" on the
run. A re-run keeps the tag and the files that the GitHub release already
holds, and the Marketplace and the publish job of npm skip a version that
they already hold, so a re-run never publishes a version twice. When the publish job fails, for example
because the Marketplace refuses the package, the tag and the GitHub release
stay, and the re-run publishes the VSIX of the GitHub release. GitHub allows a
re-run only within 30 days of the run; after that, only a new version can
reach the Marketplace. A new run deletes the temporary branch of a failed run,
so a failed run can no longer be re-run after a new run started.

The Marketplace refuses a package with more than 30 tags, with the error "You
exceeded the number of allowed tags of 30", which the Microsoft publishing
guide names. The tags are the keywords of `package.json` and the tags that
vsce adds, for example the language of each `onLanguage` event in
`activationEvents`; the element `<Tags>` of `extension.vsixmanifest` in the
VSIX lists them. No job counts them before the tag.

The workflows `release.yml`, `release-dry-run.yml` and
`marketplace-identity.yml`, the script `scripts/release-checks.mjs` with its
test `scripts/release-checks.test.mjs`, and this section are the same in every
extension repository of nimblescape. A change to them goes into every
repository.

### Release rules

Every extension of nimblescape follows these rules. Only rule 4 has a check
in the workflows, `scripts/release-checks.mjs dry-run`; everyone follows the
other rules without a check.

1. **The ID never changes.** An extension keeps its ID `nimblescape.nimblescape-<name>` (see [Naming](#naming)), and nimblescape never publishes an extension under a new ID.
2. **No deletion.** nimblescape never deletes an extension or a version of the npm package. No workflow, npm script or file of `scripts/` runs `npm unpublish`, after which npmjs.com never accepts the number of that version again, or `vsce unpublish`, which deletes the extension on the Marketplace, or `vsce delete-publisher`, which deletes the publisher with all its extensions. On the publisher management page, nobody uses More Actions > Remove, which deletes the extension and keeps its name reserved permanently, or "Delete this version" (More Actions > Reports, tab Manage), after which the number of the version can never be used again. An extension that is no longer wanted is unpublished on the publisher management page, as [Naming](#naming) describes.
3. **Only changes for the users, at most one version in 7 days.** A version is published only when it changes something for the users, its section in `CHANGELOG.md` describes that change, and at least 7 days passed since the newest release; an urgent fix may come earlier. A change for the users changes the extension that VS Code runs: its code (`src/`, which the build bundles into `dist/`), another file of the package that is not a document, for example the icon of a view, or a field of `package.json` that changes how the extension works, for example `contributes`. A change only of the documents (for example the README), the Marketplace icon, the tests or the build tools (for example `esbuild.mjs`, `tsconfig.json` or a file of `scripts/`) does not count: it reaches the users with the next version that changes the extension. Images that only the README shows do not belong in the package: the README links them with full `https://github.com/…` links (see [Manifest](#manifest)). The section of the version in `CHANGELOG.md` does not say "maintenance release", "behaves as in" followed by a version, or a phrase of that kind.
4. **Dry run first.** A change of the release process is tested with a dry run before it reaches `main`. The files of the release process are `release.yml`, `ci.yml`, whose VSIX the release publishes, and `scripts/release-checks.mjs`. The workflow "Release dry run" runs on every pull request. When the pull request changes one of these files, also in an update by Dependabot, the check `dry-run` fails until a successful dry run, or the newest release, had these files as they are at the head of the pull request. Start the workflow "Release" on the branch of the pull request with "Dry run" and a version without a tag (with notes when `CHANGELOG.md` has no section for the version), then re-run the job "release dry run" of the pull request. A pull request from a fork cannot meet the rule, because the dry run needs a branch of this repository. The pull request that brings the release process to a new repository passes the check with a notice: its base branch has no `release.yml` yet, and GitHub starts the workflow "Release" only when the default branch has it. Before the first release, start the workflow "Release" on `main` with "Dry run". The job "Version commit" of a release runs the check `dry-run` again, so a change that reached `main` without a dry run stops the release until a dry run tested it. Do not make "release dry run" a required check of `main`: the release moves `main` to its version commit, which has no result of the check.
5. **Only GitHub Actions with Microsoft Entra ID.** Only the job "Publish to the Visual Studio Marketplace" publishes, signed in with the app registration of [Marketplace setup](#marketplace-setup). No personal access token exists for the publisher. No other workflow, npm script or file of `scripts/` runs `vsce publish` or `vsce login`. Nobody uploads a VSIX on the publisher management page or runs `vsce publish`, `unpublish`, `delete-publisher` or `login` on a computer. In this repository, the job "Publish to npmjs.com" publishes the npm package in the same way, with trusted publishing and no token; only the first version of the package is published once by hand, with `scripts/npm-setup.sh`, because npmjs.com sets up a trusted publisher only for a package that exists.

## Marketplace setup

The workflow publishes with a Microsoft Entra ID token, as the
[Microsoft publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
recommends. It uses no personal access token, because Azure DevOps retires
the global personal access tokens that the Marketplace needs on
1 December 2026. The publishing identity is an app registration with a
federated credential for each repository: GitHub Actions proves the identity
of the job with an OpenID Connect token, so no secret is stored. An app
registration needs no Azure subscription. One app registration publishes
every extension of the publisher `nimblescape`, because the Marketplace
grants the role of a member for the whole publisher.

### What exists

| Part | Where | Value |
| --- | --- | --- |
| Publisher | [Marketplace publisher management](https://marketplace.visualstudio.com/manage) | `nimblescape`, the `publisher` in `package.json` |
| App registration | [Microsoft Entra admin center](https://entra.microsoft.com), "App registrations" | `vscode-marketplace-publisher`, a member of the publisher `nimblescape` with the role "Contributor" |
| Organization variables | GitHub organization `nimblescape`, "Secrets and variables", "Actions", "Variables" | `AZURE_CLIENT_ID` (the application ID of the app) and `AZURE_TENANT_ID` (its directory ID); identifiers, not secrets |
| Federated credential | the app, "Certificates & secrets", "Federated credentials" | one for each repository, named after it |
| Environment | the settings of each repository, "Environments" | `marketplace`, reachable from the tags `v*` and the branch `main` only |

### Setup of a repository

A new extension repository needs its federated credential and its
environment. The script `scripts/marketplace-setup.sh` sets both up for the
GitHub repository of the remote `origin` of the clone, whose name must be
`<name>-vscode` for the `name` `nimblescape-<name>` of `package.json`; it needs the Azure CLI, the GitHub CLI and Node.js,
the two CLIs signed in with an account that may change the app registration
and the settings of the repository. It shows what it sets up and
asks before it changes anything. It changes nothing that already exists, so it
can run again:

```sh
az login --allow-no-subscriptions
gh auth login
scripts/marketplace-setup.sh
```

Then run the workflow "Marketplace identity" in the tab "Actions" of the
repository: it signs in like the publish job and prints the member ID of the
app, which shows that the setup works.

The script gives the credential these values, and prints the subject with the
ID of the repository. For this repository:

| Field of the federated credential | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:nimblescape@156021698/markdownpaper-vscode@<repository ID>:environment:marketplace` |
| Audience | `api://AzureADTokenExchange` |

GitHub puts the owner ID and the repository ID into the subject of every
repository created after 15 July 2026, so a new owner of a reused name gets no
token. The subject also holds the name of the repository: after a rename of
the repository, run the script again and delete the credential of the old
name. One app accepts at most 20 federated credentials.

### Setup from scratch

Only when the publisher, the app or the variables are lost:

1. Create the publisher `nimblescape` on the publisher management page, signed in with the Microsoft account of nimblescape e.U.
2. Register the app `vscode-marketplace-publisher` in the Entra admin center: "New registration", "Single tenant", no API permission, no secret.
3. Set the organization variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` to the application ID and the directory ID of the app. Organization variables reach private repositories only on a paid GitHub plan.
4. Set up a repository with the script, and run its workflow "Marketplace identity".
5. On the publisher management page, open the publisher `nimblescape`, then "Members", and add the member ID that the workflow printed with the role "Contributor".

## npmjs.com setup

The job "Publish to npmjs.com" publishes with
[trusted publishing](https://docs.npmjs.com/trusted-publishers): npmjs.com
trusts the workflow `release.yml` of this repository in the environment
`npm`, and accepts the OpenID Connect token of its job instead of a token.
No npm token is stored in GitHub.

### What exists

| Part | Where | Value |
| --- | --- | --- |
| Organization | [npmjs.com](https://www.npmjs.com/org/nimblescape) | `nimblescape`, the scope of the package |
| Package | npmjs.com | `@nimblescape/markdownpaper`, public |
| Trusted publisher | the settings of the package on npmjs.com, "Trusted Publisher" | GitHub Actions, the repository `nimblescape/markdownpaper-vscode`, the workflow `release.yml`, the environment `npm` |
| Environment | the settings of the repository, "Environments" | `npm`, reachable from the tags `v*` and the branch `main` only |

### Setup

npmjs.com sets up a trusted publisher only for a package that exists, so
the first version is published once by hand, from the GitHub release of
that version. The script `scripts/npm-setup.sh` does all steps. It needs the
GitHub CLI and npm 11.15.0 or newer, both signed in: npm with an account
that may publish in the organization `nimblescape` and has two-factor
authentication, because `npm trust` and the first `npm publish` ask for the
second factor. It shows what it sets up and asks before it changes
anything. It changes nothing that already exists, so it can run again. It
shows the trusted publishers of the package and asks whether to add the
trusted publisher: npm lists them only after the second factor, in the
terminal, so the script cannot check them itself:

```sh
gh auth login
npm login
scripts/npm-setup.sh          # before the first release: the environment npm
scripts/npm-setup.sh 0.2.0    # after the release 0.2.0: its first version and the trusted publisher
```

The order for the first version of the package:

1. Run `scripts/npm-setup.sh` without a version, so the environment `npm` exists.
2. Release the version with the workflow "Release". The job "Publish to npmjs.com" fails, because the package does not exist yet; the Marketplace and the GitHub release are not affected.
3. Run `scripts/npm-setup.sh <version>`. It downloads the npm package of the GitHub release, publishes it, and adds the trusted publisher.
4. Re-run the failed job "Publish to npmjs.com". It finds the version on npmjs.com and ends without a change.

From the next version on, the release publishes to npmjs.com without a step
by hand. Optionally, set "Publishing access" of the package on npmjs.com to
"Require two-factor authentication and disallow tokens" after the setup:
trusted publishing still works, and no token can publish.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](LICENSE).
