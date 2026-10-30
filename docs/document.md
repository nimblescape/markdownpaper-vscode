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
- The headings of the special sections get no number, nor do the headings
  below them (section 3).

## 3. Special sections and generated lists

A special section has a heading without a number. The renderer finds it by
the words of its heading in the language of the layout, or by the code of the
section in curly brackets at the end of the heading, for example
`# Quellen und Materialien {BIB}`. The marker does not show.

| Code | Section | German headings | English headings |
| --- | --- | --- | --- |
| `TOC` | Table of contents, generated | Inhaltsverzeichnis, Inhalt | Table of Contents, Contents |
| `LOF` | List of figures, generated | Abbildungsverzeichnis | List of Figures, List of Illustrations |
| `LOT` | List of tables, generated | Tabellenverzeichnis | List of Tables |
| `BIB` | Reference list | Literaturverzeichnis, Literatur, Quellenverzeichnis, Quellen, Bibliographie | Bibliography, References, Works Cited |
| `ADT` | Affidavit | Eidesstattliche Erklärung | Affidavit, Statutory Declaration |
| `AST` | Abstract | Abstrakt, Abstract, Kurzfassung, Zusammenfassung | Abstract, Summary |
| `ACC` | Acknowledgments | Danksagung, Dank | Acknowledgments |
| `FWD` | Foreword | Vorwort | Foreword, Preface |
| `APX` | Appendix part: `APX-A`, `APX-B`, … for its appendices | Anhang, Anhänge | Appendix, Appendices |

A layout can change the words. The table of contents, the list of figures and
the list of tables are generated: leave their sections empty, because the
renderer replaces what stands there. The table of contents lists the headings
after its own heading, to the depth of the layout, with their pages; it does
not list itself. The list of figures and the list of tables list the captions
with their pages.

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

An anchor at the end of the line of the image gives the figure a name for
links, as the slash command `/figure` of nimblescape Markdown Notes writes it;
`/ref` writes a link to it:

```markdown
![Der Plan der Studie](images/plan.png) <a id="fig-plan"></a>

[Abbildung 1](#fig-plan) zeigt den Plan.
```

The renderer writes the label of the figure as the text of each link to it
whose text is a word and a number, so "Abbildung 1" is always the number on
the page. A link with other words, such as `[den Plan](#fig-plan)`, keeps its
text.

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

An anchor at the end of the caption names the table for links, as the slash
command `/table` of nimblescape Markdown Notes writes it:
`Table: Teilnehmende nach Schulstufe <a id="tab-teilnehmende"></a>`. A link
`[Tabelle 1](#tab-teilnehmende)` gets the label of the table, as for figures.
`check` and the page preview warn about a link to `#fig-…` or `#tab-…` whose
figure or table does not exist.

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
  section 3) starts the reference list. Its entries get no soft hyphens; the
  layout gives them their indent.
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
