/**
 * storage.js - Gestione dello stato, autenticazione utente e sincronizzazione (Dual Engine: Supabase Cloud o API REST)
 */

const STORAGE_KEY = 'eisenhower_tasks';
const THEME_KEY = 'eisenhower_theme';
const TOKEN_KEY = 'eisenhower_auth_token';
const USER_KEY = 'eisenhower_auth_user';
const SUPABASE_URL_KEY = 'eisenhower_supabase_url';
const SUPABASE_ANON_KEY = 'eisenhower_supabase_anon_key';
const API_BASE = '/api';

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  try {
    const url = localStorage.getItem(SUPABASE_URL_KEY);
    const key = localStorage.getItem(SUPABASE_ANON_KEY);
    if (url && key && window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(url.trim(), key.trim());
      return supabaseClient;
    }
  } catch (err) {
    console.warn('Impossibile inizializzare Supabase client:', err);
  }
  return null;
}

export const TaskStorage = {
  /**
   * --- Configurazione Supabase Cloud ---
   */
  hasSupabase() {
    return !!getSupabase();
  },

  getSupabaseConfig() {
    return {
      url: localStorage.getItem(SUPABASE_URL_KEY) || '',
      key: localStorage.getItem(SUPABASE_ANON_KEY) || ''
    };
  },

  setSupabaseConfig(url, key) {
    if (url && key) {
      localStorage.setItem(SUPABASE_URL_KEY, url.trim());
      localStorage.setItem(SUPABASE_ANON_KEY, key.trim());
      supabaseClient = null;
      getSupabase();
    } else {
      this.clearSupabaseConfig();
    }
  },

  clearSupabaseConfig() {
    localStorage.removeItem(SUPABASE_URL_KEY);
    localStorage.removeItem(SUPABASE_ANON_KEY);
    supabaseClient = null;
  },

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
    const sb = getSupabase();
    if (sb) {
      const cleanUsername = username.trim();
      const email = cleanUsername.includes('@') 
        ? cleanUsername 
        : `${cleanUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@eisenhower.app`;

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw new Error(error.message || 'Credenziali non valide su Supabase.');
      }

      const userObj = {
        id: data.user.id,
        username: data.user.user_metadata?.username || cleanUsername,
        display_name: data.user.user_metadata?.display_name || cleanUsername
      };

      this.setToken(data.session?.access_token || 'sb_active_session');
      this.setUser(userObj);
      localStorage.removeItem(STORAGE_KEY);
      return userObj;
    }

    // Fallback: API FastAPI Locale
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
    localStorage.removeItem(STORAGE_KEY);
    return data.user;
  },

  async register(username, password, displayName) {
    const sb = getSupabase();
    if (sb) {
      const cleanUsername = username.trim();
      const cleanName = (displayName || cleanUsername).trim();
      const email = cleanUsername.includes('@') 
        ? cleanUsername 
        : `${cleanUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@eisenhower.app`;

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanName
          }
        }
      });

      if (error) {
        throw new Error(error.message || 'Errore durante la registrazione su Supabase.');
      }

      if (!data.user) {
        throw new Error('Registrazione inviata. Verifica la configurazione Supabase Auth.');
      }

      const userObj = {
        id: data.user.id,
        username: cleanUsername,
        display_name: cleanName
      };

      // Se Supabase non richiede conferma email, la sessione è attiva subito
      if (data.session) {
        this.setToken(data.session.access_token);
      } else {
        // Token di sessione client
        this.setToken('sb_registered_' + data.user.id);
      }
      this.setUser(userObj);
      localStorage.removeItem(STORAGE_KEY);
      return userObj;
    }

    // Fallback: API FastAPI Locale
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
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch (e) {
        console.warn('Errore logout Supabase:', e);
      }
    } else {
      try {
        if (this.getToken()) {
          await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: this.getAuthHeaders()
          });
        }
      } catch (e) {
        console.warn('Errore logout backend:', e);
      }
    }

    this.setToken(null);
    this.setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  },

  async checkAuthStatus() {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data } = await sb.auth.getSession();
        if (data?.session?.user) {
          const userObj = {
            id: data.session.user.id,
            username: data.session.user.user_metadata?.username || data.session.user.email.split('@')[0],
            display_name: data.session.user.user_metadata?.display_name || data.session.user.email.split('@')[0]
          };
          this.setUser(userObj);
          this.setToken(data.session.access_token);
          return userObj;
        }
      } catch (err) {
        console.warn('Errore controllo sessione Supabase:', err);
      }
      return null;
    }

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
        await this.logout();
        return null;
      }
    } catch {
      // In caso di offline, mantieni utente salvato se presente
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

    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb.from('tasks').select('*').order('order_idx', { ascending: true });
        if (!error && Array.isArray(data)) {
          const mapped = data.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            quadrant: t.quadrant,
            completed: Boolean(t.completed),
            priority: t.priority || 'medium',
            due_date: t.due_date || null,
            tags: Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' ? JSON.parse(t.tags || '[]') : []),
            order: t.order_idx !== undefined ? t.order_idx : (t.order || 0),
            created_at: t.created_at || new Date().toISOString()
          }));
          this.setLocalTasks(mapped);
          return mapped;
        }
      } catch (sbErr) {
        console.warn('Errore fetch tasks Supabase:', sbErr);
      }
      return this.getLocalTasks() || [];
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
        await this.logout();
        return [];
      }
    } catch (err) {
      console.warn('API non raggiungibile, fallback locale:', err);
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

    const sb = getSupabase();
    if (sb) {
      const user = this.getUser();
      try {
        const record = {
          id: tempId,
          user_id: user?.id,
          title: taskData.title,
          description: taskData.description || '',
          quadrant: taskData.quadrant || 'inbox',
          completed: false,
          priority: taskData.priority || 'medium',
          due_date: taskData.due_date || null,
          tags: taskData.tags || [],
          order_idx: 0,
          created_at: localTask.created_at
        };
        await sb.from('tasks').insert(record);
      } catch (err) {
        console.warn('Errore sync create Supabase:', err);
      }
      return localTask;
    }

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
      console.warn('Sincronizzazione API backend non riuscita:', err);
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

    const sb = getSupabase();
    if (sb) {
      try {
        const sbPayload = { ...updates };
        if (updates.order !== undefined) {
          sbPayload.order_idx = updates.order;
          delete sbPayload.order;
        }
        await sb.from('tasks').update(sbPayload).eq('id', taskId);
      } catch (err) {
        console.warn('Errore sync update Supabase:', err);
      }
      return updatedTask;
    }

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

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('tasks').update({
          quadrant: targetQuadrant,
          order_idx: newOrder
        }).eq('id', taskId);
      } catch (err) {
        console.warn('Errore sync move Supabase:', err);
      }
      return task;
    }

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

    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('tasks').delete().eq('id', taskId);
      } catch (err) {
        console.warn('Errore sync delete Supabase:', err);
      }
      return true;
    }

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

          const sb = getSupabase();
          if (sb) {
            const user = this.getUser();
            for (const t of parsed) {
              await sb.from('tasks').upsert({
                id: t.id,
                user_id: user?.id,
                title: t.title,
                description: t.description || '',
                quadrant: t.quadrant,
                completed: Boolean(t.completed),
                priority: t.priority || 'medium',
                due_date: t.due_date || null,
                tags: t.tags || [],
                order_idx: t.order || 0
              });
            }
          } else {
            try {
              await fetch(`${API_BASE}/tasks/bulk-sync`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(parsed)
              });
            } catch (syncErr) {
              console.warn('Sync bulk non riuscita:', syncErr);
            }
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
