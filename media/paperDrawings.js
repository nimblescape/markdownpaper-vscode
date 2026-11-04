// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The drawings of the Markdown extensions of VS Code on the pages (docs/requirements.md, R-REN-010), in the pages of the
// PDF and of the Markdown preview: whether a diagram still waits to be drawn, and the copies of the diagrams of
// nimblescape PlantUML. That extension draws the diagrams of a PlantUML block into the open shadow root of the element
// `.nimblescape-plantuml-content` of the block, and tells in its attribute `data-plantuml-state` whether they are drawn.
// A copy of an element has no shadow root, and Paged.js makes the pages from copies, so the pages get each block as an
// element `.nimblescape-paper-plantuml` with copies of its diagrams.
//
// In the page of the PDF, the script of the layout of nimblescape Markdown (`window.paperHandlers` of
// `@nimblescape/markdownlayout`) starts Paged.js when no drawing waits (docs/requirements.md, R-GEN-010). This script
// tells it that a diagram waits, at most 10 seconds after the page loaded; while nimblescape PlantUML renders, up to 65
// seconds after it drew its last block, since it gives up on a diagram after 60 seconds. Right before Paged.js makes
// the pages, the PlantUML blocks get the copies of their diagrams. The page preview in the Markdown preview of VS Code
// (paperPreview.js) uses the same functions through `window.paperDrawings`.
(function () {
  'use strict';

  /** The PlantUML blocks of nimblescape PlantUML, and the element in each that shows the diagrams. */
  const plantUmlBlock = '.nimblescape-plantuml[data-plantuml-source]';
  const plantUmlContent = ':scope > .nimblescape-plantuml-content';

  /** The state of the diagrams of a PlantUML block: `pending`, `drawn`, or null before the script of the extension ran. */
  function plantUmlState(block) {
    const content = block.querySelector(plantUmlContent);
    if (!content) {
      return 'drawn';
    }
    const state = content.getAttribute('data-plantuml-state');
    if (state !== null) {
      return state;
    }
    // A version of the extension before the attribute shows a note while it renders.
    const shadow = content.shadowRoot;
    return shadow ? (shadow.querySelector('[part~="pending"]') ? 'pending' : 'drawn') : null;
  }

  /**
   * Whether a diagram of a node waits to be drawn: of Mermaid without its SVG element or the message of its error, or a
   * PlantUML block.
   */
  function drawingsPending(root) {
    return Boolean(root.querySelector('.mermaid:not(:has(svg, .mermaid-error))')) || Array.from(root.querySelectorAll(plantUmlBlock)).some((block) => plantUmlState(block) !== 'drawn');
  }

  /** The number of the PlantUML blocks of a node whose diagrams are drawn, and whether the extension renders others. */
  function plantUmlProgress(root) {
    const states = Array.from(root.querySelectorAll(plantUmlBlock)).map(plantUmlState);
    return { drawn: states.filter((state) => state === 'drawn').length, rendering: states.includes('pending') };
  }

  /**
   * Gives each PlantUML block of a copy the diagrams of the same block of the original: the block becomes an element
   * `.nimblescape-paper-plantuml` with the attributes of the block, such as `data-line`, and copies of the elements of
   * the shadow root, the diagrams and the messages of errors. A block without its diagrams keeps its text. The original
   * and the copy can be the same node.
   */
  function copyPlantUml(original, copy) {
    const originals = Array.from(original.querySelectorAll(plantUmlBlock));
    const copies = Array.from(copy.querySelectorAll(plantUmlBlock));
    copies.forEach((block, index) => {
      const from = originals[index] || block;
      const page = block.ownerDocument;
      const element = page.createElement('div');
      for (const attribute of Array.from(block.attributes)) {
        if (!attribute.name.startsWith('data-plantuml-')) {
          element.setAttribute(attribute.name, attribute.value);
        }
      }
      element.classList.replace('nimblescape-plantuml', 'nimblescape-paper-plantuml');
      const content = from.querySelector(plantUmlContent);
      const text = content ? Array.from(content.childNodes) : [];
      const shown = content && content.shadowRoot && plantUmlState(from) === 'drawn' ? Array.from(content.shadowRoot.childNodes) : [];
      // The slot of the shadow root shows the text of the block below the message of an error.
      const nodes = shown.length > 0 ? shown.flatMap((node) => (node.nodeName === 'SLOT' ? text : [node])) : text;
      element.append(...nodes.map((node) => page.importNode(node, true)));
      block.replaceWith(element);
    });
    for (const files of Array.from(copy.querySelectorAll('.nimblescape-plantuml-page-includes'))) {
      files.remove();
    }
  }

  window.paperDrawings = { drawingsPending, plantUmlProgress, copyPlantUml };

  // The page of the PDF: the script of the layout waits for the drawings and copies the PlantUML diagrams.
  const layout = window.paperHandlers;
  if (layout && Array.isArray(layout.pending) && Array.isArray(layout.beforePages)) {
    let drawn = -1;
    let until = 0;
    layout.pending.push((root) => {
      const plantUml = plantUmlProgress(root);
      if (plantUml.rendering && plantUml.drawn !== drawn) {
        drawn = plantUml.drawn;
        until = Date.now() + 65000;
      }
      if (!drawingsPending(root)) {
        return false;
      }
      return plantUml.rendering && until > 0 ? until : true;
    });
    layout.beforePages.push((root) => copyPlantUml(root, root));
  }
})();
