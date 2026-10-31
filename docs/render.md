<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Making the PDF and checking its pages

These are the rules for making the PDF of a document of nimblescape Markdown
Paper and for checking its pages. They are for people and for AI agents.
Print them with `npx -y @nimblescape/markdownpaper instructions render`.

## 1. The PDF

```sh
npx -y @nimblescape/markdownpaper get
npx -y @nimblescape/markdownpaper build paper/paper.md
```

- `get` clones the repositories that the front matter of the paper names, such
  as its layout on GitHub, into `.markdownpaper/repos/` of the project, or
  brings the head of each branch; CI runs it before `build` too. A private
  repository needs a token with read access to it in `GITHUB_TOKEN` or
  `GH_TOKEN`.
- `build` writes the PDF beside the Markdown file, with the name that
  `pdfName` of the layout gives, and prints its path.
- `--output <file.pdf>` names another file, `--html <file.html>` also writes
  the HTML page, which a browser shows as pages, for a look at a problem.
- The command needs Node.js 22 or later and an installed Google Chrome,
  Chromium or Microsoft Edge. It finds them at their usual places;
  `--browser <program>` or the environment variable `MARKDOWNPAPER_BROWSER`
  names another program. Without one, `--download-browser` downloads
  Chromium once (about 120 MB) into the cache folder of the user, and the
  next runs use it.
- The exit code is 0 for a PDF without problems, 1 for a PDF with problems of
  the document, which the command prints, and 2 when no PDF was written.

## 2. What the renderer does

1. It reads the front matter and finds the layout (`instructions layout`).
2. It turns the Markdown text into HTML: notes of nimblescape Markdown Notes
   leave the text, footnotes go to the foot of their page, headings get their
   numbers, figures, tables and listings their captions with the numbers of
   the file, and the special sections show the lists of the file with the
   page of each entry (`instructions document`).
3. It hyphenates the text by the language of the layout with soft hyphens, not
   in headings, links, code, captions, the generated lists and the reference
   list. Chromium breaks a line only there, so the lines are the same on every
   computer.
4. It fills the templates of the layout with the fields.
5. Paged.js makes the pages with the style sheet of the layout, and the browser
   prints them. The PDF loses the marks of the soft hyphens, so search and copy
   find whole words, and gets the title, the author and the language in its
   metadata.

## 3. Checking the pages

After a change of the document or of the layout, check the pages:

1. Run `npx -y @nimblescape/markdownpaper check paper/paper.md`: no output on
   the standard error means no problem of the front matter.
2. Make the PDF and turn its pages into images, for example
   `pdftoppm -r 60 -png paper/paper.pdf /tmp/page`, and look at each page.
3. Look for: a heading alone at the foot of a page, a figure or a table that
   leaves a large gap, a footnote on another page than its reference, a wrong
   page number in the table of contents, a missing figure (a wrong path), a
   field that shows empty on the cover page, and overfull lines (a long word or
   address that runs into the margin).
4. Fix the cause in the Markdown file or, when the layout is the cause and you
   were asked to change it, in the layout. Do not add empty lines or `<br>` to
   move text to another page.

## 4. In VS Code

The extension nimblescape Markdown Paper shows the same pages beside the text
editor ("Show Page Preview"), updates them after a pause in typing, and shows
the line of a place on a page when you click on it. "Export PDF" writes the PDF
as the command does.
