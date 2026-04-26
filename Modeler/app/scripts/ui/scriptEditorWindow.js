import hljs from 'highlight.js/lib/core';
import { solidity } from 'highlightjs-solidity';
import { validateSoliditySnippet } from '../solidityValidator.js';

hljs.registerLanguage('solidity', solidity);

// ─── Custom script catalogue ──────────────────────────────────────────────────
// Each entry: { id, label, description, params[], build(values) → string }
// params[]: { id, label, placeholder }
const CUSTOM_SCRIPTS = [
  {
    id: 'transfer-eth',
    label: 'Transfer ETH',
    description: 'Send ETH from this contract to an address',
    params: [
      {
        id: 'recipient',
        label: 'To (address)',
        placeholder: 'e.g. addressOf["Buyer"]  or  0xAbCd…'
      },
      {
        id: 'amount',
        label: 'Amount (wei)',
        placeholder: 'e.g. msg.value  or  address(this).balance',
        helper: 'eth-wei-converter'
      }
    ],
    build: ({ recipient, amount }) =>
      `(bool success, ) = payable(${recipient}).call{value: ${amount}}("");\nrequire(success, "transfer failed");`
  },
  {
    id: 'burn-eth',
    label: 'Burn ETH',
    description: 'Permanently destroy ETH by sending to the zero address',
    params: [
      {
        id: 'amount',
        label: 'Amount (wei)',
        placeholder: 'e.g. msg.value  or  address(this).balance',
        helper: 'eth-wei-converter'
      }
    ],
    build: ({ amount }) =>
      `(bool success, ) = payable(address(0)).call{value: ${amount}}("");\nrequire(success, "ETH burn failed");`
  },
  {
    id: 'add-to-escrow',
    label: 'Add to Escrow',
    description: 'Register ETH in escrow for a participant address',
    params: [
      {
        id: 'participant',
        label: 'Participant (address)',
        placeholder: 'e.g. addressOf["Buyer"]  or  msg.sender'
      },
      {
        id: 'amount',
        label: 'Amount (wei)',
        placeholder: 'e.g. msg.value  or  1 ether',
        helper: 'eth-wei-converter'
      }
    ],
    build: ({ participant, amount }) =>
      `require(msg.value >= ${amount}, "Insufficient ETH sent for escrow");\nescrowOf[${participant}] += ${amount};`
  },
  {
    id: 'release-escrow',
    label: 'Release Escrow',
    description: 'Release escrowed ETH from one address to a recipient',
    params: [
      {
        id: 'from',
        label: 'From (address)',
        placeholder: 'e.g. addressOf["Buyer"]  or  msg.sender'
      },
      {
        id: 'to',
        label: 'To (address)',
        placeholder: 'e.g. addressOf["Seller"]  or  0xAbCd…'
      },
      {
        id: 'amount',
        label: 'Amount (wei)',
        placeholder: 'e.g. escrowOf[from]  or  1 ether',
        helper: 'eth-wei-converter'
      }
    ],
    build: ({ from, to, amount }) =>
      `require(escrowOf[${from}] >= ${amount}, "Insufficient escrow balance");\nescrowOf[${from}] -= ${amount};\n(bool success, ) = payable(${to}).call{value: ${amount}}("");\nrequire(success, "escrow release failed");`
  }
];
// ─────────────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('sol-hljs-styles')) return;
  const style = document.createElement('style');
  style.id = 'sol-hljs-styles';
  style.textContent = `
    #script-editor-window .sol-pre { color: #333; background: #fff; }
    #script-editor-window .sol-pre .hljs-keyword    { color: #0000cc; font-weight: bold; }
    #script-editor-window .sol-pre .hljs-string      { color: #a31515; }
    #script-editor-window .sol-pre .hljs-number      { color: #098658; }
    #script-editor-window .sol-pre .hljs-comment     { color: #008000; font-style: italic; }
    #script-editor-window .sol-pre .hljs-type        { color: #267f99; }
    #script-editor-window .sol-pre .hljs-built_in    { color: #0070c1; }
    #script-editor-window .sol-pre .hljs-title       { color: #795e26; }
    #script-editor-window .sol-pre .hljs-params      { color: #001080; }
    #script-editor-window .sol-pre .hljs-literal     { color: #0000ff; }
    #script-editor-window .sol-pre .hljs-variable    { color: #001080; }
    #script-editor-window .sol-pre .hljs-operator    { color: #333; }
    #script-editor-window .sol-pre .hljs-punctuation { color: #333; }
    #script-editor-window .sol-pre .hljs-attr        { color: #e65100; }

    /* param-form overlay */
    #sol-param-form {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 10;
    }
    #sol-param-form .pf-card {
      background: #fff; border: 1px solid #b1b1b1; border-radius: 6px;
      padding: 18px 20px; width: 340px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      font-family: sans-serif; font-size: 13px;
    }
    #sol-param-form .pf-title {
      font-weight: 700; font-size: 13px; margin-bottom: 14px; color: #222;
    }
    #sol-param-form .pf-field { margin-bottom: 12px; }
    #sol-param-form .pf-field label {
      display: block; font-size: 11px; font-weight: 600;
      color: #555; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em;
    }
    #sol-param-form .pf-field input {
      width: 100%; box-sizing: border-box;
      padding: 6px 8px; border: 1px solid #b1b1b1; border-radius: 4px;
      font-family: Consolas, 'Courier New', monospace; font-size: 12px;
      outline: none; color: #222;
    }
    #sol-param-form .pf-field input:focus { border-color: #555; }
    #sol-param-form .pf-actions {
      display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;
    }
    #sol-param-form .pf-cancel {
      padding: 5px 14px; border-radius: 4px; cursor: pointer;
      background: #d8d9d9; color: #333; border: 1px solid #b1b1b1; font-size: 12px;
    }
    #sol-param-form .pf-insert {
      padding: 5px 14px; border-radius: 4px; cursor: pointer;
      background: #555; color: #fff; border: none; font-size: 12px; font-weight: 600;
    }
    #sol-param-form .pf-insert:hover { background: #333; }

    /* ETH → Wei converter helper */
    #sol-param-form .pf-converter {
      display: flex; align-items: center; gap: 6px;
      margin-top: 5px; padding: 5px 8px;
      background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 4px;
      font-size: 11px; color: #555;
    }
    #sol-param-form .pf-converter label {
      font-size: 11px; font-weight: 600; color: #555;
      text-transform: none; letter-spacing: 0; margin: 0; white-space: nowrap;
    }
    #sol-param-form .pf-converter input[type="number"] {
      width: 80px; padding: 3px 6px;
      border: 1px solid #ccc; border-radius: 3px;
      font-size: 11px; font-family: Consolas, 'Courier New', monospace;
      outline: none;
    }
    #sol-param-form .pf-converter input[type="number"]:focus { border-color: #555; }
    #sol-param-form .pf-converter .pf-arrow { color: #aaa; font-size: 12px; }
    #sol-param-form .pf-converter .pf-wei-val {
      flex: 1; font-family: Consolas, 'Courier New', monospace;
      color: #222; background: #ececec; padding: 2px 6px;
      border-radius: 3px; font-size: 11px; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis;
    }
    #sol-param-form .pf-use-wei {
      padding: 3px 8px; border-radius: 3px; cursor: pointer;
      background: #d8d9d9; border: 1px solid #b1b1b1;
      font-size: 11px; color: #333; white-space: nowrap; flex-shrink: 0;
    }
    #sol-param-form .pf-use-wei:hover { background: #c4c4c4; }

    /* scripts dropdown */
    #sol-scripts-dropdown {
      position: absolute; bottom: 100%; left: 0;
      margin-bottom: 4px;
      background: #fff; border: 1px solid #b1b1b1; border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      min-width: 200px; z-index: 20;
      font-family: sans-serif; font-size: 12px;
    }
    #sol-scripts-dropdown .sd-item {
      padding: 8px 12px; cursor: pointer; color: #222;
      border-bottom: 1px solid #ebebeb;
    }
    #sol-scripts-dropdown .sd-item:last-child { border-bottom: none; }
    #sol-scripts-dropdown .sd-item:hover { background: #f0f0f0; }
    #sol-scripts-dropdown .sd-item-desc {
      font-size: 11px; color: #888; margin-top: 2px;
    }
  `;
  document.head.appendChild(style);
}

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(code) {
  try {
    return hljs.highlight(code || '', { language: 'solidity' }).value;
  } catch (_) {
    return escape(code || '');
  }
}

