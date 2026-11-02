// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The page of the view "Front Matter" (docs/requirements.md, R-DOC-005). The extension sends the form of the front
// matter of a file in the message `form` (src/paper/frontMatterForm.ts), or null for no Markdown file; the page shows
// one row for each field of the layout and sends each change as the message `change` with the key and the new value,
// '' to remove the key. A text line sends its value when it loses the focus or with Enter, a choice list when the
// author chooses. The rows of `layout` and `repos` are read-only and name the command that changes them. While the
// author types in a row, a new form keeps the typed text of that row.
(function () {
  'use strict';
  // VS Code gives the function acquireVsCodeApi to the page of a webview.
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('form');

  /**
   * element makes an element with a class and a text.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   */
  function element(tag, className, text) {
    const made = document.createElement(tag);
    if (className) {
      made.className = className;
    }
    if (text !== undefined) {
      made.textContent = text;
    }
    return made;
  }

  /**
   * send sends a change of a key.
   * @param {string} key
   * @param {string} value
   */
  function send(key, value) {
    vscode.postMessage({ type: 'change', key, value });
  }

  /**
   * row makes a row with a label, a description, an input and a warning.
   * @param {string} key
   * @param {{ description?: string, required?: boolean, warning?: string }} field
   * @param {HTMLElement} input
   */
  function row(key, field, input) {
    const made = element('div', 'row');
    made.dataset.key = key;
    const label = element('label', 'label', key);
    if (field.required) {
      label.append(element('span', 'required', ' *'));
      label.title = 'The layout needs this field.';
    }
    if (input.id === '') {
      input.id = `field-${key}`;
    }
    label.htmlFor = input.id;
    made.append(label);
    if (field.description) {
      made.append(element('div', 'description', field.description));
    }
    made.append(input);
    if (field.warning) {
      made.append(element('div', 'warning', field.warning));
    }
    return made;
  }

  /**
   * textLine makes a text line that sends its value when it changes.
   * @param {string} key
   * @param {string} value
   * @param {string} placeholder
   * @param {boolean} disabled
   */
  function textLine(key, value, placeholder, disabled) {
    const input = /** @type {HTMLInputElement} */ (element('input', 'input'));
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.disabled = disabled;
    input.dataset.key = key;
    input.dataset.value = value;
    input.addEventListener('change', () => send(key, input.value.trim()));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        input.blur();
      } else if (event.key === 'Escape') {
        input.value = input.dataset.value || '';
        input.blur();
      }
    });
    return input;
  }

  /**
   * choiceList makes a choice list of the names of a parameter; the first entry is no value, which shows the default.
   * @param {string} key
   * @param {string} value
   * @param {string[]} values
   * @param {string} placeholder
   * @param {boolean} disabled
   */
  function choiceList(key, value, values, placeholder, disabled) {
    const select = /** @type {HTMLSelectElement} */ (element('select', 'input'));
    select.disabled = disabled;
    select.dataset.key = key;
    const names = values.includes(value) || value === '' ? values : [value, ...values];
    select.append(new Option(placeholder ? `${placeholder} (default)` : '', ''));
    for (const name of names) {
      select.append(new Option(name, name));
    }
    select.value = value;
    select.addEventListener('change', () => send(key, select.value));
    return select;
  }

  /**
   * readOnly makes the text of a value that the form does not change, with the way to change it.
   * @param {string} value
   * @param {string} hint
   */
  function readOnly(value, hint) {
    const made = element('div', 'read-only');
    made.append(element('code', 'value', value || '—'));
    made.append(element('div', 'description', hint));
    return made;
  }

  /**
   * render shows a form, and keeps the text and the place of the cursor of the text line that has the focus.
   * @param {any} form
   */
  function render(form) {
    const active = /** @type {HTMLInputElement | null} */ (document.activeElement && document.activeElement.matches('input[data-key]') ? document.activeElement : null);
    const typed = active ? { key: active.dataset.key, value: active.value, start: active.selectionStart, end: active.selectionEnd, from: active.dataset.value } : undefined;
    root.replaceChildren();
    if (!form) {
      root.append(element('p', 'hint', 'Open a Markdown file to see the fields of its front matter.'));
      return;
    }
    const locked = form.problems.length > 0;
    const head = element('div', 'head');
    head.append(element('div', 'file', form.file));
    head.append(element('div', 'description', form.layout ? `Layout: ${form.layoutName || form.layout}` : 'No field "layout": the fields of the built-in layout plain.'));
    root.append(head);
    for (const problem of form.problems) {
      root.append(element('div', 'problem', problem));
    }
    if (locked) {
      root.append(element('div', 'description', 'Change the front matter with Open File with Markup until the problem is solved.'));
    }

    const references = element('section', 'section');
    references.append(row('layout', { description: 'The layout of the paper.' }, readOnly(form.layout, 'mp create writes it.')));
    if (form.repos.length > 0) {
      const list = element('div', 'read-only');
      for (const entry of form.repos) {
        const line = element('div', 'repo');
        line.append(element('span', 'name', `${entry.name}: `), element('code', 'value', entry.reference));
        list.append(line);
      }
      list.append(element('div', 'description', 'mp get <owner>/<repository>@<rev> writes them.'));
      references.append(row('repos', { description: 'The repositories of the code of the listings.' }, list));
    }
    root.append(references);

    const fields = element('section', 'section');
    for (const field of form.fields) {
      let input;
      if (field.readOnly) {
        input = readOnly(field.value, 'Change it with Open File with Markup.');
      } else if (field.values) {
        input = choiceList(field.key, field.value, field.values, field.placeholder, locked);
      } else {
        input = textLine(field.key, field.value, field.placeholder, locked);
      }
      fields.append(row(field.key, field, input));
    }
    fields.append(row('lang', { description: 'The language of the paper, a tag such as de-AT or en-US.' }, textLine('lang', form.lang, form.language, locked)));
    root.append(fields);

    if (form.unknown.length > 0) {
      const unknown = element('section', 'section');
      unknown.append(element('div', 'section-title', 'Keys that the layout does not know'));
      for (const entry of form.unknown) {
        const value = element('div', 'read-only');
        value.append(element('code', 'value', entry.value || '—'));
        const remove = /** @type {HTMLButtonElement} */ (element('button', 'button', 'Remove'));
        remove.disabled = locked;
        remove.addEventListener('click', () => send(entry.key, ''));
        value.append(remove);
        unknown.append(row(entry.key, { warning: 'The layout does not use this key.' }, value));
      }
      root.append(unknown);
    }

    if (typed) {
      const again = /** @type {HTMLInputElement | null} */ (root.querySelector(`input[data-key="${CSS.escape(typed.key || '')}"]`));
      if (again && !again.disabled) {
        // A new value of the file wins over a text that the author did not change.
        if (typed.value !== typed.from) {
          again.value = typed.value;
        }
        again.focus();
        again.setSelectionRange(typed.start, typed.end);
      }
    }
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'form') {
      render(message.form);
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
