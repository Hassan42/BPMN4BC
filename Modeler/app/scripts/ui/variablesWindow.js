export function renderVariablesWindow(ParametersArray) {

  const floatingWindow = document.createElement('div');
  floatingWindow.id = 'floating-window';
  floatingWindow.className = 'fixed top-16 left-16 w-[750px] h-[450px] bg-[#d8d9d9] border border-[#b1b1b1] rounded-md overflow-hidden font-sans text-sm';

  floatingWindow.innerHTML = `
    <div id="floating-window-header" class="cursor-move px-3 py-2 bg-[#b1b1b1] text-black flex justify-between items-center border-b border-[#a0a0a0]">
      <span class="font-semibold">Process Variables</span>
      <span class="close-btn cursor-pointer text-lg px-2 py-1 bg-gray-300 rounded-md hover:bg-gray-400">X</span>
    </div>
    <div id="floating-window-content" class="p-3 overflow-auto h-[380px] bg-white">
      <table class="w-full border-collapse">
        <thead class="bg-[#d8d9d9] border-b border-[#b1b1b1]">
          <tr>
            <th class="p-2 text-left border-r border-[#b1b1b1]">Name</th>
            <th class="p-2 text-left border-r border-[#b1b1b1]">Type</th>
            <th class="p-2 text-left border-r border-[#b1b1b1]">Initial Value</th>
            <th class="p-2 text-left border-r border-[#b1b1b1]">Scope</th>
            <th class="p-2 text-left border-r border-[#b1b1b1]">Source</th>
            <th class="p-2 text-left">I/O</th>
          </tr>
        </thead>
        <tbody>
          ${ParametersArray.map((param, index) => `
            <tr class="border-b border-[#b1b1b1] ${index % 2 === 0 ? 'bg-white' : 'bg-[#f1f1f1]'}">
              <td class="p-2 border-r border-[#b1b1b1]">${param.name}</td>
              <td class="p-2 border-r border-[#b1b1b1]">${param.type}</td>
              <td class="p-2 border-r border-[#b1b1b1]">${param.value}</td>
              <td class="p-2 border-r border-[#b1b1b1]">${param.transactional}</td>
              <td class="p-2 border-r border-[#b1b1b1]">${param.source}</td>
              <td class="p-2">${param.flow}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.body.appendChild(floatingWindow);

  const header = floatingWindow.querySelector('#floating-window-header');
  const closeBtn = floatingWindow.querySelector('.close-btn');

  closeBtn.addEventListener('click', () => {
    floatingWindow.remove();
  });

  let isDragging = false;
  let offsetX, offsetY;

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

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}
