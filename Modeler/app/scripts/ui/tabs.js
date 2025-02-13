import { renderContract } from './renderer.js';

export function renderTabs(networks) {
  const tabsContainer = document.getElementById('tabsContainer');
  tabsContainer.innerHTML = '';

  Object.keys(networks).forEach(networkKey => {
    const tabButton = document.createElement('button');
    tabButton.className = 'px-4 py-2 rounded bg-gray-300';
    tabButton.innerText = networkKey;

    tabButton.onclick = () => renderContract(networks[networkKey], networkKey);
    tabsContainer.appendChild(tabButton);
  });

  const firstNetwork = Object.keys(networks)[0];
  renderContract(networks[firstNetwork], firstNetwork);
}