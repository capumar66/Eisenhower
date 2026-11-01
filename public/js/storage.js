/**
 * storage.js - Gestione dello stato, autenticazione utente e sincronizzazione API REST
 */

const STORAGE_KEY = 'eisenhower_tasks';
const THEME_KEY = 'eisenhower_theme';
const TOKEN_KEY = 'eisenhower_auth_token';
const USER_KEY = 'eisenhower_auth_user';
const API_BASE = '/api';

export const TaskStorage = {
  /**
   * --- Gestione Autenticazione ---
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  getUser() {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  getAuthHeaders() {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async login(username, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Impossibile effettuare il login');
    }

    this.setToken(data.token);
    this.setUser(data.user);
    // Pulisce cache locale per evitare sovrapposizioni tra utenti
    localStorage.removeItem(STORAGE_KEY);
    return data.user;
  },

  async register(username, password, displayName) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        display_name: displayName || username
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Impossibile registrare il nuovo utente');
    }

    this.setToken(data.token);
    this.setUser(data.user);
    localStorage.removeItem(STORAGE_KEY);
    return data.user;
  },

  async logout() {
    try {
      if (this.getToken()) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: this.getAuthHeaders()
        });
      }
    } catch (e) {
      console.warn('Errore logout backend:', e);
    } finally {
      this.setToken(null);
      this.setUser(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  async checkAuthStatus() {
    if (!this.getToken()) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const user = await res.json();
        this.setUser(user);
        return user;
      } else if (res.status === 401) {
        this.logout();
        return null;
      }
    } catch {
      // In caso di offline, mantieni utente salvato
      return this.getUser();
    }
    return null;
  },

  /**
   * --- Gestione Task Utente ---
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

  setLocalTasks(tasks) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error('Errore salvataggio localStorage:', e);
    }
  },

  async initTasks() {
    if (!this.isAuthenticated()) {
      return [];
    }

    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const remoteTasks = await res.json();
        this.setLocalTasks(remoteTasks);
        return remoteTasks;
      } else if (res.status === 401) {
        this.logout();
        return [];
      }
    } catch (err) {
      console.warn('API non raggiungibile, utilizzo fallback locale:', err);
    }

    return this.getLocalTasks() || [];
  },

  async createTask(taskData) {
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

    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(taskData)
      });
      if (res.ok) {
        const serverTask = await res.json();
        const updatedList = (this.getLocalTasks() || []).map(t => t.id === tempId ? serverTask : t);
        this.setLocalTasks(updatedList);
        return serverTask;
      }
    } catch (err) {
      console.warn('Sincronizzazione API in background non riuscita:', err);
    }

    return localTask;
  },

  async updateTask(taskId, updates) {
    const currentTasks = this.getLocalTasks() || [];
    const index = currentTasks.findIndex(t => t.id === taskId);
    if (index === -1) return null;

    const updatedTask = { ...currentTasks[index], ...updates };
    currentTasks[index] = updatedTask;
    this.setLocalTasks(currentTasks);

    try {
      await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(updates)
      });
    } catch (err) {
      console.warn('Errore sync update API:', err);
    }

    return updatedTask;
  },

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
        headers: this.getAuthHeaders(),
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

  async deleteTask(taskId) {
    const currentTasks = (this.getLocalTasks() || []).filter(t => t.id !== taskId);
    this.setLocalTasks(currentTasks);

    try {
      await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
    } catch (err) {
      console.warn('Errore sync delete API:', err);
    }

    return true;
  },

  exportToJSON() {
    const tasks = this.getLocalTasks() || [];
    const user = this.getUser();
    const username = user?.username || 'user';
    const jsonStr = JSON.stringify(tasks, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eisenhower_${username}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

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
          try {
            await fetch(`${API_BASE}/tasks/bulk-sync`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
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
   * --- Gestione Tema ---
   */
  getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  },

  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
  }
};
