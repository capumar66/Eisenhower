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
let serverConfigLoaded = false;
let envSupabaseUrl = null;
let envSupabaseKey = null;

async function waitForSupabaseSdk(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return true;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  try {
    const url = envSupabaseUrl || localStorage.getItem(SUPABASE_URL_KEY);
    const key = envSupabaseKey || localStorage.getItem(SUPABASE_ANON_KEY);
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
  async initSupabase() {
    if (!serverConfigLoaded) {
      try {
        const res = await fetch(`${API_BASE}/config?_t=${Date.now()}`);
        if (res.ok) {
          const cfg = await res.json();
          if (cfg && cfg.supabase_url && cfg.supabase_anon_key) {
            envSupabaseUrl = cfg.supabase_url.trim();
            envSupabaseKey = cfg.supabase_anon_key.trim();
          }
        }
      } catch (e) {
        console.warn('Impossibile recuperare config dal server:', e);
      }
      serverConfigLoaded = true;
    }
    await waitForSupabaseSdk();
    return getSupabase();
  },

  getServerConfigStatus() {
    const url = envSupabaseUrl || localStorage.getItem(SUPABASE_URL_KEY);
    const key = envSupabaseKey || localStorage.getItem(SUPABASE_ANON_KEY);
    return {
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
      isConfigured: Boolean(url && key),
      source: envSupabaseUrl ? 'Variabili d\'Ambiente Vercel' : (localStorage.getItem(SUPABASE_URL_KEY) ? 'Manuale Admin (LocalStorage)' : 'Nessuna'),
      urlPreview: url ? (url.length > 35 ? url.substring(0, 32) + '...' : url) : 'Non impostato'
    };
  },

  hasSupabase() {
    return !!getSupabase();
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
      let email = cleanUsername;

      if (!cleanUsername.includes('@')) {
        // Cerca l'email reale mappata per questo username
        const mappedEmail = this.getUserEmailMapping(cleanUsername);
        if (mappedEmail) {
          email = mappedEmail;
        } else {
          // Interroga l'endpoint helper per recuperare l'email reale dallo username
          try {
            const res = await fetch(`${API_BASE}/auth/resolve-email?username=${encodeURIComponent(cleanUsername)}`);
            if (res.ok) {
              const resData = await res.json();
              if (resData.email) email = resData.email;
            }
          } catch {}
          if (!email.includes('@')) {
            email = `${cleanUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@eisenhower.app`;
          }
        }
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        if (error.message && error.message.toLowerCase().includes('email not confirmed')) {
          throw new Error('Email non confermata su Supabase. Disattiva "Confirm email" nella dashboard di Supabase (Authentication > Providers > Email) oppure conferma l\'utente da Authentication > Users.');
        }
        throw new Error(error.message || 'Credenziali non valide su Supabase.');
      }

      const isAdminUser = ['admin', 'marco'].includes(cleanUsername.toLowerCase());
      const role = data.user.user_metadata?.role || (isAdminUser ? 'admin' : 'utente');
      const userObj = {
        id: data.user.id,
        username: data.user.user_metadata?.username || cleanUsername,
        email: data.user.email || email,
        display_name: data.user.user_metadata?.display_name || cleanUsername,
        role: role
      };

      this.setToken(data.session?.access_token || 'sb_active_session');
      this.setUser(userObj);
      this.recordUserInList(userObj);
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

  async register(username, password, displayName, email = null) {
    const sb = getSupabase();
    const cleanUsername = username.trim();
    const cleanEmail = (email && email.trim()) 
      ? email.trim() 
      : (cleanUsername.includes('@') ? cleanUsername : `${cleanUsername.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@eisenhower.app`);
    const cleanName = (displayName || cleanUsername).trim();

    if (sb) {
      const role = ['admin', 'marco'].includes(cleanUsername.toLowerCase()) ? 'admin' : 'utente';

      const { data, error } = await sb.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanName,
            role: role,
            email: cleanEmail
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
        email: cleanEmail,
        display_name: cleanName,
        role: role
      };

      // Se Supabase non richiede conferma email, la sessione è attiva subito
      if (data.session) {
        this.setToken(data.session.access_token);
      } else {
        // Token di sessione client
        this.setToken('sb_registered_' + data.user.id);
      }
      this.setUser(userObj);
      this.recordUserInList(userObj);
      localStorage.removeItem(STORAGE_KEY);
      return userObj;
    }

    // Fallback: API FastAPI Locale
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleanUsername,
        email: cleanEmail,
        password,
        display_name: cleanName
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Impossibile registrare il nuovo utente');
    }

    this.setToken(data.token);
    this.setUser(data.user);
    this.recordUserInList(data.user);
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
          const userMetaRole = data.session.user.user_metadata?.role;
          const uname = (data.session.user.user_metadata?.username || data.session.user.email?.split('@')[0] || '').toLowerCase();
          const role = userMetaRole || (['admin', 'marco'].includes(uname) ? 'admin' : 'utente');
          const userObj = {
            id: data.session.user.id,
            username: data.session.user.user_metadata?.username || data.session.user.email.split('@')[0],
            display_name: data.session.user.user_metadata?.display_name || data.session.user.email.split('@')[0],
            role: role
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
   * --- Gestione Amministrazione (Ruolo Admin) ---
   */
  getStoredUsersList() {
    try {
      const raw = localStorage.getItem('eisenhower_all_users');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveStoredUsersList(users) {
    try {
      localStorage.setItem('eisenhower_all_users', JSON.stringify(users));
    } catch (e) {
      console.warn('Errore salvataggio lista utenti:', e);
    }
  },

  recordUserInList(userObj) {
    if (!userObj || !userObj.username) return;
    const list = this.getStoredUsersList();
    const idx = list.findIndex(u => (userObj.id && u.id === userObj.id) || u.username.toLowerCase() === userObj.username.toLowerCase());
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...userObj };
    } else {
      list.push(userObj);
    }
    this.saveStoredUsersList(list);

    if (userObj.username && userObj.email) {
      this.recordUserEmailMapping(userObj.username, userObj.email);
    }
  },

  getUserEmailMapping(username) {
    try {
      const map = JSON.parse(localStorage.getItem('eisenhower_user_email_map') || '{}');
      return map[username.toLowerCase().trim()] || null;
    } catch {
      return null;
    }
  },

  recordUserEmailMapping(username, email) {
    if (!username || !email) return;
    try {
      const map = JSON.parse(localStorage.getItem('eisenhower_user_email_map') || '{}');
      map[username.toLowerCase().trim()] = email.toLowerCase().trim();
      localStorage.setItem('eisenhower_user_email_map', JSON.stringify(map));
    } catch (e) {
      console.warn('Errore salvataggio email map:', e);
    }
  },

  async getAdminUsers() {
    const curr = this.getUser();
    if (curr) {
      this.recordUserInList({
        id: curr.id,
        username: curr.username,
        email: curr.email || `${curr.username}@eisenhower.app`,
        display_name: curr.display_name,
        role: curr.role || 'admin',
        is_blocked: false,
        created_at: curr.created_at || new Date().toISOString()
      });
    }

    // 1. Prova a interrogare la tabella 'users' su Supabase se disponibile
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb.from('users').select('*');
        if (!error && Array.isArray(data)) {
          data.forEach(u => this.recordUserInList(u));
        }
      } catch (sbErr) {
        // Tabella users opzionale su Supabase
      }
    }

    // 2. Interroga il backend API (funziona sia in locale che con token Supabase JWT)
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        const apiUsers = await res.json();
        if (Array.isArray(apiUsers)) {
          apiUsers.forEach(u => this.recordUserInList(u));
        }
      }
    } catch (apiErr) {
      console.warn('Backend /admin/users non raggiungibile:', apiErr);
    }

    return this.getStoredUsersList();
  },

  async createAdminUser({ username, email, password, displayName, role }) {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (displayName || username).trim();
    const userRole = role || 'utente';

    const sb = getSupabase();
    const url = sb?.supabaseUrl || envSupabaseUrl || localStorage.getItem(SUPABASE_URL_KEY);
    const key = sb?.supabaseKey || envSupabaseKey || localStorage.getItem(SUPABASE_ANON_KEY);
    let sbCreated = false;
    let newUserId = null;

    // 1. Registra l'utente in Supabase Auth con l'EMAIL ESATTA digitata dall'amministratore
    if (url && key && window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        const tempClient = window.supabase.createClient(url.trim(), key.trim(), {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });
        const { data, error } = await tempClient.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              username: cleanUsername,
              display_name: cleanName,
              role: userRole,
              email: cleanEmail
            }
          }
        });

        let isAlreadyRegistered = false;
        if (error) {
          if (error.message && error.message.toLowerCase().includes('already registered')) {
            isAlreadyRegistered = true;
          } else {
            throw new Error(error.message || 'Errore creazione utente su Supabase');
          }
        } else if (data?.user?.identities && data.user.identities.length === 0) {
          isAlreadyRegistered = true;
        }

        if (isAlreadyRegistered) {
          sbCreated = true;
          newUserId = data?.user?.id || ('sb_' + btoa(cleanEmail).replace(/=/g, '').substring(0, 16));
        } else if (data?.user) {
          newUserId = data.user.id;
          sbCreated = true;
        }

        if (newUserId && sb) {
          try {
            await sb.from('users').upsert({
              id: newUserId,
              username: cleanUsername,
              email: cleanEmail,
              display_name: cleanName,
              role: userRole,
              is_blocked: false,
              created_at: data?.user?.created_at || new Date().toISOString()
            });
          } catch (tErr) {
            console.warn('Tabella users non disponibile su Supabase (profilo auth registrato):', tErr);
          }
        }
      } catch (sbErr) {
        console.warn('Errore creazione utente su Supabase Auth:', sbErr);
        throw sbErr;
      }
    }

    // 2. Sincronizzazione sul backend API
    let apiUser = null;
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          id: newUserId,
          username: cleanUsername,
          email: cleanEmail,
          password: password,
          display_name: cleanName,
          role: userRole
        })
      });
      if (res.ok) {
        apiUser = await res.json();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Errore creazione utente API' }));
        if (!sbCreated) {
          throw new Error(err.detail || 'Impossibile creare il nuovo utente');
        }
      }
    } catch (apiErr) {
      if (!sbCreated) throw apiErr;
    }

    const finalUser = apiUser || {
      id: newUserId || ('user_' + Date.now()),
      username: cleanUsername,
      email: cleanEmail,
      display_name: cleanName,
      role: userRole,
      is_blocked: false,
      created_at: new Date().toISOString(),
      task_count: 0
    };

    // 3. Salva l'utente nello store locale e registra il mapping username -> email
    this.recordUserInList(finalUser);
    return finalUser;
  },

  async updateUser(userId, { display_name, email, password, role }) {
    const sb = getSupabase();
    const curr = this.getUser();
    const isCurrent = curr && (curr.id === userId || curr.username === userId);
    const cleanEmail = email ? email.trim().toLowerCase() : undefined;
    const cleanName = display_name !== undefined ? display_name.trim() : undefined;

    // Recupera l'utente dallo store per preservarne sempre lo username
    const existingUser = this.getStoredUsersList().find(u => u.id === userId || u.username === userId) || {};
    const targetUsername = existingUser.username || (isCurrent ? curr.username : userId);
    let supabaseNotice = null;

    if (sb) {
      // 1. Aggiorna la tabella users su Supabase se disponibile
      try {
        await sb.from('users').upsert({
          id: userId,
          username: targetUsername,
          email: cleanEmail,
          display_name: cleanName || targetUsername,
          role: role || existingUser.role || 'utente'
        });
      } catch (tErr) {
        console.warn('Errore update tabella users Supabase:', tErr);
      }

      // 2. Se è l'utente corrente, aggiorna la sessione auth di Supabase (email + metadati)
      if (isCurrent) {
        try {
          const updateData = {
            data: {
              ...(curr.user_metadata || {}),
              display_name: cleanName,
              email: cleanEmail,
              username: targetUsername
            }
          };
          if (cleanEmail) updateData.email = cleanEmail;
          if (password) updateData.password = password;
          const { data: updateRes, error } = await sb.auth.updateUser(updateData);
          if (error) {
            console.warn('Errore sb.auth.updateUser:', error);
          } else if (updateRes?.user?.new_email && updateRes.user.new_email !== updateRes.user.email) {
            supabaseNotice = `Supabase richiede conferma: controlla la casella di posta ${updateRes.user.new_email} per confermare il cambio email.`;
          }
        } catch (err) {
          console.warn('Errore sync updateUser Supabase:', err);
        }
      }
    }

    // 3. Sincronizza con il backend API
    let updatedObj = null;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          display_name: cleanName,
          email: cleanEmail,
          password,
          role
        })
      });
      if (res.ok) {
        updatedObj = await res.json();
      }
    } catch (e) {
      console.warn('Errore API update user:', e);
    }

    const finalUser = {
      id: userId,
      username: targetUsername,
      display_name: cleanName || targetUsername,
      email: cleanEmail || existingUser.email,
      role: role || existingUser.role || 'utente',
      is_blocked: existingUser.is_blocked || false,
      created_at: existingUser.created_at || new Date().toISOString()
    };

    if (updatedObj) {
      Object.assign(finalUser, updatedObj);
    }

    if (isCurrent) {
      if (cleanName) curr.display_name = cleanName;
      if (cleanEmail) curr.email = cleanEmail;
      if (role) curr.role = role;
      this.setUser(curr);
    }

    // Salva sempre nello store degli utenti e aggiorna il mapping username -> email
    this.recordUserInList(finalUser);
    if (cleanEmail) {
      this.recordUserEmailMapping(targetUsername, cleanEmail);
    }

    return { ...finalUser, notice: supabaseNotice };
  },

  async toggleBlockUser(userId) {
    let result = null;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}/toggle-block`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        result = await res.json();
      }
    } catch (e) {
      console.warn('Errore API toggle block:', e);
    }

    const list = this.getStoredUsersList();
    const user = list.find(u => u.id === userId);
    if (user) {
      user.is_blocked = !user.is_blocked;
      this.saveStoredUsersList(list);
    }

    return result || { is_blocked: user ? user.is_blocked : false, detail: 'Stato aggiornato con successo.' };
  },

  async deleteUser(userId) {
    try {
      await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
    } catch (e) {
      console.warn('Errore API delete user:', e);
    }

    const list = this.getStoredUsersList().filter(u => u.id !== userId);
    this.saveStoredUsersList(list);
    return true;
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
