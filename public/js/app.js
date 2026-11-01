/**
 * app.js - Controller principale dell'interfaccia utente Eisenhower Matrix
 */

import { TaskStorage } from './storage.js';
import { setupDragAndDrop, updateAllPlaceholders } from './dnd.js';

class EisenhowerApp {
  constructor() {
    this.tasks = [];
    this.filterText = '';
    this.editingTaskId = null;

    this.initElements();
    this.initTheme();
    this.attachEvents();
    this.boot();
  }

  initElements() {
    // Containers
    this.containerInbox = document.querySelector('#list-inbox');
    this.containerQ1 = document.querySelector('#list-q1');
    this.containerQ2 = document.querySelector('#list-q2');
    this.containerQ3 = document.querySelector('#list-q3');
    this.containerQ4 = document.querySelector('#list-q4');

    // Badges
    this.countInbox = document.querySelector('#count-inbox');
    this.countQ1 = document.querySelector('#count-q1');
    this.countQ2 = document.querySelector('#count-q2');
    this.countQ3 = document.querySelector('#count-q3');
    this.countQ4 = document.querySelector('#count-q4');

    // Stats
    this.statText = document.querySelector('#stat-completed-text');
    this.statFill = document.querySelector('#stat-progress-fill');

    // Search
    this.searchInput = document.querySelector('#search-input');

    // Buttons
    this.btnNewTask = document.querySelector('#btn-new-task');
    this.btnExport = document.querySelector('#btn-export');
    this.btnImport = document.querySelector('#btn-import');
    this.fileInput = document.querySelector('#file-import-input');
    this.btnResetDemo = document.querySelector('#btn-reset-demo');
    this.btnThemeToggle = document.querySelector('#btn-theme-toggle');

    // Quick Add Form
    this.quickAddForm = document.querySelector('#quick-add-form');
    this.quickInput = document.querySelector('#quick-input');

    // Modal
    this.modalBackdrop = document.querySelector('#task-modal');
    this.modalTitle = document.querySelector('#modal-title');
    this.taskForm = document.querySelector('#task-form');
    this.formTitle = document.querySelector('#form-title');
    this.formDesc = document.querySelector('#form-desc');
    this.formQuadrant = document.querySelector('#form-quadrant');
    this.formPriority = document.querySelector('#form-priority');
    this.formDueDate = document.querySelector('#form-due-date');
    this.formTags = document.querySelector('#form-tags');
    this.modalCancelBtn = document.querySelector('#modal-cancel-btn');
    this.modalCloseBtn = document.querySelector('#modal-close-btn');

    // Toasts
    this.toastContainer = document.querySelector('#toast-container');
  }

  initTheme() {
    const savedTheme = TaskStorage.getTheme();
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  updateThemeIcon(theme) {
    if (!this.btnThemeToggle) return;
    this.btnThemeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    TaskStorage.setTheme(next);
    this.updateThemeIcon(next);
    this.showToast(`Tema ${next === 'dark' ? 'Scuro' : 'Chiaro'} attivato`);
  }

  async boot() {
    this.tasks = await TaskStorage.initTasks();
    this.render();
    setupDragAndDrop(this.handleTaskMoved.bind(this));
  }

  attachEvents() {
    // Theme
    this.btnThemeToggle?.addEventListener('click', () => this.toggleTheme());

    // Search
    this.searchInput?.addEventListener('input', (e) => {
      this.filterText = e.target.value.toLowerCase().trim();
      this.render();
    });

    // Quick Add (Inbox)
    this.quickAddForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = this.quickInput.value.trim();
      if (!val) return;
      this.quickInput.value = '';
      const newTask = await TaskStorage.createTask({
        title: val,
        quadrant: 'inbox',
        priority: 'medium'
      });
      this.tasks.unshift(newTask);
      this.render();
      this.showToast('Attività aggiunta all\'Inbox!');
    });

    // New Task Button (Modal)
    this.btnNewTask?.addEventListener('click', () => this.openTaskModal());

