import os
import tempfile
import pytest
from fastapi.testclient import TestClient

# Imposta database temporaneo per i test
temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_TEST_PATH"] = temp_db.name

from api.index import app, init_db, get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_database():
    """Pulisce le tabelle prima di ogni test."""
    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM sessions;")
        conn.execute("DELETE FROM tasks;")
        conn.execute("DELETE FROM users;")
    yield

def test_health_check():
    """Verifica che l'endpoint health risponda con 200 OK."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_no_demo_user_exists_by_default():
    """Verifica che non esista alcun utente demo pre-configurato."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users;")
        count = cursor.fetchone()[0]
        assert count == 0

def test_register_new_user_success():
    """Verifica la registrazione corretta di un nuovo utente sia su /api/auth/register che su /auth/register (Vercel)."""
    payload = {
        "username": "marco_capuano",
        "password": "Password123!",
        "display_name": "Marco Capuano"
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "token" in data
    assert data["user"]["username"] == "marco_capuano"
    assert data["user"]["display_name"] == "Marco Capuano"
    assert "id" in data["user"]

def test_vercel_routing_without_api_prefix():
    """Verifica che gli endpoint rispondano anche se Vercel rimuove il prefisso /api (es: /auth/register)."""
    payload = {
        "username": "utente_vercel",
        "password": "Password123!",
        "display_name": "Utente Vercel"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    assert "token" in response.json()

def test_vercel_routing_with_index_py_in_path():
    """Verifica che il normalizzatore gestisca percorsi contenenti /api/index.py."""
    payload = {
        "username": "utente_index_py",
        "password": "Password123!"
    }
    response = client.post("/api/index.py/auth/register", json=payload)
    assert response.status_code == 201
    assert "token" in response.json()

def test_vercel_routing_with_query_param():
    """Verifica che il normalizzatore gestisca percorsi convertiti in query param da Vercel (?path=auth/register)."""
    payload = {
        "username": "utente_query_param",
        "password": "Password123!"
    }
    response = client.post("/api/index.py?path=auth/register", json=payload)
    assert response.status_code == 201
    assert "token" in response.json()

def test_register_duplicate_username_fails():
    """Verifica che registrare due volte lo stesso username restituisca 400 Bad Request."""
    payload = {
        "username": "utente_duplicato",
        "password": "Password123!"
    }
    res1 = client.post("/api/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/auth/register", json=payload)
    assert res2.status_code == 400
    assert "già utilizzato" in res2.json()["detail"]

def test_login_success_and_failure():
    """Verifica login con credenziali corrette ed errate."""
    # Registrazione
    client.post("/api/auth/register", json={
        "username": "user_auth_test",
        "password": "SecretPassword99"
    })

    # Login corretto
    login_res = client.post("/api/auth/login", json={
        "username": "user_auth_test",
        "password": "SecretPassword99"
    })
    assert login_res.status_code == 200
    assert "token" in login_res.json()

    # Login con password errata
    wrong_pwd_res = client.post("/api/auth/login", json={
        "username": "user_auth_test",
        "password": "WrongPassword!"
    })
    assert wrong_pwd_res.status_code == 401

    # Login con utente inesistente
    non_existent = client.post("/api/auth/login", json={
        "username": "non_esiste",
        "password": "qualchepassword"
    })
    assert non_existent.status_code == 401

def test_tasks_require_authentication():
    """Verifica che gli endpoint dei task richiedano il token di autenticazione."""
    res_get = client.get("/api/tasks")
    assert res_get.status_code == 401

    res_post = client.post("/api/tasks", json={"title": "Test Senza Auth"})
    assert res_post.status_code == 401

def test_user_task_isolation():
    """Verifica che le attività siano isolate: l'Utente A non vede i task dell'Utente B."""
    # Registra Utente 1
    u1_res = client.post("/api/auth/register", json={"username": "utente1", "password": "Password1!"})
    token1 = u1_res.json()["token"]

    # Registra Utente 2
    u2_res = client.post("/api/auth/register", json={"username": "utente2", "password": "Password2!"})
    token2 = u2_res.json()["token"]

    # Utente 1 crea un task
    client.post(
        "/api/tasks",
        headers={"Authorization": f"Bearer {token1}"},
        json={"title": "Task Privato Utente 1", "quadrant": "q1", "priority": "high"}
    )

    # Utente 1 deve vedere 1 task
    tasks_u1 = client.get("/api/tasks", headers={"Authorization": f"Bearer {token1}"}).json()
    assert len(tasks_u1) == 1
    assert tasks_u1[0]["title"] == "Task Privato Utente 1"

    # Utente 2 non deve vedere alcun task (lavagna pulita/vuota)
    tasks_u2 = client.get("/api/tasks", headers={"Authorization": f"Bearer {token2}"}).json()
    assert len(tasks_u2) == 0

def test_task_lifecycle_for_user():
    """Verifica ciclo di vita task: crea, sposta, aggiorna, cancella."""
    # Registra e logga utente
    reg = client.post("/api/auth/register", json={"username": "lifecycle_user", "password": "Password123!"})
    token = reg.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Crea
    create_res = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "title": "Compilare relazione",
            "description": "Dettagli relazione",
            "quadrant": "inbox",
            "priority": "medium",
            "tags": ["Lavoro"]
        }
    )
    assert create_res.status_code == 201
    task_id = create_res.json()["id"]

    # 2. Sposta
    move_res = client.post(
        "/api/tasks/move",
        headers=headers,
        json={"task_id": task_id, "target_quadrant": "q2", "new_order": 0}
    )
    assert move_res.status_code == 200
    assert move_res.json()["quadrant"] == "q2"

    # 3. Aggiorna
    update_res = client.put(
        f"/api/tasks/{task_id}",
        headers=headers,
        json={"title": "Compilare relazione finale", "completed": True}
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Compilare relazione finale"
    assert update_res.json()["completed"] is True

    # 4. Cancella
    del_res = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert del_res.status_code == 200

    # 5. Verifica che non esista più
    get_res = client.get(f"/api/tasks/{task_id}", headers=headers)
    assert get_res.status_code == 404

def test_static_files_served():
    """Verifica che i file statici vengano serviti correttamente."""
    response = client.get("/")
    assert response.status_code == 200
    assert "Matrice di Eisenhower" in response.text

    css_res = client.get("/css/style.css")
    assert css_res.status_code == 200
    assert "auth-modal" in css_res.text

def test_config_endpoint():
    """Verifica che l'endpoint /api/config risponda con i parametri di configurazione."""
    res = client.get("/api/config")
    assert res.status_code == 200
    data = res.json()
    assert "supabase_url" in data
    assert "supabase_anon_key" in data

def test_two_level_roles_and_admin_panel():
    """Verifica la gestione utenti a due livelli (Admin e Utente) e i relativi permessi."""
    # 1. Primo utente registrato diventa automaticamente admin
    res1 = client.post("/api/auth/register", json={
        "username": "super_admin",
        "password": "Password123!"
    })
    assert res1.status_code == 201
    admin_token = res1.json()["token"]
    assert res1.json()["user"]["role"] == "admin"

    # 2. Secondo utente registrato ha ruolo utente standard
    res2 = client.post("/api/auth/register", json={
        "username": "utente_standard",
        "password": "Password123!"
    })
    assert res2.status_code == 201
    user_token = res2.json()["token"]
    assert res2.json()["user"]["role"] == "utente"

    # 3. Utente standard non può accedere a /api/admin/users (403 Forbidden)
    res_forbidden = client.get("/api/admin/users", headers={"Authorization": f"Bearer {user_token}"})
    assert res_forbidden.status_code == 403

    # 4. Admin accede con successo e vede entrambi gli utenti
    res_admin = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    users_list = res_admin.json()
    assert len(users_list) == 2
    roles = {u["username"]: u["role"] for u in users_list}
    assert roles["super_admin"] == "admin"
    assert roles["utente_standard"] == "utente"

def test_vercel_x_matched_path_header():
    """Verifica che il middleware normalizzi x-matched-path generato dai rewrites di Vercel."""
    response = client.get("/api/index.py", headers={"x-matched-path": "/api/config"})
    assert response.status_code == 200
    assert "supabase_url" in response.json()

def test_task_completed_status_toggle():
    """Verifica che lo stato completed delle attività venga aggiornato correttamente via API."""
    reg = client.post("/api/auth/register", json={"username": "user_archive", "password": "Password123!"})
    token = reg.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Crea attività
    created = client.post("/api/tasks", headers=headers, json={"title": "Attività da archiviare", "quadrant": "q1"})
    task_id = created.json()["id"]
    assert created.json()["completed"] is False

    # Completa (sposta in archivio)
    updated = client.put(f"/api/tasks/{task_id}", headers=headers, json={"completed": True})
    assert updated.status_code == 200
    assert updated.json()["completed"] is True

    # Ripristina (deseleziona completed)
    restored = client.put(f"/api/tasks/{task_id}", headers=headers, json={"completed": False})
    assert restored.status_code == 200
    assert restored.json()["completed"] is False

def test_user_email_and_admin_management():
    """Verifica registrazione/login con email e gestione utenze da admin (creazione, blocco, sblocco, cancellazione)."""
    # 1. Registra Admin con email
    res_admin = client.post("/api/auth/register", json={
        "username": "boss_admin",
        "email": "boss@azienda.it",
        "password": "Password123!",
        "display_name": "Boss Admin"
    })
    assert res_admin.status_code == 201
    admin_token = res_admin.json()["token"]
    assert res_admin.json()["user"]["email"] == "boss@azienda.it"
    assert res_admin.json()["user"]["role"] == "admin"

    # 2. Login con Email anziché username
    login_by_email = client.post("/api/auth/login", json={
        "username": "boss@azienda.it",
        "password": "Password123!"
    })
    assert login_by_email.status_code == 200
    assert login_by_email.json()["user"]["username"] == "boss_admin"

    # 3. Admin crea un nuovo utente tramite form Admin
    res_create = client.post("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "username": "mario_rossi",
        "email": "mario.rossi@azienda.it",
        "password": "Password123!",
        "display_name": "Mario Rossi",
        "role": "utente"
    })
    assert res_create.status_code == 201
    mario_id = res_create.json()["id"]
    assert res_create.json()["email"] == "mario.rossi@azienda.it"
    assert res_create.json()["is_blocked"] is False

    # 4. Mario effettua il login
    login_mario = client.post("/api/auth/login", json={
        "username": "mario.rossi@azienda.it",
        "password": "Password123!"
    })
    assert login_mario.status_code == 200
    mario_token = login_mario.json()["token"]

    # 5. Admin blocca Mario
    res_block = client.post(f"/api/admin/users/{mario_id}/toggle-block", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_block.status_code == 200
    assert res_block.json()["is_blocked"] is True

    # 6. Mario prova ad accedere con il vecchio token -> 401 (sessione revocata) e nuovo login -> 403 Forbidden
    task_res = client.get("/api/tasks", headers={"Authorization": f"Bearer {mario_token}"})
    assert task_res.status_code in [401, 403]

    retry_login = client.post("/api/auth/login", json={
        "username": "mario_rossi",
        "password": "Password123!"
    })
    assert retry_login.status_code == 403
    assert "bloccato" in retry_login.json()["detail"]

    # 7. Admin sblocca Mario
    res_unblock = client.post(f"/api/admin/users/{mario_id}/toggle-block", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_unblock.status_code == 200
    assert res_unblock.json()["is_blocked"] is False

    # Mario ora può rientrare
    login_again = client.post("/api/auth/login", json={
        "username": "mario.rossi@azienda.it",
        "password": "Password123!"
    })
    assert login_again.status_code == 200

    # 8. Admin non può bloccare se stesso
    self_block = client.post(f"/api/admin/users/{res_admin.json()['user']['id']}/toggle-block", headers={"Authorization": f"Bearer {admin_token}"})
    assert self_block.status_code == 400
