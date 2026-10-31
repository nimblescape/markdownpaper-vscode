// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * baseCss is the style sheet of the renderer before the style sheets of the layout
 * ([R-REN-008](../../docs/requirements.md#r-ren-008)): only the rules without which a part of the renderer does not work
 * in Paged.js. A footnote goes to the foot of its page with its number in the text, the generated lists show the page of
 * each entry, and the number of a line of a listing shows ([R-REN-011](../../docs/requirements.md#r-ren-011)). A link
 * has the color of the text without a mark, and a long address breaks at the end of a line
 * ([R-PDF-005](../../docs/requirements.md#r-pdf-005)). A layout changes the look of each of them with its own rules, and
 * decides whether a template is a page of its own.
 */
export const baseCss = `.footnote {
  float: footnote;
}
a {
  color: inherit;
  text-decoration: none;
}
.link-address {
  overflow-wrap: anywhere;
}
/* Paged.js sets the number of a footnote in the text with font-variant-position, which most fonts do not have. */
[data-footnote-call]::after {
  vertical-align: super;
  font-size: 65%;
  line-height: 0;
  font-variant-position: normal;
}
nav.contents a::after,
nav.list-of-figures a::after,
nav.list-of-tables a::after,
nav.list-of-listings a::after {
  content: target-counter(attr(href), page);
}
img {
  max-width: 100%;
}
/* The number of a line of a listing is an element without text, so that a copy of the code leaves it out. */
.line-number::before {
  content: attr(data-number);
}
`;