    // Modal close
    this.modalCancelBtn?.addEventListener('click', () => this.closeTaskModal());
    this.modalCloseBtn?.addEventListener('click', () => this.closeTaskModal());
    this.modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeTaskModal();
    });

    // Task Form Submit
    this.taskForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveTaskModal();
    });

    // Export / Import / Reset
    this.btnExport?.addEventListener('click', () => {
      TaskStorage.exportToJSON();
      this.showToast('Backup JSON esportato con successo');
    });

    this.btnImport?.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        this.tasks = await TaskStorage.importFromJSON(file);
        this.render();
        this.showToast('Attività importate con successo!');
      } catch (err) {
        alert('Errore importazione JSON: ' + err.message);
      }
      this.fileInput.value = '';
    });

    this.btnResetDemo?.addEventListener('click', async () => {
      if (confirm('Vuoi ripristinare le attività dimostrative iniziali?')) {
        this.tasks = await TaskStorage.resetDemo();
        this.render();
        this.showToast('Dati demo ripristinati');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalBackdrop.classList.contains('is-open')) {
        this.closeTaskModal();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Drag & Drop Handler
  // -------------------------------------------------------------------------
  async handleTaskMoved(taskId, targetQuadrant, newOrder) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const oldQuadrant = task.quadrant;
    task.quadrant = targetQuadrant;
    task.order = newOrder;

    // Riorganizza ordine locale
    const sameQuadrantTasks = this.tasks.filter(t => t.quadrant === targetQuadrant && t.id !== taskId);
    sameQuadrantTasks.splice(newOrder, 0, task);
    sameQuadrantTasks.forEach((t, idx) => t.order = idx);

    await TaskStorage.moveTask(taskId, targetQuadrant, newOrder);
    updateAllPlaceholders();
    this.updateStats();

    const quadrantNames = {
      inbox: 'Inbox',
      q1: 'Q1 (Fai Subito)',
      q2: 'Q2 (Pianifica)',
      q3: 'Q3 (Delega)',
      q4: 'Q4 (Elimina)'
    };

    if (oldQuadrant !== targetQuadrant) {
      this.showToast(`Spostata in ${quadrantNames[targetQuadrant] || targetQuadrant}`);
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  render() {
    const listMap = {
      inbox: this.containerInbox,
      q1: this.containerQ1,
      q2: this.containerQ2,
      q3: this.containerQ3,
      q4: this.containerQ4
    };

    // Pulisci i container
    Object.values(listMap).forEach(container => {
      if (!container) return;
      container.innerHTML = '';
    });

    const filtered = this.tasks.filter(t => {
      if (!this.filterText) return true;
      const titleMatch = t.title.toLowerCase().includes(this.filterText);
      const descMatch = (t.description || '').toLowerCase().includes(this.filterText);
      const tagMatch = (t.tags || []).some(tag => tag.toLowerCase().includes(this.filterText));
      return titleMatch || descMatch || tagMatch;
    });

    // Ordina e inserisce le card
    filtered.sort((a, b) => a.order - b.order).forEach(task => {
      const container = listMap[task.quadrant];
      if (container) {
        const cardEl = this.createTaskCardElement(task);
        container.appendChild(cardEl);
      }
    });

    // Aggiorna visibilità empty placeholder su tutti i contenitori
    updateAllPlaceholders();

    this.updateStats();
  }

  createTaskCardElement(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.completed ? 'is-completed' : ''}`;
    card.dataset.taskId = task.id;

    // Top row
    const topRow = document.createElement('div');
    topRow.className = 'task-top-row';

    // Checkbox
    const checkWrap = document.createElement('div');
    checkWrap.className = 'task-checkbox-wrapper';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = !!task.completed;
    checkbox.addEventListener('change', async (e) => {
      const isCompleted = e.target.checked;
      task.completed = isCompleted;
      card.classList.toggle('is-completed', isCompleted);
      await TaskStorage.updateTask(task.id, { completed: isCompleted });
      this.updateStats();
    });
    checkWrap.appendChild(checkbox);
    topRow.appendChild(checkWrap);

    // Content
    const content = document.createElement('div');
    content.className = 'task-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'task-title';
    titleEl.textContent = task.title;
    content.appendChild(titleEl);

    if (task.description) {
      const descEl = document.createElement('div');
      descEl.className = 'task-description';
      descEl.textContent = task.description;
      content.appendChild(descEl);
    }
    topRow.appendChild(content);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'task-btn';
    editBtn.title = 'Modifica';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openTaskModal(task);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'task-btn btn-delete';
    delBtn.title = 'Elimina';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Eliminare "${task.title}"?`)) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(async () => {
          this.tasks = this.tasks.filter(t => t.id !== task.id);
          await TaskStorage.deleteTask(task.id);
          this.render();
          this.showToast('Attività eliminata');
        }, 150);
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    topRow.appendChild(actions);

    card.appendChild(topRow);

    // Meta Row (Priority, Due Date, Tags)
    const metaRow = document.createElement('div');
    metaRow.className = 'task-meta-row';

    const tagsGroup = document.createElement('div');
    tagsGroup.className = 'task-tags-group';

    // Priority badge
    const pPill = document.createElement('span');
    pPill.className = `priority-pill priority-${task.priority || 'medium'}`;
    const pLabels = { high: 'Alta', medium: 'Media', low: 'Bassa' };
    pPill.textContent = pLabels[task.priority] || 'Media';
    tagsGroup.appendChild(pPill);

    // Tags
    if (task.tags && task.tags.length > 0) {
      task.tags.forEach(tag => {
        const tPill = document.createElement('span');
        tPill.className = 'tag-pill';
        tPill.textContent = `#${tag}`;
        tagsGroup.appendChild(tPill);
      });
    }
    metaRow.appendChild(tagsGroup);

    // Due date
    if (task.due_date) {
      const dateEl = document.createElement('span');
      dateEl.className = 'due-date-pill';
      const isUrgent = new Date(task.due_date) <= new Date();
      if (isUrgent) dateEl.classList.add('is-urgent');
      dateEl.textContent = `📅 ${task.due_date}`;
      metaRow.appendChild(dateEl);
    }

    card.appendChild(metaRow);
    return card;
  }

  updateStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    if (this.statText) this.statText.textContent = `${completed}/${total} (${percent}%)`;
    if (this.statFill) this.statFill.style.width = `${percent}%`;

    const counts = { inbox: 0, q1: 0, q2: 0, q3: 0, q4: 0 };
    this.tasks.forEach(t => {
      if (counts[t.quadrant] !== undefined) counts[t.quadrant]++;
    });

    if (this.countInbox) this.countInbox.textContent = counts.inbox;
    if (this.countQ1) this.countQ1.textContent = counts.q1;
    if (this.countQ2) this.countQ2.textContent = counts.q2;
    if (this.countQ3) this.countQ3.textContent = counts.q3;
    if (this.countQ4) this.countQ4.textContent = counts.q4;
  }

  // -------------------------------------------------------------------------
  // Modal Handlers
  // -------------------------------------------------------------------------
  openTaskModal(taskToEdit = null) {
    if (taskToEdit) {
      this.editingTaskId = taskToEdit.id;
      this.modalTitle.textContent = 'Modifica Attività';
      this.formTitle.value = taskToEdit.title;
      this.formDesc.value = taskToEdit.description || '';
      this.formQuadrant.value = taskToEdit.quadrant;
      this.formPriority.value = taskToEdit.priority || 'medium';
      this.formDueDate.value = taskToEdit.due_date || '';
      this.formTags.value = (taskToEdit.tags || []).join(', ');
    } else {
      this.editingTaskId = null;
      this.modalTitle.textContent = 'Nuova Attività';
      this.taskForm.reset();
      this.formQuadrant.value = 'inbox';
      this.formPriority.value = 'medium';
    }

    this.modalBackdrop.classList.add('is-open');
    setTimeout(() => this.formTitle.focus(), 100);
  }

  closeTaskModal() {
    this.modalBackdrop.classList.remove('is-open');
    this.editingTaskId = null;
  }

  async saveTaskModal() {
    const title = this.formTitle.value.trim();
    if (!title) return;

    const tags = this.formTags.value
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const taskData = {
      title,
      description: this.formDesc.value.trim(),
      quadrant: this.formQuadrant.value,
      priority: this.formPriority.value,
      due_date: this.formDueDate.value || null,
      tags
    };

    if (this.editingTaskId) {
      await TaskStorage.updateTask(this.editingTaskId, taskData);
      const index = this.tasks.findIndex(t => t.id === this.editingTaskId);
      if (index !== -1) {
        this.tasks[index] = { ...this.tasks[index], ...taskData };
      }
      this.showToast('Attività aggiornata!');
    } else {
      const created = await TaskStorage.createTask(taskData);
      this.tasks.unshift(created);
      this.showToast('Nuova attività creata!');
    }

    this.closeTaskModal();
    this.render();
  }

  // -------------------------------------------------------------------------
  // Toast Notifications
  // -------------------------------------------------------------------------
  showToast(message) {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }
}

// Inizializza l'applicazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
  new EisenhowerApp();
});
