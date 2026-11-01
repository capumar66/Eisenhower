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
    """Verifica la registrazione corretta di un nuovo utente."""
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
