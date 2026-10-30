<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Writing a document for nimblescape Markdown Paper

These are the rules for a Markdown file that nimblescape Markdown Paper turns
into pages and a PDF. They are for people and for AI agents. Print them with
`npx -y @nimblescape/markdownpaper instructions document`.

## 1. Front matter and layout

The file starts with a front matter: YAML between two lines `---`. The field
`layout` names the layout, the name of a folder `layouts/<name>/` in the
folder of the file or in a folder above it. Without the field, the file gets
the built-in layout `plain`.

```markdown
---
layout: pht-thesis
title: "Agents in the work of teams"
author: "Hannes Stauss"
date: "30 October 2026"
---
```

- The other fields are the fields of the layout. `layout.json` of the layout
  lists them, each with a description; a required field must have a value.
  `npx -y @nimblescape/markdownpaper check <file.md>` names each missing
  field.
- The templates of the layout show the fields, for example on the cover page.
  Write the values as they show: the renderer writes nothing into the text of
  a field.
- The field `lang`, for example `lang: de-AT`, changes the language of the
  layout for this file: the hyphenation and the words that the renderer
  writes, such as "Abbildung" or "Figure".
- Do not write a cover page into the text: the layout makes it from the
  fields.

## 2. Headings

- `#` is a chapter, `##` a section, `###` a subsection. The renderer numbers
  them as 1, 1.1, 1.1.1 when the layout numbers headings. Do not write the
  numbers. A file whose headings start with numbers, such as `# 1 Einleitung`,
  keeps its numbers, and the renderer adds none.
- A heading with `{-}` at its end gets no number, nor do the headings below
  it: `# Abstract {-}`. The marker does not show.
- The headings of the generated lists, of the reference list and of the
  appendix part get no number (sections 3 and 7).

## 3. Generated lists

A heading with one of these texts gets its list from the renderer. Leave its
section empty; the renderer replaces what stands there.

| List | German headings | English headings |
| --- | --- | --- |
| Table of contents | Inhaltsverzeichnis, Inhalt | Contents, Table of Contents |
| List of figures | Abbildungsverzeichnis | List of Figures, List of Illustrations |
| List of tables | Tabellenverzeichnis | List of Tables |

The language of the layout decides which words count; a layout can change
them. The table of contents lists the headings after its own heading, to the
depth of the layout, with their pages. The list of figures and the list of
tables list the captions with their pages.

## 4. Figures

An image alone in its paragraph is a figure. Its text in the square brackets
is the caption, and the renderer numbers it:

```markdown
![Die Rollen von Agenten im Team](images/rollen.png)
```

The page shows "Abbildung 1: Die Rollen von Agenten im Team" (in English
"Figure 1: …"), and the list of figures lists it. An image with an empty text,
`![](images/logo.png)`, is a figure without a caption and without a number.
An image within a line of text stays in the line. Write the path of an image
relative to the Markdown file.

## 5. Tables

A paragraph that starts with `Table:` directly before a table is the caption
of the table. The renderer numbers it:

```markdown
Table: Teilnehmende nach Schulstufe

| Schulstufe | Anzahl |
| --- | --- |
| 10 | 12 |
```

The page shows "Tabelle 1: Teilnehmende nach Schulstufe" above the table.
The word of the language, for example `Tabelle:`, works too, and a number in
the caption, as in `Tabelle 3:`, is replaced by the number of the renderer.
A table without such a paragraph has no caption and no number.

## 6. Footnotes

A footnote is a Markdown footnote. Its text goes to the foot of the page of
its first reference:

```markdown
Die Interviews werden aufgezeichnet.[^1]

[^1]: Die Befragten stimmen der Aufzeichnung schriftlich zu.
```

The renderer numbers the footnotes 1, 2, 3 in the order of their first
references, whatever their labels are. A second reference shows the number of
the footnote again. The definition can stand anywhere in the file; lines
indented by four spaces after it belong to it.

## 7. Reference list and appendix

- A chapter heading `# Literaturverzeichnis` or `# References` (more words in
  section 3 of `instructions layout`) starts the reference list. Its entries
  get no soft hyphens; the layout gives them their indent.
- A chapter heading `# Anhang` or `# Appendix` after the reference list starts
  the appendix part. Each `##` heading in it is one appendix: the renderer
  labels it "Anhang A", "Anhang B" (one appendix only: "Anhang"), and numbers
  its figures and tables A1, A2, B1, as APA 7 does.

```markdown
# Anhang

## Interviewleitfaden

…

## Transkripte

…
```

## 8. Notes of nimblescape Markdown Notes

A footnote whose label is `note-` and four small letters or digits, for
example `[^note-7k2q]`, is a note of the authors (format of
nimblescape Markdown Notes, version 1). The pages leave the notes out: their
references, their start markers `<wbr><!--[note-7k2q-->` and their
definitions. Keep a note as it is unless you are asked to change it.

## 9. What the pages do not show

- HTML comments, for example the comment of the format of the notes.
- Scripts: a script in the Markdown text or in a template does not run.

## 10. Checks

```sh
npx -y @nimblescape/markdownpaper check paper/paper.md
npx -y @nimblescape/markdownpaper pdf paper/paper.md
```

`check` names a layout that does not exist and each missing required field.
`pdf` writes the PDF beside the file; see `instructions render`.
