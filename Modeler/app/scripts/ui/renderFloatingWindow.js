export function renderFloatingWindow(outputParametersArray) {
    console.log('test');
    const floatingWindow = document.createElement('div');
    floatingWindow.id = 'floating-window';
    floatingWindow.style.width = '700px'; 
    floatingWindow.style.height = '450px'; 
    floatingWindow.style.position = 'fixed';
    floatingWindow.style.top = '50px';
    floatingWindow.style.left = '50px';
    floatingWindow.style.background = 'white';
    floatingWindow.style.border = '1px solid #ccc';
    floatingWindow.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.1)';
    floatingWindow.style.borderRadius = '4px';
    floatingWindow.style.overflow = 'hidden';
    floatingWindow.style.fontFamily = "'Arial', sans-serif";

    floatingWindow.innerHTML = `
      <div id="floating-window-header" style="cursor: move; padding: 10px; background:rgb(193, 193, 193); color: black; display: flex; justify-content: space-between; border-bottom: 1px solid #ccc;">
        <span><b>Process Variables</b></span>
        <div>
          <span class="close-btn" style="cursor: pointer;">X</span>
        </div>
      </div>
      <div id="floating-window-content" style="padding: 10px; overflow: auto; height: 380px; background: #fafafa;">
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px; overflow: hidden;">
          <thead style="background: #f8f9fa; border-bottom: 2px solid #ccc;">
            <tr>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Name</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Type</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Initial Value</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Scope</th>
              <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Source</th>
            </tr>
          </thead>
          <tbody>
            ${outputParametersArray.map((param, index) => `
              <tr style="border-bottom: 1px solid #eee; background-color: ${index % 2 === 0 ? '#ffffff' : '#f2f2f2'};">
                <td style="padding: 8px; border-right: 1px solid #ddd;">${param.name}</td>
                <td style="padding: 8px; border-right: 1px solid #ddd;">${param.type}</td>
                <td style="padding: 8px; border-right: 1px solid #ddd;">${param.value}</td>
                <td style="padding: 8px; border-right: 1px solid #ddd;">${param.transactional}</td>
                <td style="padding: 8px;">${param.source}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.body.appendChild(floatingWindow);

    const header = floatingWindow.querySelector('#floating-window-header');
    const closeBtn = floatingWindow.querySelector('.close-btn');
    const content = floatingWindow.querySelector('#floating-window-content');



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
        floatingWindow.style.left = (e.clientX - offsetX) + 'px';
        floatingWindow.style.top = (e.clientY - offsetY) + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
}
