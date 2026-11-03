/**
 * app.js - Controller principale dell'interfaccia utente Eisenhower Matrix con Autenticazione Utente
 */

import { TaskStorage } from './storage.js?v=2.2';
import { setupDragAndDrop, updateAllPlaceholders } from './dnd.js';

class EisenhowerApp {
  constructor() {
    this.tasks = [];
    this.filterText = '';
    this.editingTaskId = null;
    this.currentUser = null;

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

    // Header Actions & Buttons
    this.btnNewTask = document.querySelector('#btn-new-task');
    this.btnOpenArchive = document.querySelector('#btn-open-archive');
    this.countArchiveBadge = document.querySelector('#count-archive-badge');
    this.btnExport = document.querySelector('#btn-export');
    this.btnImport = document.querySelector('#btn-import');
    this.fileInput = document.querySelector('#file-import-input');
    this.btnThemeToggle = document.querySelector('#btn-theme-toggle');

    // Archive Modal Elements
    this.archiveModal = document.querySelector('#archive-modal');
    this.archiveModalCloseBtn = document.querySelector('#archive-modal-close-btn');
    this.archiveModalCloseFooter = document.querySelector('#archive-modal-close-footer');
    this.archiveCountText = document.querySelector('#archive-count-text');
    this.archiveTasksContainer = document.querySelector('#archive-tasks-container');
    this.archiveEmptyPlaceholder = document.querySelector('#archive-empty-placeholder');

    // User Profile & Logout Elements
    this.btnOpenAuth = document.querySelector('#btn-open-auth');
    this.userSection = document.querySelector('#user-section');
    this.userProfileBadge = document.querySelector('#user-profile-badge');
    this.userDisplayName = document.querySelector('#user-display-name');
    this.userRoleBadge = document.querySelector('#user-role-badge');
    this.btnOpenAdmin = document.querySelector('#btn-open-admin');
    this.btnLogout = document.querySelector('#btn-logout');

    // Edit User Modal Elements
    this.editUserModal = document.querySelector('#edit-user-modal');
    this.editUserModalCloseBtn = document.querySelector('#edit-user-modal-close-btn');
    this.editUserCancelBtn = document.querySelector('#edit-user-cancel-btn');
    this.editUserForm = document.querySelector('#edit-user-form');
    this.editUserId = document.querySelector('#edit-user-id');
    this.editUserUsername = document.querySelector('#edit-user-username');
    this.editUserName = document.querySelector('#edit-user-name');
    this.editUserEmail = document.querySelector('#edit-user-email');
    this.editUserPassword = document.querySelector('#edit-user-password');
    this.editUserRole = document.querySelector('#edit-user-role');
    this.editUserRoleGroup = document.querySelector('#edit-user-role-group');
    this.editUserModalTitle = document.querySelector('#edit-user-modal-title');

    // Admin Modal Elements
    this.adminModal = document.querySelector('#admin-modal');
    this.adminModalCloseBtn = document.querySelector('#admin-modal-close-btn');
    this.adminModalCloseFooter = document.querySelector('#admin-modal-close-footer');
    this.adminDbBadge = document.querySelector('#admin-db-badge');
    this.adminVercelEnvStatus = document.querySelector('#admin-vercel-env-status');
    this.adminDbEngine = document.querySelector('#admin-db-engine');
    this.adminUsersTbody = document.querySelector('#admin-users-tbody');
    this.btnAdminRefreshUsers = document.querySelector('#btn-admin-refresh-users');
    this.btnAdminShowCreateForm = document.querySelector('#btn-admin-show-create-form');
    this.adminCreateUserCard = document.querySelector('#admin-create-user-card');
    this.btnAdminCloseCreateForm = document.querySelector('#btn-admin-close-create-form');
    this.adminCreateUserForm = document.querySelector('#admin-create-user-form');
    this.adminNewUsername = document.querySelector('#admin-new-username');
    this.adminNewEmail = document.querySelector('#admin-new-email');
    this.adminNewName = document.querySelector('#admin-new-name');
    this.adminNewPassword = document.querySelector('#admin-new-password');
    this.adminNewRole = document.querySelector('#admin-new-role');
    this.btnAdminCancelCreate = document.querySelector('#btn-admin-cancel-create');

    // Auth Modal Elements
    this.authModal = document.querySelector('#auth-modal');
    this.authModalCloseBtn = document.querySelector('#auth-modal-close-btn');
    this.tabLogin = document.querySelector('#tab-login');
    this.tabRegister = document.querySelector('#tab-register');
    this.formLogin = document.querySelector('#form-login');
    this.formRegister = document.querySelector('#form-register');
    this.authErrorBox = document.querySelector('#auth-error-box');

    this.loginUsername = document.querySelector('#login-username');
    this.loginPassword = document.querySelector('#login-password');

    this.registerUsername = document.querySelector('#register-username');
    this.registerEmail = document.querySelector('#register-email');
    this.registerName = document.querySelector('#register-name');
    this.registerPassword = document.querySelector('#register-password');
    this.registerPasswordConfirm = document.querySelector('#register-password-confirm');

    // Quick Add Form
    this.quickAddForm = document.querySelector('#quick-add-form');
    this.quickInput = document.querySelector('#quick-input');

    // Task Modal
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
    await TaskStorage.initSupabase();
    setupDragAndDrop(this.handleTaskMoved.bind(this));

    const user = await TaskStorage.checkAuthStatus();
    if (!user) {
      this.currentUser = null;
      this.updateUserUI(null);
      this.tasks = [];
      this.render();
      this.openAuthModal();
    } else {
      this.currentUser = user;
      this.updateUserUI(user);
      this.closeAuthModal();
      this.tasks = await TaskStorage.initTasks();
      this.render();
    }
  }

