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
- A heading has the ID that GitHub gives it: its text in small letters,
  without punctuation and with a hyphen for each space, so `## Methoden` is
  `#methoden` and `# Quellen {BIB}` is `#quellen-bib`; a second heading of the
  same text gets `-1`. A plain Markdown link to a heading, as the slash command
  `/ref` of nimblescape Markdown Notes writes it, works on GitHub and on the
  pages: a link whose text is a word and a number, such as
  `[Kapitel 2.1](#methoden)`, shows the number of the heading on the pages; a
  link to an appendix shows its label, "Anhang A". Do not add an anchor to a
  heading; an anchor at its end, `<a id="sec-methods"></a>`, still works as a
  second ID.

## 3. Special sections and generated lists

A special section has a heading without a number. The renderer finds it by
the words of its heading in the language of the layout, or by the code of the
section in curly brackets at the end of the heading, for example
`# Quellen und Materialien {BIB}`. The marker does not show.

| Code | Section | German headings | English headings |
| --- | --- | --- | --- |
| `TOC` | Table of contents, a list | Inhaltsverzeichnis, Inhalt | Table of Contents, Contents |
| `LOF` | List of figures, a list | Abbildungsverzeichnis | List of Figures, List of Illustrations |
| `LOT` | List of tables, a list | Tabellenverzeichnis | List of Tables |
| `LOL` | List of listings, a list | Listingverzeichnis, Verzeichnis der Listings | List of Listings |
| `BIB` | Reference list | Literaturverzeichnis, Literatur, Quellenverzeichnis, Quellen, Bibliographie | Bibliography, References, Works Cited |
| `ADT` | Affidavit | Eidesstattliche Erklärung | Affidavit, Statutory Declaration |
| `AST` | Abstract | Abstrakt, Abstract, Kurzfassung, Zusammenfassung | Abstract, Summary |
| `ACC` | Acknowledgments | Danksagung, Dank | Acknowledgments |
| `FWD` | Foreword | Vorwort | Foreword, Preface |
| `APX` | Appendix part: `APX-A`, `APX-B`, … for its appendices | Anhang, Anhänge | Appendix, Appendices |

A layout can change the words. The four lists stand in the file, as lists of
links between two hidden markers under their heading. The formatter writes
them and keeps them current; do not change them by hand:

```markdown
# Inhaltsverzeichnis

<!-- toc -->
- [1 Einleitung](#einleitung)
- [1.1 Methoden](#methoden)
<!-- /toc -->

# Abbildungsverzeichnis

<!-- lof -->
- [Abbildung 1: Teilnehmende nach Schulstufe](#fig-teilnehmende)
<!-- /lof -->
```

The markers of the list of tables and of the list of listings are
`<!-- lot -->` and `<!-- lol -->`. The pages show each list with the page of
each entry, and nothing else of its section. The table of contents lists the
headings after its own heading, to the depth of the layout; it does not list
itself. A section without the markers gets the list of the renderer.

## 4. Figures

A paragraph `Figure 1:` directly before an image alone in its paragraph is
the caption of the figure:

```markdown
Figure 1: Die Rollen von Agenten im Team

![Die Rollen von Agenten im Team](images/rollen.png)
```

The page shows "Abbildung 1: Die Rollen von Agenten im Team" above the image,
and the list of figures lists it. The word of the language, `Abbildung 1:`,
works too. The file holds the number of each caption, which the formatter of
nimblescape Markdown Notes writes; the pages keep it. An image alone in its
paragraph without a caption, such as a logo, is a figure without a caption
and without a number. An image within a line of text stays in the line. Write
the path of an image relative to the Markdown file.

An anchor at the end of the caption gives the figure a name for links, as the
slash command `/figure` of nimblescape Markdown Notes writes it; `/ref` writes
a link to it:

```markdown
Figure 1: Der Plan der Studie <a id="fig-plan"></a>

![Der Plan der Studie](images/plan.png)

[Abbildung 1](#fig-plan) zeigt den Plan.
```

The renderer writes the label of the figure as the text of each link to it
whose text is a word and a number, so "Abbildung 1" is always the number on
the page. A link with other words, such as `[den Plan](#fig-plan)`, keeps its
text.

## 5. Tables

A paragraph that starts with `Table 1:` directly before a table is the
caption of the table:

```markdown
Table 1: Teilnehmende nach Schulstufe

| Schulstufe | Anzahl |
| --- | --- |
| 10 | 12 |
```

The page shows "Tabelle 1: Teilnehmende nach Schulstufe" above the table.
The word of the language, for example `Tabelle 1:`, works too. The pages keep
the number of the file; a caption without a number, `Table:`, gets the next
number. A table without such a paragraph has no caption and no number.

An anchor at the end of the caption names the table for links, as the slash
command `/table` of nimblescape Markdown Notes writes it:
`Table 1: Teilnehmende nach Schulstufe <a id="tab-teilnehmende"></a>`. A link
`[Tabelle 1](#tab-teilnehmende)` gets the label of the table, as for figures.
`check` and the page preview warn about a link to `#fig-…`, `#tab-…`,
`#lst-…` or `#sec-…`, or a link whose text is a word and a number, whose
figure, table, listing or heading does not exist.

## 6. Listings

A listing is code of a source file of the repository, as the slash command
`/listing` of nimblescape Markdown Notes writes it: a paragraph `Listing 1:`,
the comment of the source, and a fenced code block. The caption is a link to
the file and the lines of the source (`#L12-L30`, one line `#L12`, no `#L`
for the whole file), and an anchor `lst-…` at its end names the listing:

````markdown
Listing 1: [Reading the fields](../src/fields.ts#L12-L30)<a id="lst-reading-fields"></a>

<!-- listing: ../src/fields.ts#read-fields -->

```typescript
export function readFields(lines: readonly string[]): Map<string, string> {
  …
}
```
````

The page shows "Listing 1: Reading the fields (fields.ts, L12-L30)" above the
code, without the link. A link `[Listing 1](#lst-reading-fields)` gets the
label of the listing. Do not change the code of a listing by hand: the
formatter of Markdown Notes writes it from the source.

## 7. Footnotes

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

## 8. Reference list and appendix

- A chapter heading `# Literaturverzeichnis` or `# References` (more words in
  section 3) starts the reference list. Its entries get no soft hyphens; the
  layout gives them their indent.
- A chapter heading `# Anhang` or `# Appendix` after the reference list starts
  the appendix part. Each `##` heading in it is one appendix: the renderer
  labels it "Anhang A", "Anhang B" (one appendix only: "Anhang"), and numbers
  its figures, tables and listings A1, A2, B1, as APA 7 does.

```markdown
# Anhang

## Interviewleitfaden

…

## Transkripte

…
```

## 9. Notes of nimblescape Markdown Notes

A footnote whose label is `note-` and four small letters or digits, for
example `[^note-7k2q]`, is a note of the authors (format of
nimblescape Markdown Notes, version 1). The pages leave the notes out: their
references, their start markers `<wbr><!--[note-7k2q-->` and their
definitions. Keep a note as it is unless you are asked to change it.

## 10. What the pages do not show

- HTML comments, for example the comment of the format of the notes.
- Scripts: a script in the Markdown text or in a template does not run.

## 11. Checks

```sh
npx -y @nimblescape/markdownpaper check paper/paper.md
npx -y @nimblescape/markdownpaper pdf paper/paper.md
```

`check` names a layout that does not exist and each missing required field.
`pdf` writes the PDF beside the file; see `instructions render`.