// ─── Param form ───────────────────────────────────────────────────────────────
function openParamForm(editorRoot, script, onInsert) {
  // Remove any existing form
  editorRoot.querySelector('#sol-param-form')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sol-param-form';

  const fieldsHtml = script.params.map(p => {
    const safePlaceholder = (p.placeholder || '').replace(/"/g, '&quot;');
    return `
    <div class="pf-field">
      <label for="pf-${p.id}">${p.label}</label>
      <input id="pf-${p.id}" type="text" placeholder="${safePlaceholder}" autocomplete="off" spellcheck="false" />
      ${p.helper === 'eth-wei-converter' ? `
        <div class="pf-converter">
          <label>ETH</label>
          <input id="pf-eth-input" type="number" placeholder="0.0" min="0" step="any" />
          <span class="pf-arrow">→</span>
          <span class="pf-wei-val" id="pf-wei-output">—</span>
          <button type="button" class="pf-use-wei" id="pf-use-wei">↑ Use</button>
        </div>
      ` : ''}
    </div>
  `; }).join('');

  overlay.innerHTML = `
    <div class="pf-card">
      <div class="pf-title">${script.label}</div>
      ${fieldsHtml}
      <div class="pf-actions">
        <button class="pf-cancel">Cancel</button>
        <button class="pf-insert">Insert</button>
      </div>
    </div>
  `;

  // The overlay must sit on top of the editor content area
  const editorArea = editorRoot.querySelector('#sol-editor-area');
  editorArea.appendChild(overlay);

  // Focus the first input
  overlay.querySelector('input')?.focus();

  // ── ETH → Wei converter (if present) ────────────────────────────────────
  const ethInput  = overlay.querySelector('#pf-eth-input');
  const weiOutput = overlay.querySelector('#pf-wei-output');
  const useWeiBtn = overlay.querySelector('#pf-use-wei');

  if (ethInput && weiOutput) {
    const ethToWei = (ethStr) => {
      const val = parseFloat(ethStr);
      if (isNaN(val) || val < 0) return null;
      // Use BigInt arithmetic to avoid floating-point precision loss
      // Split into integer and fractional parts
      const [intPart, fracPart = ''] = ethStr.replace(',', '.').split('.');
      const frac18 = (fracPart + '000000000000000000').slice(0, 18);
      try {
        return (BigInt(intPart) * BigInt('1000000000000000000') + BigInt(frac18)).toString();
      } catch (_) {
        return Math.round(val * 1e18).toString();
      }
    };

    ethInput.addEventListener('input', () => {
      const wei = ethToWei(ethInput.value);
      weiOutput.textContent = wei !== null ? `${wei} wei` : '—';
      weiOutput.title = wei !== null ? wei : '';
    });

    useWeiBtn.addEventListener('click', () => {
      const wei = ethToWei(ethInput.value);
      if (wei !== null) {
        const amountField = overlay.querySelector('#pf-amount');
        if (amountField) {
          amountField.value = wei;
          amountField.style.borderColor = '';
        }
      }
    });
  }

  overlay.querySelector('.pf-cancel').addEventListener('click', () => overlay.remove());

  overlay.querySelector('.pf-insert').addEventListener('click', () => {
    const values = {};
    let allFilled = true;
    script.params.forEach(p => {
      const val = overlay.querySelector(`#pf-${p.id}`)?.value.trim();
      if (!val) { allFilled = false; }
      values[p.id] = val || '';
    });
    if (!allFilled) {
      overlay.querySelectorAll('input').forEach(inp => {
        if (!inp.value.trim()) inp.style.borderColor = '#e53e3e';
      });
      return;
    }
    onInsert(script.build(values));
    overlay.remove();
  });

  // Enter key submits
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('.pf-insert').click();
    if (e.key === 'Escape') overlay.remove();
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function openScriptEditorWindow(getValue, setValue, taskName) {
  document.getElementById('script-editor-window')?.remove();
  injectStyles();

  const FONT = "Consolas, 'Courier New', monospace";
  const FONT_SIZE = '13px';
  const LINE_HEIGHT = '1.6';
  const PAD = '12px 14px';

  const win = document.createElement('div');
  win.id = 'script-editor-window';
  win.style.cssText = `
    position: fixed; top: 80px; left: 80px;
    width: 760px; height: 520px;
    background: #d8d9d9; border: 1px solid #b1b1b1;
    border-radius: 6px; overflow: hidden;
    font-family: sans-serif; font-size: 13px;
    display: flex; flex-direction: column;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    z-index: 9999;
  `;

  win.innerHTML = `
    <!-- Header (drag handle) -->
    <div id="sol-header" style="
      cursor: move; padding: 8px 12px;
      background: #b1b1b1; color: #000;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #a0a0a0; user-select: none; flex-shrink: 0;
    ">
      <span style="font-weight: 600; font-size: 13px;">Solidity Script Editor${taskName ? ` — ${taskName}` : ''}</span>
      <span id="sol-close" style="cursor: pointer; padding: 2px 8px; border-radius: 3px; background: #d8d9d9; color: #333; font-size: 14px; line-height: 1;">✕</span>
    </div>

    <!-- Editor area (relative — param form overlay anchors here) -->
    <div id="sol-editor-area" style="position: relative; flex: 1; overflow: hidden; background: #fff;">
      <pre id="sol-pre" aria-hidden="true" class="sol-pre" style="
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        margin: 0; padding: ${PAD};
        font-family: ${FONT}; font-size: ${FONT_SIZE}; line-height: ${LINE_HEIGHT};
        white-space: pre-wrap; word-wrap: break-word;
        overflow: hidden; pointer-events: none;
        box-sizing: border-box;
      "></pre>
      <textarea id="sol-textarea" spellcheck="false" autocomplete="off" autocorrect="off" style="
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        margin: 0; padding: ${PAD};
        font-family: ${FONT}; font-size: ${FONT_SIZE}; line-height: ${LINE_HEIGHT};
        white-space: pre-wrap; word-wrap: break-word;
        box-sizing: border-box; width: 100%; height: 100%;
        background: transparent; color: transparent; caret-color: #333;
        border: none; outline: none; resize: none;
        overflow: auto;
      "></textarea>
    </div>

    <!-- Syntax error bar (hidden until a validation error is found) -->
    <div id="sol-error-bar" style="
      display: none; flex-shrink: 0;
      padding: 5px 14px;
      background: #fff5f5; border-top: 1px solid #fca5a5;
      color: #dc2626; font-size: 11px;
      font-family: Consolas, 'Courier New', monospace;
    "></div>

    <!-- Footer toolbar -->
    <div style="
      padding: 8px 12px; background: #d8d9d9;
      border-top: 1px solid #b1b1b1;
      display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    ">
      <!-- Custom scripts dropdown trigger -->
      <div style="position: relative;">
        <button id="sol-scripts-btn" style="
          padding: 5px 12px; border-radius: 4px; cursor: pointer;
          background: #d8d9d9; color: #333; border: 1px solid #b1b1b1;
          font-size: 12px; font-weight: 600;
        ">Custom Scripts ▾</button>
        <div id="sol-scripts-dropdown" style="display: none;"></div>
      </div>

      <!-- Cancel / Apply -->
      <div style="display: flex; gap: 8px;">
        <button id="sol-cancel" style="
          padding: 5px 16px; border-radius: 4px; cursor: pointer;
          background: #d8d9d9; color: #333; border: 1px solid #b1b1b1; font-size: 12px;
        ">Cancel</button>
        <button id="sol-apply" style="
          padding: 5px 16px; border-radius: 4px; cursor: pointer;
          background: #555; color: #fff; border: none; font-size: 12px; font-weight: 600;
        ">Apply</button>
      </div>
    </div>
  `;

  document.body.appendChild(win);

  const textarea  = win.querySelector('#sol-textarea');
  const pre       = win.querySelector('#sol-pre');
  const dropdown  = win.querySelector('#sol-scripts-dropdown');
  const scriptsBtn = win.querySelector('#sol-scripts-btn');
  const errorBar  = win.querySelector('#sol-error-bar');
  const editorArea = win.querySelector('#sol-editor-area');

  // ── Syntax validation helper ─────────────────────────────────────────────
  function runValidation(code) {
    const err = validateSoliditySnippet(code);
    if (err) {
      editorArea.style.outline = '2px solid #dc2626';
      editorArea.style.outlineOffset = '-2px';
      errorBar.style.display = 'block';
      errorBar.textContent = err.line !== null
        ? `⚠  Line ${err.line}: ${err.message}`
        : `⚠  ${err.message}`;
    } else {
      editorArea.style.outline = '';
      errorBar.style.display = 'none';
    }
  }

  // ── Populate custom scripts dropdown ────────────────────────────────────────
  dropdown.innerHTML = CUSTOM_SCRIPTS.map(s => `
    <div class="sd-item" data-script-id="${s.id}">
      <div>${s.label}</div>
      <div class="sd-item-desc">${s.description}</div>
    </div>
  `).join('');

  // Toggle dropdown
  scriptsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const visible = dropdown.style.display !== 'none';
    dropdown.style.display = visible ? 'none' : 'block';
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => { dropdown.style.display = 'none'; }, { capture: false });

  // Script item click → open param form (or insert directly if no params)
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.sd-item');
    if (!item) return;
    dropdown.style.display = 'none';
    const script = CUSTOM_SCRIPTS.find(s => s.id === item.dataset.scriptId);
    if (!script) return;

    if (script.params && script.params.length > 0) {
      openParamForm(win, script, (code) => {
        textarea.value = code;
        pre.innerHTML = highlight(code) + '\n';
        runValidation(code);
        textarea.focus();
      });
    } else {
      const code = script.build({});
      textarea.value = code;
      pre.innerHTML = highlight(code) + '\n';
      runValidation(code);
      textarea.focus();
    }
  });

  // ── Editor sync ─────────────────────────────────────────────────────────────
  const currentVal = getValue() || '';
  textarea.value = currentVal;
  pre.innerHTML = highlight(currentVal) + '\n';
  textarea.focus();

  // Validate whatever is already in the field when the editor opens
  runValidation(currentVal);

  let validateTimer = null;
  textarea.addEventListener('input', () => {
    pre.innerHTML = highlight(textarea.value) + '\n';
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => runValidation(textarea.value), 500);
  });

  textarea.addEventListener('scroll', () => {
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
  });

  // Tab key inserts 4 spaces
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, s) + '    ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 4;
      pre.innerHTML = highlight(textarea.value) + '\n';
    }
  });

  win.querySelector('#sol-apply').addEventListener('click', () => {
    setValue(textarea.value);
    win.remove();
  });

  win.querySelector('#sol-cancel').addEventListener('click', () => win.remove());
  win.querySelector('#sol-close').addEventListener('click', () => win.remove());

  // ── Drag ────────────────────────────────────────────────────────────────────
  const header = win.querySelector('#sol-header');
  let isDragging = false, offsetX, offsetY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      win.style.left = `${e.clientX - offsetX}px`;
      win.style.top = `${e.clientY - offsetY}px`;
    }
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
}