  // -------------------------------------------------------------------------
  // Auth UI & Handlers
  // -------------------------------------------------------------------------

  openAuthModal() {
    if (!this.authModal) return;
    // Se l'utente non è loggato, nascondi il pulsante di chiusura ✕
    if (this.authModalCloseBtn) {
      this.authModalCloseBtn.style.display = this.currentUser ? 'inline-flex' : 'none';
    }
    this.setAuthTab('login');
    this.hideAuthError();
    this.authModal.classList.add('is-open');
    setTimeout(() => this.loginUsername?.focus(), 100);
  }

  closeAuthModal() {
    if (!this.authModal) return;
    // CRITICO: Non consentire mai la chiusura della modale di autenticazione se l'utente non è loggato
    if (!this.currentUser) return;
    this.authModal.classList.remove('is-open');
    this.hideAuthError();
  }

  setAuthTab(tab) {
    this.hideAuthError();
    if (tab === 'register') {
      this.tabRegister?.classList.add('is-active');
      this.tabLogin?.classList.remove('is-active');
      if (this.formRegister) this.formRegister.style.display = 'flex';
      if (this.formLogin) this.formLogin.style.display = 'none';
      setTimeout(() => this.registerUsername?.focus(), 50);
    } else {
      this.tabLogin?.classList.add('is-active');
      this.tabRegister?.classList.remove('is-active');
      if (this.formLogin) this.formLogin.style.display = 'flex';
      if (this.formRegister) this.formRegister.style.display = 'none';
      setTimeout(() => this.loginUsername?.focus(), 50);
    }
  }

  showAuthError(message) {
    if (!this.authErrorBox) return;
    this.authErrorBox.textContent = message;
    this.authErrorBox.style.display = 'block';
  }

  hideAuthError() {
    if (!this.authErrorBox) return;
    this.authErrorBox.textContent = '';
    this.authErrorBox.style.display = 'none';
  }

  updateUserUI(user) {
    if (user) {
      if (this.btnOpenAuth) this.btnOpenAuth.style.display = 'none';
      if (this.userSection) this.userSection.style.display = 'flex';
      if (this.userDisplayName) {
        this.userDisplayName.textContent = user.display_name || user.username;
      }
      const isAdmin = user.role === 'admin';
      if (this.userRoleBadge) {
        this.userRoleBadge.textContent = isAdmin ? '👑 Admin' : '👤 Utente';
        this.userRoleBadge.className = `role-badge ${isAdmin ? 'role-admin' : 'role-utente'}`;
      }
      if (this.btnOpenAdmin) {
        this.btnOpenAdmin.style.display = isAdmin ? 'inline-flex' : 'none';
      }
    } else {
      if (this.btnOpenAuth) this.btnOpenAuth.style.display = 'inline-flex';
      if (this.userSection) this.userSection.style.display = 'none';
      if (this.userDisplayName) {
        this.userDisplayName.textContent = '';
      }
      if (this.btnOpenAdmin) {
        this.btnOpenAdmin.style.display = 'none';
      }
    }
  }

