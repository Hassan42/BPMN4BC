export function createCollapsibleSection(title, contentElement) {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'border rounded mb-2';

    const header = document.createElement('button');
    header.className = 'w-full bg-gray-400 text-white p-2 text-left';
    header.innerText = title;
    header.onclick = () => toggleVisibility(contentElement);

    // contentElement.classList.add('hidden');

    sectionDiv.appendChild(header);
    sectionDiv.appendChild(contentElement);
    return sectionDiv;
}

function toggleVisibility(element) {
    element.classList.toggle('hidden');
}
