// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The handlers of the renderer for Paged.js, in the pages of the PDF and of the Markdown preview:
//
// - The page numbers (docs/requirements.md, R-REN-013). Paged.js restarts the page numbers on the page of an element
//   with `counter-reset: page 1`, with a rule `counter-reset` on that page. Chrome no longer carries a counter that a
//   page resets on to the next pages, so they would count on from the pages before. After Paged.js has made a page,
//   the handler counts the pages as Paged.js does for `target-counter()` and gives each page its number with
//   `counter-set`, which the next pages keep.
// - The last line of a justified paragraph whose spaces shrink (R-REN-012). Word shrinks the spaces of a justified line to fit one more word or syllable; a
// layout does the same with a negative `word-spacing`: the browser breaks the lines with the narrow spaces and then
// widens the spaces of each full line to the width of the text. The last line of a paragraph is not justified, so it
// would keep the narrow spaces, which Word does not do. After Paged.js has made a page, the handler gives the last line
// of each such paragraph that ends on the page its natural spaces again, or narrows them only as far as the line needs
// to fit, and leaves the paragraph as it was when the change would add a line.
//
// And the drawings of the Markdown extensions of VS Code on the pages (R-REN-010): whether a diagram still waits to be
// drawn, and the copies of the diagrams of nimblescape PlantUML. That extension draws the diagrams of a PlantUML block
// into the open shadow root of the element `.nimblescape-plantuml-content` of the block, and tells in its attribute
// `data-plantuml-state` whether they are drawn. A copy of an element has no shadow root, and Paged.js makes the pages
// from copies, so the pages get each block as an element `.nimblescape-paper-plantuml` with copies of its diagrams.
(function () {
  'use strict';

  /** The text node after a text node within an element, or null. */
  function nextText(root, node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    walker.currentNode = node;
    return walker.nextNode();
  }

  /** Gives the last lines of the justified paragraphs with shrinking spaces of a page their natural spaces. */
  function naturalLastLines(page) {
    for (const block of page.querySelectorAll('p, li, dd, dt, td, th')) {
      const style = getComputedStyle(block);
      const shrink = parseFloat(style.wordSpacing);
      if (!(shrink < 0) || style.textAlign !== 'justify' || style.textAlignLast === 'justify' || block.hasAttribute('data-split-to')) {
        continue;
      }
      if (block.querySelector('p, div, ul, ol, table, blockquote, figure, pre')) {
        continue;
      }
      // The characters that show a glyph, in the order of the text.
      const glyphs = [];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let offset = 0; offset < node.data.length; offset++) {
          if (!/[\s­]/.test(node.data[offset])) {
            glyphs.push({ node, offset });
          }
        }
      }
      if (glyphs.length === 0) {
        continue;
      }
      const range = document.createRange();
      const rectOf = (glyph) => {
        range.setStart(glyph.node, glyph.offset);
        range.setEnd(glyph.node, glyph.offset + 1);
        return range.getBoundingClientRect();
      };
      const end = glyphs[glyphs.length - 1];
      const last = rectOf(end);
      // The first glyph of the last line: the first whose middle is below the top of the last glyph.
      let low = 0;
      let high = glyphs.length - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        const rect = rectOf(glyphs[middle]);
        if (rect.top + rect.height / 2 > last.top) {
          high = middle;
        } else {
          low = middle + 1;
        }
      }
      // The browser can place the first glyph after a soft hyphen at the end of the line before; the line starts after
      // a space or a soft hyphen, so the glyphs without one between them stay together.
      const gap = (before, after) => {
        range.setStart(before.node, before.offset + 1);
        range.setEnd(after.node, after.offset);
        return range.toString();
      };
      while (low > 0 && !/[\s\u00ad]/.test(gap(glyphs[low - 1], glyphs[low]))) {
        low--;
      }
      const first = glyphs[low];
      range.setStart(first.node, first.offset);
      range.setEnd(end.node, end.offset + 1);
      const spaces = (range.toString().match(/[  ]/g) || []).length;
      if (spaces === 0) {
        continue;
      }
      // The page can be scaled: the rectangles are on the screen, the word spacing is in CSS pixels.
      const box = block.getBoundingClientRect();
      const scale = block.offsetWidth > 0 ? box.width / block.offsetWidth : 1;
      const right = box.right - (parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth)) * scale;
      const room = (right - last.right) / scale;
      const spacing = Math.min(0, shrink + room / spaces - 0.05);
      // Each text node of the last line gets a span with the word spacing; the first is split at the line.
      const spans = [];
      for (let text = first.offset > 0 ? first.node.splitText(first.offset) : first.node; text; text = nextText(block, text)) {
        const span = document.createElement('span');
        span.className = 'paper-last-line';
        span.style.wordSpacing = `${spacing}px`;
        text.parentNode.insertBefore(span, text);
        span.appendChild(text);
        spans.push(span);
      }
      if (Math.abs(block.getBoundingClientRect().height - box.height) > 0.5) {
        for (const span of spans) {
          span.replaceWith(span.firstChild);
        }
        block.normalize();
      }
    }
  }

  /** The value of the counter `page` in a computed value of counter-reset or counter-increment, or undefined. */
  function pageValue(value) {
    const found = /(?:^|\s)page\s+(-?\d+)/.exec(value || '');
    return found ? Number(found[1]) : undefined;
  }

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

  let registered = false;

  window.paperHandlers = {
    naturalLastLines,
    drawingsPending,
    plantUmlProgress,
    copyPlantUml,
    /** Registers the handlers with Paged.js, once, when Paged.js is there. */
    register() {
      if (registered || !window.Paged || !window.Paged.Handler) {
        return;
      }
      registered = true;
      class PageNumbers extends window.Paged.Handler {
        constructor(chunker, polisher, caller) {
          super(chunker, polisher, caller);
          this.number = 0;
        }

        afterPageLayout(pageElement) {
          const style = getComputedStyle(pageElement);
          const reset = pageValue(style.counterReset);
          const increment = pageValue(style.counterIncrement);
          this.number = reset !== undefined ? reset + (increment || 0) : this.number + (increment === undefined ? 0 : increment);
          pageElement.style.counterSet = `page ${this.number}`;
        }
      }
      class LastLines extends window.Paged.Handler {
        finalizePage(page) {
          naturalLastLines(page);
        }
      }
      window.Paged.registerHandlers(PageNumbers, LastLines);
    },
  };
})();