  // -------------------------------------------------------------------------
  // Admin UI & Handlers
  // -------------------------------------------------------------------------

  openAdminModal() {
    if (!this.adminModal) return;
    this.adminModal.classList.add('is-open');
    this.loadAdminData();
  }

  closeAdminModal() {
    if (!this.adminModal) return;
    this.adminModal.classList.remove('is-open');
  }

  async loadAdminData() {
    const isSupabase = TaskStorage.hasSupabase();
    const cfgStatus = TaskStorage.getServerConfigStatus();

    if (this.adminDbBadge) {
      this.adminDbBadge.textContent = isSupabase ? '⚡ Supabase Cloud Attivo' : '💻 Backend Locale Python';
      this.adminDbBadge.className = `badge-status ${isSupabase ? 'is-connected' : 'is-local'}`;
    }
    if (this.adminDbEngine) {
      this.adminDbEngine.textContent = isSupabase ? 'PostgreSQL (Supabase Cloud)' : 'SQLite (/tmp o locale)';
    }
    if (this.adminVercelEnvStatus) {
      if (cfgStatus.isConfigured) {
        this.adminVercelEnvStatus.innerHTML = `<span style="color: #34d399; font-weight: 600;">✅ ${cfgStatus.source} (${cfgStatus.urlPreview})</span>`;
      } else {
        this.adminVercelEnvStatus.innerHTML = `<span style="color: #f87171; font-weight: 600;">❌ Non rilevate (Verifica Vercel Settings e fai Redeploy)</span>`;
      }
    }

    if (!this.adminUsersTbody) return;
    this.adminUsersTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Caricamento utenti in corso...</td></tr>';

    try {
      const users = await TaskStorage.getAdminUsers();
      if (!users || users.length === 0) {
        this.adminUsersTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nessun utente trovato.</td></tr>';
        return;
      }

      this.adminUsersTbody.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        const isCurrent = this.currentUser && this.currentUser.id === u.id;
        const roleClass = u.role === 'admin' ? 'role-admin' : 'role-utente';
        const roleLabel = u.role === 'admin' ? '👑 Admin' : '👤 Utente';
        const isBlocked = Boolean(u.is_blocked);
        const statusBadge = isBlocked 
          ? '<span class="status-badge status-blocked">⛔ Bloccato</span>' 
          : '<span class="status-badge status-active">✅ Attivo</span>';

        const blockBtn = isBlocked
          ? `<button class="btn-unblock-user" data-uid="${u.id}" data-uname="${u.username}" title="Sblocca accesso utente">Sblocca</button>`
          : `<button class="btn-block-user" data-uid="${u.id}" data-uname="${u.username}" title="Blocca accesso utente">Blocca</button>`;

        const editBtn = `<button class="btn-edit-user" data-uid="${u.id}" data-uname="${u.username}" data-name="${u.display_name || ''}" data-email="${u.email || ''}" data-role="${u.role}" title="Modifica dati utente">✏️ Modifica</button>`;

        tr.innerHTML = `
          <td><strong>${u.username}</strong> ${isCurrent ? '<small style="color: #818cf8;">(Tu)</small>' : ''}</td>
          <td>${u.email || '-'}</td>
          <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
          <td>${statusBadge}</td>
          <td>${u.task_count ?? '-'}</td>
          <td>
            <div class="admin-actions-cell">
              ${editBtn}
              ${isCurrent ? '' : blockBtn}
              ${isCurrent ? '' : `<button class="btn-del-user" data-uid="${u.id}" data-uname="${u.username}" title="Elimina definitivamente">Elimina</button>`}
            </div>
          </td>
        `;
        this.adminUsersTbody.appendChild(tr);
      });

