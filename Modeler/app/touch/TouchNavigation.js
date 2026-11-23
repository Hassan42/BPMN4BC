// Touch navigation for phones and tablets (diagram-js has no built-in touch support):
// one finger drags the view, two fingers pinch to zoom. A tap still reaches the
// modeler as a click, so elements can be selected and their properties opened.
const TAP_SLOP = 8; // px a finger may move before a touch counts as a drag

export default function TouchNavigation(canvas, eventBus) {
  // On small screens show the whole diagram after loading (it is usually drawn for a large monitor)
  eventBus.on('import.done', () => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      try { canvas.zoom('fit-viewport', 'auto'); } catch (_) { /* empty diagram */ }
    }
  });

  eventBus.on('canvas.init', () => {
    const container = canvas.getContainer();
    container.style.touchAction = 'none'; // no browser scrolling or page zoom on the canvas

    let last = null;    // { x, y } of the dragging finger
    let pinch = null;   // { distance, scale } at pinch start
    let moved = 0;

    const point = (touch) => {
      const rect = container.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midpoint = (a, b) => point({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });

    container.addEventListener('touchstart', (event) => {
      if (event.touches.length === 1) {
        last = point(event.touches[0]);
        moved = 0;
        pinch = null;
      } else if (event.touches.length === 2) {
        pinch = { distance: distance(event.touches[0], event.touches[1]), scale: canvas.zoom() };
        last = null;
      }
    }, { passive: true });

    container.addEventListener('touchmove', (event) => {
      if (pinch && event.touches.length === 2) {
        event.preventDefault();
        const ratio = distance(event.touches[0], event.touches[1]) / pinch.distance;
        const scale = Math.min(4, Math.max(0.2, pinch.scale * ratio));
        canvas.zoom(scale, midpoint(event.touches[0], event.touches[1]));
      } else if (last && event.touches.length === 1) {
        const now = point(event.touches[0]);
        const dx = now.x - last.x;
        const dy = now.y - last.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > TAP_SLOP) {
          event.preventDefault(); // a drag, not a tap: no synthetic click afterwards
          canvas.scroll({ dx, dy });
        }
        last = now;
      }
    }, { passive: false });

    const end = (event) => {
      if (event.touches.length === 0) { last = null; pinch = null; }
      else if (event.touches.length === 1) { last = point(event.touches[0]); pinch = null; moved = TAP_SLOP + 1; }
    };
    container.addEventListener('touchend', end, { passive: true });
    container.addEventListener('touchcancel', end, { passive: true });
  });
}

TouchNavigation.$inject = ['canvas', 'eventBus'];
