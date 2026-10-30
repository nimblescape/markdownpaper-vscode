<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# CSL files of the bundle

The files of this folder come unchanged from the projects of the Citation
Style Language (CSL). The build puts them into the bundle of the extension and
of the npm package, where citeproc-js reads them
([R-CITE-003](../docs/requirements.md#r-cite-003)). Each file names its
authors and its license, the Creative Commons Attribution-ShareAlike 3.0
License; `THIRD-PARTY-NOTICES.md` names them too.

| File | What it is | Source | Updated |
| --- | --- | --- | --- |
| `apa.csl` | The built-in style `apa7`, "APA Style 7th edition" | <https://github.com/citation-style-language/styles/blob/master/apa.csl> | 2026-02-07 |
| `locales-de-AT.xml` | The German words of Austria, with "Jänner" | <https://github.com/citation-style-language/locales/blob/master/locales-de-AT.xml> | 2026-09-10 |
| `locales-de-DE.xml` | The German words of Germany | <https://github.com/citation-style-language/locales/blob/master/locales-de-DE.xml> | 2026-09-10 |
| `locales-en-US.xml` | The English words of the United States, the default | <https://github.com/citation-style-language/locales/blob/master/locales-en-US.xml> | 2026-01-10 |
| `locales-en-GB.xml` | The English words of the United Kingdom | <https://github.com/citation-style-language/locales/blob/master/locales-en-GB.xml> | 2026-01-10 |

To update a file, download it again from its source and run the tests: the
tests of `src/paper/csl.test.ts` show what the new file changes.
