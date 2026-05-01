const TX_COLOR = '#6366f1';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTxBoundaryWindow(txData, { onSelect, onClear, onClose }) {
  const { transactions, hasBcElements } = txData;

  // ── Root window ───────────────────────────────────────────────────────────
  const floatingWindow = document.createElement('div');
  floatingWindow.id = 'tx-boundary-window';
  floatingWindow.className =
    'fixed top-16 left-16 w-[600px] bg-[#d8d9d9] border border-[#b1b1b1] rounded-md font-sans text-sm';
  floatingWindow.style.cssText +=
    'max-height:80vh; z-index:1000; display:flex; flex-direction:column; overflow:hidden;';

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.id = 'tx-boundary-window-header';
  header.className =
    'cursor-move px-3 py-2 bg-[#b1b1b1] text-black flex justify-between items-center border-b border-[#a0a0a0] flex-shrink-0';
  header.style.userSelect = 'none';
  header.innerHTML = `
    <span class="font-semibold">Transaction Boundaries</span>
    <div style="display:flex;gap:6px;align-items:center;">
      <span class="tx-clear cursor-pointer text-xs px-2 py-1 bg-gray-300 rounded-md hover:bg-gray-400">Clear</span>
      <span class="tx-close  cursor-pointer text-lg px-2 py-1 bg-gray-300 rounded-md hover:bg-gray-400">X</span>
    </div>
  `;

  // ── Scrollable content ────────────────────────────────────────────────────
  const content = document.createElement('div');
  content.className = 'p-3 bg-white';
  content.style.cssText = 'overflow-y:auto; flex:1 1 auto; min-height:0;';

  // Track which title row is currently selected
  let activeTitleRow = null;

  function setActive(titleRow) {
    if (activeTitleRow) activeTitleRow.style.borderLeftColor = 'transparent';
    activeTitleRow = titleRow;
    if (activeTitleRow) activeTitleRow.style.borderLeftColor = TX_COLOR;
  }

  if (!hasBcElements || transactions.length === 0) {
    content.innerHTML =
      '<p class="text-gray-400 text-sm text-center py-6">No blockchain elements found in the diagram.</p>';
  } else {
    transactions.forEach((tx) => {
      const section = document.createElement('div');
      section.style.marginBottom = '10px';

      // ── Title row ─────────────────────────────────────────────────────
      const titleRow = document.createElement('div');
      titleRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: #f3f4f6;
        border-left: 4px solid transparent;
        cursor: pointer;
        border-radius: 2px;
        user-select: none;
      `;

      // Toggle indicator — plain ASCII, no emoji
      const chevron = document.createElement('span');
      chevron.textContent = '+';
      chevron.style.cssText =
        'font-size:11px; font-weight:700; color:#9ca3af; flex-shrink:0; width:12px; display:inline-block; line-height:1;';

      const label = document.createElement('span');
      label.style.cssText = 'font-weight:600; font-size:13px;';
      label.textContent = tx.label;

      const count = document.createElement('span');
      count.style.cssText = 'font-size:11px; color:#6b7280; margin-left:auto;';
      count.textContent = `${tx.elementIds.length} element${tx.elementIds.length !== 1 ? 's' : ''}`;

      titleRow.appendChild(chevron);
      titleRow.appendChild(label);
      titleRow.appendChild(count);

      // ── Task table ────────────────────────────────────────────────────
      const table = document.createElement('table');
      table.style.cssText =
        'width:100%; border-collapse:collapse; font-size:12px; margin-top:2px; display:none;';
      table.innerHTML = `
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:4px 8px;color:#6b7280;font-weight:500;width:140px;">Type</th>
            <th style="text-align:left;padding:4px 8px;color:#6b7280;font-weight:500;">Name</th>
          </tr>
        </thead>
        <tbody>
          ${tx.tasks.length
            ? tx.tasks.map(t => `
                <tr style="border-top:1px solid #f3f4f6;">
                  <td style="padding:3px 8px;color:#9ca3af;font-family:monospace;">${escapeHtml(t.type)}</td>
                  <td style="padding:3px 8px;color:#374151;">${escapeHtml(t.name)}</td>
                </tr>`).join('')
            : `<tr><td colspan="2" style="padding:4px 8px;color:#9ca3af;font-style:italic;">No downstream tasks</td></tr>`
          }
        </tbody>
      `;

      // Chevron click: collapse/expand only
      chevron.addEventListener('click', e => {
        e.stopPropagation();
        const collapsed = table.style.display === 'none';
        table.style.display = collapsed ? 'table' : 'none';
        chevron.textContent = collapsed ? '-' : '+';
      });

      // Title row click: highlight on canvas + mark as active
      titleRow.addEventListener('click', () => {
        setActive(titleRow);
        onSelect(tx);
      });

      section.appendChild(titleRow);
      section.appendChild(table);
      content.appendChild(section);
    });
  }

  floatingWindow.appendChild(header);
  floatingWindow.appendChild(content);
  document.body.appendChild(floatingWindow);

  // ── Toolbar actions ───────────────────────────────────────────────────────
  header.querySelector('.tx-clear').addEventListener('click', e => {
    e.stopPropagation();
    setActive(null); // deselect border
    onClear();
  });

  header.querySelector('.tx-close').addEventListener('click', e => {
    e.stopPropagation();
    onClose();
    floatingWindow.remove();
  });

  // ── Drag ──────────────────────────────────────────────────────────────────
  let isDragging = false, offsetX = 0, offsetY = 0;

  header.addEventListener('mousedown', e => {
    if (e.target.classList.contains('tx-clear') || e.target.classList.contains('tx-close')) return;
    isDragging = true;
    offsetX = e.clientX - floatingWindow.offsetLeft;
    offsetY = e.clientY - floatingWindow.offsetTop;
  });

  document.addEventListener('mousemove', e => {
    if (isDragging) {
      floatingWindow.style.left = `${e.clientX - offsetX}px`;
      floatingWindow.style.top  = `${e.clientY - offsetY}px`;
    }
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
}
