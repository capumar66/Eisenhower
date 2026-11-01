/**
 * dnd.js - Configurazione Drag & Drop tramite SortableJS
 */

export function setupDragAndDrop(onTaskMoved) {
  if (typeof Sortable === 'undefined') {
    console.error('SortableJS non caricato. Drag and Drop disabilitato.');
    return;
  }

  const containers = document.querySelectorAll('.task-list');

  containers.forEach(container => {
    new Sortable(container, {
      group: {
        name: 'eisenhower-tasks',
        pull: true,
        put: true
      },
      animation: 180,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      handle: '.task-card', // L'intera card è afferrabile
      filter: '.task-checkbox, .task-btn, .tag-pill',
      preventOnFilter: false,
      fallbackOnBody: true,
      swapThreshold: 0.65,

      onStart: (evt) => {
        evt.item.classList.add('is-dragging');
        document.body.classList.add('dragging-active');
      },

      onEnd: (evt) => {
        evt.item.classList.remove('is-dragging');
        document.body.classList.remove('dragging-active');

        const itemEl = evt.item;
        const taskId = itemEl.dataset.taskId;
        const toContainer = evt.to;
        const targetQuadrant = toContainer.dataset.quadrant;
        const newIndex = evt.newIndex;

        // Aggiorna la visibilità dei placeholder su entrambi i container
        updateContainerPlaceholders(evt.from);
        updateContainerPlaceholders(toContainer);

        if (taskId && targetQuadrant !== undefined) {
          onTaskMoved(taskId, targetQuadrant, newIndex);
        }
      }
    });

    // Controllo iniziale placeholder
    updateContainerPlaceholders(container);
  });
}

/**
 * Mostra o nasconde l'empty placeholder in base alla presenza di card
 */
export function updateContainerPlaceholders(container) {
  if (!container) return;
  const cards = container.querySelectorAll('.task-card');
  const placeholder = container.querySelector('.empty-placeholder');
  if (placeholder) {
    if (cards.length === 0) {
      placeholder.style.display = 'flex';
    } else {
      placeholder.style.display = 'none';
    }
  }
}
