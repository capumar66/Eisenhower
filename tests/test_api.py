import pytest
from fastapi.testclient import TestClient
from api.index import app, reset_demo

client = TestClient(app)

@pytest.fixture(autouse=True)
def run_around_tests():
    """Ripristina lo stato demo prima di ogni test."""
    reset_demo()
    yield

def test_health_check():
    """Verifica che l'endpoint health risponda con 200 OK."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_get_tasks_initial_state():
    """Verifica che GET /api/tasks restituisca la lista dei task demo predefiniti."""
    response = client.get("/api/tasks")
    assert response.status_code == 200
    tasks = response.json()
    assert isinstance(tasks, list)
    assert len(tasks) >= 5
    # Verifica campi essenziali
    first_task = tasks[0]
    assert "id" in first_task
    assert "title" in first_task
    assert "quadrant" in first_task
    assert "order" in first_task
    assert "created_at" in first_task

def test_create_task_success():
    """Verifica la creazione di una nuova attività con status 201 Created."""
    payload = {
        "title": "Nuova attività di test",
        "description": "Dettagli dell'attività di test",
        "quadrant": "inbox",
        "priority": "high",
        "due_date": "2026-11-10",
        "tags": ["Test", "QA"]
    }
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert created["title"] == payload["title"]
    assert created["quadrant"] == "inbox"
    assert created["priority"] == "high"
    assert created["id"] is not None
    assert len(created["id"]) > 0
    assert created["created_at"] is not None

def test_move_task():
    """Verifica lo spostamento di un'attività tra quadranti con POST /api/tasks/move."""
    move_payload = {
        "task_id": "task-demo-5",
        "target_quadrant": "q1",
        "new_order": 3
    }
    response = client.post("/api/tasks/move", json=move_payload)
    assert response.status_code == 200
    moved = response.json()
    assert moved["id"] == "task-demo-5"
    assert moved["quadrant"] == "q1"
    assert moved["order"] == 3

def test_update_task_not_found():
    """Verifica che l'aggiornamento di un ID inesistente restituisca 404 Not Found."""
    response = client.put("/api/tasks/id-inesistente-999", json={"title": "Titolo Aggiornato"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Task non trovata"

def test_delete_task():
    """Verifica la cancellazione di un'attività e successivo 404."""
    del_response = client.delete("/api/tasks/task-demo-4")
    assert del_response.status_code == 200
    assert del_response.json()["success"] is True

    # Verifica che il task non esista più
    get_response = client.get("/api/tasks/task-demo-4")
    assert get_response.status_code == 404

def test_static_files_served():
    """Verifica che i file statici (HTML, CSS, JS) vengano serviti correttamente."""
    response = client.get("/")
    assert response.status_code == 200
    assert "Matrice di Eisenhower" in response.text

    css_res = client.get("/css/style.css")
    assert css_res.status_code == 200
    assert "eisenhower" in css_res.text.lower()

