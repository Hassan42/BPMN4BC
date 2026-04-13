export function renderVariablesWindow(data) {
  const { dataObjects, dataStores } = data;

  const floatingWindow = document.createElement('div');
  floatingWindow.id = 'floating-window';
  floatingWindow.className = 'fixed top-16 left-16 w-[820px] bg-[#d8d9d9] border border-[#b1b1b1] rounded-md overflow-hidden font-sans text-sm';
  floatingWindow.style.maxHeight = '80vh';

  const hasData = dataObjects.length > 0 || dataStores.length > 0;

  const doRows = dataObjects.map((item, i) => `
    <tr class="border-b border-[#b1b1b1] ${i % 2 === 0 ? 'bg-white' : 'bg-[#f1f1f1]'}">
      <td class="p-2 border-r border-[#b1b1b1] font-medium align-top">${item.name}</td>
      <td class="p-2 border-r border-[#b1b1b1] align-top">
        ${item.variables.length
          ? item.variables.map(v => `<div><span class="font-mono">${v.name}</span> : <span class="text-gray-500">${v.type || 'uint'}</span></div>`).join('')
          : '<span class="text-gray-400">—</span>'}
      </td>
      <td class="p-2 border-r border-[#b1b1b1] align-top">
        ${item.readers.length
          ? item.readers.map(r => `<div>${r}</div>`).join('')
          : '<span class="text-gray-400">—</span>'}
      </td>
      <td class="p-2 align-top">
        ${item.writers.length
          ? item.writers.map(w => `<div>${w}</div>`).join('')
          : '<span class="text-gray-400">—</span>'}
      </td>
    </tr>
  `).join('');

  const dsRows = dataStores.map((item, i) => `
    <tr class="border-b border-[#b1b1b1] ${i % 2 === 0 ? 'bg-white' : 'bg-[#f1f1f1]'}">
      <td class="p-2 border-r border-[#b1b1b1] font-medium align-top">${item.name}</td>
      <td class="p-2 border-r border-[#b1b1b1] align-top">
        ${item.variables.length
          ? item.variables.map(v => `<div><span class="font-mono">${v.name}</span> : <span class="text-gray-500">${v.type || 'uint'}</span></div>`).join('')
          : '<span class="text-gray-400">—</span>'}
      </td>
      <td class="p-2 border-r border-[#b1b1b1] align-top">
        ${item.readers.length
          ? item.readers.map(r => `<div>${r}</div>`).join('')
          : '<span class="text-gray-400">—</span>'}
      </td>
      <td class="p-2 align-top">
        ${item.writers.length
          ? item.writers.map(w => {
              const vars = w.vars.length ? ` <span class="text-gray-500 text-xs">(${w.vars.join(', ')})</span>` : '';
              return `<div>${w.task}${vars}</div>`;
            }).join('')
          : '<span class="text-gray-400">—</span>'}
      </td>
    </tr>
  `).join('');

  const doSection = dataObjects.length > 0 ? `
    <h3 class="font-semibold text-sm px-1 mb-1 mt-2">Data Objects</h3>
    <table class="w-full border-collapse mb-4 border border-[#b1b1b1]">
      <thead class="bg-[#d8d9d9]">
        <tr>
          <th class="p-2 text-left border-r border-[#b1b1b1] w-1/4">Name</th>
          <th class="p-2 text-left border-r border-[#b1b1b1] w-1/4">Variables</th>
          <th class="p-2 text-left border-r border-[#b1b1b1] w-1/4">Read by</th>
          <th class="p-2 text-left w-1/4">Written by</th>
        </tr>
      </thead>
      <tbody>${doRows}</tbody>
    </table>
  ` : '';

  const dsSection = dataStores.length > 0 ? `
    <h3 class="font-semibold text-sm px-1 mb-1 mt-2">Data Stores</h3>
    <table class="w-full border-collapse border border-[#b1b1b1]">
      <thead class="bg-[#d8d9d9]">
        <tr>
          <th class="p-2 text-left border-r border-[#b1b1b1] w-1/5">Name</th>
          <th class="p-2 text-left border-r border-[#b1b1b1] w-2/5">Variables</th>
          <th class="p-2 text-left border-r border-[#b1b1b1] w-1/5">Read by</th>
          <th class="p-2 text-left w-1/5">Written by</th>
        </tr>
      </thead>
      <tbody>${dsRows}</tbody>
    </table>
  ` : '';

  floatingWindow.innerHTML = `
    <div id="floating-window-header" class="cursor-move px-3 py-2 bg-[#b1b1b1] text-black flex justify-between items-center border-b border-[#a0a0a0]" style="user-select:none;">
      <span class="font-semibold">Process Variables</span>
      <span class="close-btn cursor-pointer text-lg px-2 py-1 bg-gray-300 rounded-md hover:bg-gray-400">X</span>
    </div>
    <div id="floating-window-content" class="p-3 overflow-auto bg-white" style="max-height: calc(80vh - 40px);">
      ${hasData
        ? doSection + dsSection
        : '<p class="text-gray-400 text-sm">No data objects or data stores found in the diagram.</p>'}
    </div>
  `;

  document.body.appendChild(floatingWindow);

  const header = floatingWindow.querySelector('#floating-window-header');
  const closeBtn = floatingWindow.querySelector('.close-btn');

  closeBtn.addEventListener('click', () => floatingWindow.remove());

  let isDragging = false, offsetX, offsetY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - floatingWindow.offsetLeft;
    offsetY = e.clientY - floatingWindow.offsetTop;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      floatingWindow.style.left = `${e.clientX - offsetX}px`;
      floatingWindow.style.top = `${e.clientY - offsetY}px`;
    }
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
}