      // Event listener per modifica utente
      this.adminUsersTbody.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget;
          const uObj = {
            id: target.dataset.uid,
            username: target.dataset.uname,
            display_name: target.dataset.name,
            email: target.dataset.email,
            role: target.dataset.role
          };
          this.openEditUserModal(uObj);
        });
      });

      // Event listener per blocco/sblocco utente
      this.adminUsersTbody.querySelectorAll('.btn-block-user, .btn-unblock-user').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const uid = e.target.dataset.uid;
          const uname = e.target.dataset.uname;
          const isCurrentlyBlocked = e.target.classList.contains('btn-unblock-user');
          const actionText = isCurrentlyBlocked ? 'sbloccare' : 'bloccare';
          if (confirm(`Sei sicuro di voler ${actionText} l'accesso dell'utente "${uname}"?`)) {
            try {
              const res = await TaskStorage.toggleBlockUser(uid);
              this.showToast(res.detail || (isCurrentlyBlocked ? `Utente "${uname}" sbloccato.` : `Utente "${uname}" bloccato con disconnessione immediata.`));
              this.loadAdminData();
            } catch (err) {
              alert('Errore: ' + err.message);
            }
          }
        });
      });

      // Event listener per eliminazione utente
      this.adminUsersTbody.querySelectorAll('.btn-del-user').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const uid = e.target.dataset.uid;
          const uname = e.target.dataset.uname;
          if (confirm(`Sei sicuro di voler eliminare definitivamente l'utente "${uname}" e tutte le sue attività?`)) {
            try {
              await TaskStorage.deleteUser(uid);
              this.showToast(`Utente "${uname}" eliminato.`);
              this.loadAdminData();
            } catch (err) {
              alert('Errore: ' + err.message);
            }
          }
        });
      });

    } catch (err) {
      this.adminUsersTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #f87171;">${err.message || 'Errore caricamento utenti'}</td></tr>`;
    }
  }

  attachEvents() {
    // Theme
    this.btnThemeToggle?.addEventListener('click', () => this.toggleTheme());

    // Open Auth Modal button
    this.btnOpenAuth?.addEventListener('click', () => this.openAuthModal());

    // Archive Modal triggers
    this.btnOpenArchive?.addEventListener('click', () => this.openArchiveModal());
    this.archiveModalCloseBtn?.addEventListener('click', () => this.closeArchiveModal());
    this.archiveModalCloseFooter?.addEventListener('click', () => this.closeArchiveModal());
    this.archiveModal?.addEventListener('click', (e) => {
      if (e.target === this.archiveModal) this.closeArchiveModal();
    });

    // Admin Modal triggers
    this.btnOpenAdmin?.addEventListener('click', () => this.openAdminModal());
    this.adminModalCloseBtn?.addEventListener('click', () => this.closeAdminModal());
    this.adminModalCloseFooter?.addEventListener('click', () => this.closeAdminModal());
    this.btnAdminRefreshUsers?.addEventListener('click', () => this.loadAdminData());
    this.adminModal?.addEventListener('click', (e) => {
      if (e.target === this.adminModal) this.closeAdminModal();
    });

    // Mostra / Nascondi Form Creazione Utente Admin
    this.btnAdminShowCreateForm?.addEventListener('click', () => {
      if (this.adminCreateUserCard) {
        const isHidden = this.adminCreateUserCard.style.display === 'none' || !this.adminCreateUserCard.style.display;
        this.adminCreateUserCard.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          this.adminNewUsername?.focus();
        }
      }
    });

    const hideAdminCreateForm = () => {
      if (this.adminCreateUserCard) {
        this.adminCreateUserCard.style.display = 'none';
      }
      this.adminCreateUserForm?.reset();
    };

    this.btnAdminCloseCreateForm?.addEventListener('click', hideAdminCreateForm);
    this.btnAdminCancelCreate?.addEventListener('click', hideAdminCreateForm);

    // Submit Form Creazione Utente Admin
    this.adminCreateUserForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = this.adminNewUsername.value.trim();
      const email = this.adminNewEmail.value.trim();
      const displayName = this.adminNewName.value.trim();
      const password = this.adminNewPassword.value;
      const role = this.adminNewRole.value;

      if (!username || !email || !password) {
        alert('Compila tutti i campi obbligatori (Username, Email, Password).');
        return;
      }

      const submitBtn = this.adminCreateUserForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creazione...';
      }

      try {
        await TaskStorage.createAdminUser({
          username,
          email,
          displayName,
          password,
          role
        });
        this.showToast(`Utente "${username}" salvato con successo!`);
        hideAdminCreateForm();
        await this.loadAdminData();
      } catch (err) {
        alert('Errore creazione utente: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });

    // Close Auth Modal
    this.authModalCloseBtn?.addEventListener('click', () => {
      if (this.currentUser) this.closeAuthModal();
    });
    this.authModal?.addEventListener('click', (e) => {
      if (e.target === this.authModal) {
        if (!this.currentUser) return; // Non chiudere se non autenticato
        this.closeAuthModal();
      }
    });

    // User Profile Trigger (apre form modifica utente corrente)
    this.userProfileBadge?.addEventListener('click', () => {
      if (this.currentUser) {
        this.openEditUserModal(this.currentUser);
      }
    });

    // Edit User Modal Triggers
    this.editUserModalCloseBtn?.addEventListener('click', () => this.closeEditUserModal());
    this.editUserCancelBtn?.addEventListener('click', () => this.closeEditUserModal());
    this.editUserModal?.addEventListener('click', (e) => {
      if (e.target === this.editUserModal) this.closeEditUserModal();
    });

    // Submit Modifica Utente Form
    this.editUserForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = this.editUserId.value;
      const displayName = this.editUserName.value.trim();
      const email = this.editUserEmail.value.trim();
      const password = this.editUserPassword.value;
      const role = this.editUserRole?.value;

      if (!email || !email.includes('@')) {
        alert('Inserisci un indirizzo email valido.');
        return;
      }
      if (password && password.length < 6) {
        alert('La nuova password deve contenere almeno 6 caratteri.');
        return;
      }

      const submitBtn = this.editUserForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvataggio...';
      }

      try {
        const payload = { display_name: displayName, email };
        if (password) payload.password = password;
        if (role) payload.role = role;

        const updated = await TaskStorage.updateUser(userId, payload);
        const isCurrent = this.currentUser && (this.currentUser.id === userId || this.currentUser.username === userId);
        if (isCurrent) {
          this.currentUser.display_name = updated.display_name || displayName;
          this.currentUser.email = updated.email || email;
          this.updateUserUI(this.currentUser);
        }
        this.showToast('Dati utente aggiornati con successo!');
        this.closeEditUserModal();
        if (this.adminModal?.classList.contains('is-open')) {
          this.loadAdminData();
        }
      } catch (err) {
        alert('Errore aggiornamento utente: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });

    // Auth Tabs
    this.tabLogin?.addEventListener('click', () => this.setAuthTab('login'));
    this.tabRegister?.addEventListener('click', () => this.setAuthTab('register'));

    // Navigazione fluida tasto Invio nei campi di registrazione (previene submit accidentali)
    this.registerUsername?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.registerEmail?.focus();
      }
    });
    this.registerEmail?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.registerName?.focus();
      }
    });
    this.registerName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.registerPassword?.focus();
      }
    });
    this.registerPassword?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.registerPasswordConfirm?.focus();
      }
    });

    // Form Login Submit
    this.formLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.hideAuthError();

      const username = this.loginUsername.value.trim();
      const password = this.loginPassword.value;

      if (!username || !password) {
        this.showAuthError('Inserisci sia nome utente/email che password.');
        return;
      }

      const submitBtn = this.formLogin.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Accesso in corso...';
      }

      try {
        const user = await TaskStorage.login(username, password);
        this.currentUser = user;
        this.updateUserUI(user);
        this.closeAuthModal();
        this.formLogin.reset();
        this.tasks = await TaskStorage.initTasks();
        this.render();
        this.showToast(`Benvenuto, ${user.display_name || user.username}!`);
      } catch (err) {
        this.showAuthError(err.message || 'Errore durante il login.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });

    // Form Register Submit
    this.formRegister?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.hideAuthError();

      const username = this.registerUsername.value.trim();
      const email = this.registerEmail ? this.registerEmail.value.trim() : '';
      const displayName = this.registerName.value.trim();
      const password = this.registerPassword.value;
      const confirmPassword = this.registerPasswordConfirm.value;

      if (username.length < 3) {
        this.showAuthError('Il nome utente deve contenere almeno 3 caratteri.');
        return;
      }

      if (!email || !email.includes('@')) {
        this.showAuthError('Inserisci un indirizzo email valido.');
        return;
      }

      if (password.length < 6) {
        this.showAuthError('La password deve contenere almeno 6 caratteri.');
        return;
      }

      if (password !== confirmPassword) {
        this.showAuthError('Le password non coincidono. Riprova.');
        return;
      }

      const submitBtn = this.formRegister.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registrazione in corso...';
      }

      try {
        const user = await TaskStorage.register(username, password, displayName, email);
        this.currentUser = user;
        this.updateUserUI(user);
        this.closeAuthModal();
        this.formRegister.reset();
        this.tasks = []; // Nuovo utente inizia con la propria lavagna pulita
        this.render();
        this.showToast(`Account creato con successo! Benvenuto, ${user.display_name || user.username}!`);
      } catch (err) {
        this.showAuthError(err.message || 'Errore durante la registrazione.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });

    // Logout
    this.btnLogout?.addEventListener('click', async () => {
      if (confirm('Sei sicuro di voler uscire?')) {
        await TaskStorage.logout();
        this.currentUser = null;
        this.updateUserUI(null);
        this.tasks = [];
        this.render();
        this.openAuthModal();
        this.showToast('Disconnessione effettuata.');
      }
    });

    // Search
    this.searchInput?.addEventListener('input', (e) => {
      this.filterText = e.target.value.toLowerCase().trim();
      this.render();
    });

    // Quick Add (Inbox)
    this.quickAddForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.currentUser) {
        this.openAuthModal();
        return;
      }
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
    this.btnNewTask?.addEventListener('click', () => {
      if (!this.currentUser) {
        this.openAuthModal();
        return;
      }
      this.openTaskModal();
    });

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

    // Export / Import
    this.btnExport?.addEventListener('click', () => {
      if (!this.currentUser) {
        this.openAuthModal();
        return;
      }
      TaskStorage.exportToJSON();
      this.showToast('Backup JSON esportato con successo');
    });

    this.btnImport?.addEventListener('click', () => {
      if (!this.currentUser) {
        this.openAuthModal();
        return;
      }
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

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.editUserModal?.classList.contains('is-open')) {
          this.closeEditUserModal();
          return;
        }
        if (this.archiveModal?.classList.contains('is-open')) {
          this.closeArchiveModal();
          return;
        }
        if (this.adminModal?.classList.contains('is-open')) {
          this.closeAdminModal();
          return;
        }
        if (this.modalBackdrop?.classList.contains('is-open')) {
          this.closeTaskModal();
          return;
        }
        if (this.authModal?.classList.contains('is-open')) {
          if (this.currentUser) {
            this.closeAuthModal();
          }
        }
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

    // Mostra solo le attività attive nella matrice (le svolte vanno nella coda nascosta)
    const activeTasks = this.tasks.filter(t => !t.completed);

    const filtered = activeTasks.filter(t => {
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

    const checkWrapper = document.createElement('div');
    checkWrapper.className = 'task-check-wrapper';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.completed;
    checkbox.title = 'Segna come completata (sposta in archivio)';
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        card.classList.add('is-completing');
        setTimeout(async () => {
          task.completed = true;
          await TaskStorage.updateTask(task.id, { completed: true });
          this.render();
          this.showToast('Attività svolta e archiviata! 📦');
        }, 220);
      }
    });

    const titleEl = document.createElement('span');
    titleEl.className = 'task-title';
    titleEl.textContent = task.title;

    checkWrapper.appendChild(checkbox);
    checkWrapper.appendChild(titleEl);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'task-btn';
    editBtn.title = 'Modifica';
    editBtn.innerHTML = '✏️';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openTaskModal(task);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'task-btn task-btn-del';
    delBtn.title = 'Elimina';
    delBtn.innerHTML = '🗑️';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Eliminare l'attività "${task.title}"?`)) {
        await TaskStorage.deleteTask(task.id);
        this.tasks = this.tasks.filter(t => t.id !== task.id);
        this.render();
        this.showToast('Attività eliminata');
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    topRow.appendChild(checkWrapper);
    topRow.appendChild(actions);
    card.appendChild(topRow);

    // Description (se presente)
    if (task.description) {
      const descEl = document.createElement('p');
      descEl.className = 'task-description';
      descEl.textContent = task.description;
      card.appendChild(descEl);
    }

    // Meta row (Priorità, Scadenza, Tags)
    const metaRow = document.createElement('div');
    metaRow.className = 'task-meta';

    // Priorità badge
    const priorityLabels = { high: 'Alta', medium: 'Media', low: 'Bassa' };
    const priorityBadge = document.createElement('span');
    priorityBadge.className = `task-priority priority-${task.priority}`;
    priorityBadge.textContent = priorityLabels[task.priority] || task.priority;
    metaRow.appendChild(priorityBadge);

    // Due date
    if (task.due_date) {
      const dueBadge = document.createElement('span');
      dueBadge.className = 'task-due';
      
      const isPast = new Date(task.due_date).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);
      if (isPast && !task.completed) {
        dueBadge.classList.add('is-overdue');
        dueBadge.title = 'Attività scaduta!';
      }

      dueBadge.textContent = `📅 ${task.due_date}`;
      metaRow.appendChild(dueBadge);
    }

    // Tags
    if (task.tags && task.tags.length > 0) {
      const tagList = document.createElement('div');
      tagList.className = 'task-tags';
      task.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'task-tag';
        tagSpan.textContent = `#${tag}`;
        tagList.appendChild(tagSpan);
      });
      metaRow.appendChild(tagList);
    }

    card.appendChild(metaRow);
    return card;
  }

  updateStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    if (this.statText) {
      this.statText.textContent = `${completed}/${total} (${percent}%)`;
    }
    if (this.statFill) {
      this.statFill.style.width = `${percent}%`;
    }

    // Aggiorna badge contatori sui quadranti (solo attività attive)
    const counts = { inbox: 0, q1: 0, q2: 0, q3: 0, q4: 0 };
    this.tasks.filter(t => !t.completed).forEach(t => {
      if (counts[t.quadrant] !== undefined) counts[t.quadrant]++;
    });

    if (this.countInbox) this.countInbox.textContent = counts.inbox;
    if (this.countQ1) this.countQ1.textContent = counts.q1;
    if (this.countQ2) this.countQ2.textContent = counts.q2;
    if (this.countQ3) this.countQ3.textContent = counts.q3;
    if (this.countQ4) this.countQ4.textContent = counts.q4;

    this.updateArchiveBadge();
  }

  updateArchiveBadge() {
    const completedCount = this.tasks.filter(t => t.completed).length;
    if (this.countArchiveBadge) {
      this.countArchiveBadge.textContent = completedCount;
      this.countArchiveBadge.classList.toggle('has-items', completedCount > 0);
    }
  }

  // -------------------------------------------------------------------------
  // Archive Modal (Coda Attività Svolte)
  // -------------------------------------------------------------------------

  openArchiveModal() {
    if (!this.archiveModal) return;
    this.renderArchiveList();
    this.archiveModal.classList.add('is-open');
  }

  closeArchiveModal() {
    if (!this.archiveModal) return;
    this.archiveModal.classList.remove('is-open');
  }

  renderArchiveList() {
    if (!this.archiveTasksContainer || !this.archiveEmptyPlaceholder) return;

    const completedTasks = this.tasks.filter(t => t.completed);
    const count = completedTasks.length;

    if (this.archiveCountText) {
      this.archiveCountText.textContent = count === 0
        ? 'Nessuna attività completata presente.'
        : `${count} ${count === 1 ? 'attività completata archiviata' : 'attività completate archiviate'}`;
    }

    if (count === 0) {
      this.archiveTasksContainer.style.display = 'none';
      this.archiveEmptyPlaceholder.style.display = 'flex';
      return;
    }

    this.archiveEmptyPlaceholder.style.display = 'none';
    this.archiveTasksContainer.style.display = 'flex';
    this.archiveTasksContainer.innerHTML = '';

    const quadrantLabels = {
      inbox: 'Inbox',
      q1: 'Q1 (Fai Subito)',
      q2: 'Q2 (Pianifica)',
      q3: 'Q3 (Delega)',
      q4: 'Q4 (Elimina)'
    };

    completedTasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'archive-task-item';
      item.dataset.taskId = task.id;

      const info = document.createElement('div');
      info.className = 'archive-task-info';

      const header = document.createElement('div');
      header.className = 'archive-task-header';

      const quadSpan = document.createElement('span');
      quadSpan.className = `archive-task-quadrant quadrant-${task.quadrant}`;
      quadSpan.textContent = quadrantLabels[task.quadrant] || task.quadrant;
      header.appendChild(quadSpan);

      if (task.due_date) {
        const dueSpan = document.createElement('span');
        dueSpan.className = 'task-due';
        dueSpan.style.fontSize = '0.7rem';
        dueSpan.textContent = `📅 ${task.due_date}`;
        header.appendChild(dueSpan);
      }

      const title = document.createElement('div');
      title.className = 'archive-task-title';
      title.textContent = task.title;

      info.appendChild(header);
      info.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'archive-task-actions';

      // Pulsante Ripristina
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn-restore-task';
      restoreBtn.title = 'Riporta questa attività nella matrice';
      restoreBtn.innerHTML = '<span>↩️</span><span>Ripristina</span>';
      restoreBtn.addEventListener('click', async () => {
        task.completed = false;
        await TaskStorage.updateTask(task.id, { completed: false });
        this.render();
        this.renderArchiveList();
        this.showToast(`"${task.title}" ripristinata nella matrice!`);
      });

      // Pulsante Elimina
      const delBtn = document.createElement('button');
      delBtn.className = 'task-btn task-btn-del';
      delBtn.title = 'Elimina definitivamente';
      delBtn.innerHTML = '🗑️';
      delBtn.addEventListener('click', async () => {
        if (confirm(`Eliminare definitivamente l'attività "${task.title}" dall'archivio?`)) {
          await TaskStorage.deleteTask(task.id);
          this.tasks = this.tasks.filter(t => t.id !== task.id);
          this.render();
          this.renderArchiveList();
          this.showToast('Attività eliminata definitivamente.');
        }
      });

      actions.appendChild(restoreBtn);
      actions.appendChild(delBtn);

      item.appendChild(info);
      item.appendChild(actions);
      this.archiveTasksContainer.appendChild(item);
    });
  }

  // -------------------------------------------------------------------------
  // Modal Handlers
  // -------------------------------------------------------------------------
  openEditUserModal(user) {
    if (!this.editUserModal || !user) return;
    this.editUserId.value = user.id || '';
    this.editUserUsername.value = user.username || '';
    this.editUserName.value = user.display_name || user.username || '';
    this.editUserEmail.value = user.email || '';
    this.editUserPassword.value = '';
    if (this.editUserRole) {
      this.editUserRole.value = user.role || 'utente';
    }

    const isCurrent = this.currentUser && (this.currentUser.id === user.id || this.currentUser.username === user.username);
    if (this.editUserModalTitle) {
      this.editUserModalTitle.textContent = isCurrent ? '✏️ Il Mio Profilo' : `✏️ Modifica Utenza: ${user.username}`;
    }

    if (this.editUserRoleGroup) {
      const isAdmin = this.currentUser && this.currentUser.role === 'admin';
      this.editUserRoleGroup.style.display = (isAdmin && !isCurrent) ? 'block' : 'none';
    }

    this.editUserModal.classList.add('is-open');
    setTimeout(() => this.editUserName?.focus(), 100);
  }

  closeEditUserModal() {
    if (!this.editUserModal) return;
    this.editUserModal.classList.remove('is-open');
  }

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

// Utility di configurazione riservata all'amministratore (solo via Developer Console, invisibile nella UI)
window.configureSupabase = (url, key) => {
  if (!url || !key) {
    console.error('Uso: window.configureSupabase("https://xyz.supabase.co", "anon-key")');
    return;
  }
  TaskStorage.setSupabaseConfig(url, key);
  console.log('✅ Supabase configurato. Ricarica la pagina per renderlo attivo.');
};

window.clearSupabase = () => {
  TaskStorage.clearSupabaseConfig();
  console.log('✅ Configurazione Supabase rimossa. Ricarica la pagina per ripristinare il backend locale.');
};
