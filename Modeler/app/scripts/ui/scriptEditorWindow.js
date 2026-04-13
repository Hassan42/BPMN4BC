import hljs from 'highlight.js/lib/core';
import { solidity } from 'highlightjs-solidity';

hljs.registerLanguage('solidity', solidity);

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
    <div id="sol-header" style="
      cursor: move; padding: 8px 12px;
      background: #b1b1b1; color: #000;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #a0a0a0; user-select: none;
    ">
      <span style="font-weight: 600; font-size: 13px;">Solidity Script Editor${taskName ? ` — ${taskName}` : ''}</span>
      <span id="sol-close" style="cursor: pointer; padding: 2px 8px; border-radius: 3px; background: #d8d9d9; color: #333; font-size: 14px; line-height: 1;">✕</span>
    </div>
    <div style="position: relative; flex: 1; overflow: hidden; background: #fff;">
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
    <div style="
      padding: 8px 12px; background: #d8d9d9;
      border-top: 1px solid #b1b1b1;
      display: flex; justify-content: flex-end; gap: 8px;
    ">
      <button id="sol-cancel" style="
        padding: 5px 16px; border-radius: 4px; cursor: pointer;
        background: #d8d9d9; color: #333; border: 1px solid #b1b1b1; font-size: 12px;
      ">Cancel</button>
      <button id="sol-apply" style="
        padding: 5px 16px; border-radius: 4px; cursor: pointer;
        background: #555; color: #fff; border: none; font-size: 12px; font-weight: 600;
      ">Apply</button>
    </div>
  `;

  document.body.appendChild(win);

  const textarea = win.querySelector('#sol-textarea');
  const pre = win.querySelector('#sol-pre');

  const currentVal = getValue() || '';
  textarea.value = currentVal;
  pre.innerHTML = highlight(currentVal) + '\n';

  textarea.focus();

  textarea.addEventListener('input', () => {
    pre.innerHTML = highlight(textarea.value) + '\n';
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

  // Drag
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
