/**
 * storage.js - Gestione dello stato, persistenza LocalStorage e sincronizzazione API REST
 */

const STORAGE_KEY = 'eisenhower_tasks';
const THEME_KEY = 'eisenhower_theme';
const API_BASE = '/api';

export const TaskStorage = {
  /**
   * Recupera i task memorizzati in LocalStorage
   */
  getLocalTasks() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Errore lettura localStorage:', e);
      return null;
    }
  },

  /**
   * Salva i task in LocalStorage
   */
  setLocalTasks(tasks) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error('Errore salvataggio localStorage:', e);
    }
  },

  /**
   * Inizializzazione dati: LocalStorage prioritaria, fallback su API /api/tasks se vuoto
   */
  async initTasks() {
    const local = this.getLocalTasks();
    if (local && Array.isArray(local) && local.length > 0) {
      return local;
    }

    try {
      const res = await fetch(`${API_BASE}/tasks`);
      if (res.ok) {
        const remoteTasks = await res.json();
        this.setLocalTasks(remoteTasks);
        return remoteTasks;
      }
    } catch (err) {
      console.warn('API non raggiungibile, utilizzo fallback vuoto:', err);
    }

    return [];
  },

  /**
   * Crea una nuova attività
   */
  async createTask(taskData) {
    // 1. Aggiornamento ottimistico locale
    const tempId = 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const localTask = {
      id: tempId,
      title: taskData.title,
      description: taskData.description || '',
      quadrant: taskData.quadrant || 'inbox',
      completed: false,
      priority: taskData.priority || 'medium',
      due_date: taskData.due_date || null,
      tags: taskData.tags || [],
      order: 0,
      created_at: new Date().toISOString()
    };

    const currentTasks = this.getLocalTasks() || [];
    currentTasks.unshift(localTask);
    this.setLocalTasks(currentTasks);

    // 2. Chiamata API backend
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      if (res.ok) {
        const serverTask = await res.json();
        // Sostituisce il task temporaneo con quello validato dal server
        const updatedList = (this.getLocalTasks() || []).map(t => t.id === tempId ? serverTask : t);
        this.setLocalTasks(updatedList);
        return serverTask;
      }
    } catch (err) {
      console.warn('Sincronizzazione API in background non riuscita:', err);
    }

    return localTask;
  },

  /**
   * Aggiorna un'attività esistente
   */
  async updateTask(taskId, updates) {
    const currentTasks = this.getLocalTasks() || [];
    const index = currentTasks.findIndex(t => t.id === taskId);
    if (index === -1) return null;

    const updatedTask = { ...currentTasks[index], ...updates };
    currentTasks[index] = updatedTask;
    this.setLocalTasks(currentTasks);

    // Chiamata API
    try {
      await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (err) {
      console.warn('Errore sync update API:', err);
    }

    return updatedTask;
  },

  /**
   * Sposta un'attività (quadrante + ordine)
   */
  async moveTask(taskId, targetQuadrant, newOrder) {
    const currentTasks = this.getLocalTasks() || [];
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return null;

    task.quadrant = targetQuadrant;
    task.order = newOrder;
    this.setLocalTasks(currentTasks);

    try {
      await fetch(`${API_BASE}/tasks/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          target_quadrant: targetQuadrant,
          new_order: newOrder
        })
      });
    } catch (err) {
      console.warn('Errore sync move API:', err);
    }

    return task;
  },

  /**
   * Elimina un'attività
   */
  async deleteTask(taskId) {
    const currentTasks = (this.getLocalTasks() || []).filter(t => t.id !== taskId);
    this.setLocalTasks(currentTasks);

    try {
      await fetch(`${API_BASE}/tasks/${taskId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Errore sync delete API:', err);
    }

    return true;
  },

  /**
   * Ripristina i dati demo predefiniti
   */
  async resetDemo() {
    try {
      const res = await fetch(`${API_BASE}/tasks/reset-demo`, { method: 'POST' });
      if (res.ok) {
        const demoTasks = await res.json();
        this.setLocalTasks(demoTasks);
        return demoTasks;
      }
    } catch (err) {
      console.warn('Errore reset demo API:', err);
    }
    return this.getLocalTasks() || [];
  },

  /**
   * Esporta i task correnti come file JSON scaricabile
   */
  exportToJSON() {
    const tasks = this.getLocalTasks() || [];
    const jsonStr = JSON.stringify(tasks, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eisenhower_matrix_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Importa task da file JSON
   */
  async importFromJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!Array.isArray(parsed)) {
            throw new Error('Il file JSON deve contenere un array di attività');
          }
          this.setLocalTasks(parsed);
          // Sincronizza con API
          try {
            await fetch(`${API_BASE}/tasks/bulk-sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(parsed)
            });
          } catch (syncErr) {
            console.warn('Sync bulk non riuscita:', syncErr);
          }
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Errore nella lettura del file'));
      reader.readAsText(file);
    });
  },

  /**
   * Gestione Tema (Dark / Light)
   */
  getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  },

  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
  }
};
