import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Modelli e Schemi Dati (Pydantic v2)
# ---------------------------------------------------------------------------

class QuadrantType(str, Enum):
    INBOX = "inbox"         # Da smistare / Backlog
    Q1 = "q1"               # Urgente & Importante (Fai Subito / Do First)
    Q2 = "q2"               # Non Urgente & Importante (Pianifica / Schedule)
    Q3 = "q3"               # Urgente & Non Importante (Delega / Delegate)
    Q4 = "q4"               # Non Urgente & Non Importante (Elimina / Eliminate)

class PriorityType(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class Task(BaseModel):
    id: str
    title: str = Field(..., max_length=120)
    description: Optional[str] = Field(default="", max_length=500)
    quadrant: QuadrantType = QuadrantType.INBOX
    completed: bool = False
    priority: PriorityType = PriorityType.MEDIUM
    due_date: Optional[str] = None          # Formato ISO YYYY-MM-DD
    tags: List[str] = Field(default_factory=list)
    order: int = 0
    created_at: str                         # Formato ISO 8601 UTC

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=500)
    quadrant: QuadrantType = QuadrantType.INBOX
    priority: PriorityType = PriorityType.MEDIUM
    due_date: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=500)
    quadrant: Optional[QuadrantType] = None
    completed: Optional[bool] = None
    priority: Optional[PriorityType] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None
    order: Optional[int] = None

class TaskMoveRequest(BaseModel):
    task_id: str
    target_quadrant: QuadrantType
    new_order: int = Field(default=0, ge=0)

# ---------------------------------------------------------------------------
# Inizializzazione Applicazione FastAPI
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Eisenhower Matrix API",
    description="Backend API moderna in Python per la gestione della Matrice di Eisenhower",
    version="1.0.0"
)

# Configurazione CORS per compatibilità con frontend e preview Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Store in-memory con Task Dimostrative Iniziali
# ---------------------------------------------------------------------------

now_iso = datetime.now(timezone.utc).isoformat()

INITIAL_TASKS: Dict[str, Task] = {
    "task-demo-1": Task(
        id="task-demo-1",
        title="Risolvere bug bloccante in produzione",
        description="Errore 500 riscontrato dagli utenti durante il checkout",
        quadrant=QuadrantType.Q1,
        completed=False,
        priority=PriorityType.HIGH,
        due_date="2026-11-02",
        tags=["Urgent", "Backend"],
        order=0,
        created_at=now_iso,
    ),
    "task-demo-2": Task(
        id="task-demo-2",
        title="Pianificare architettura Q1",
        description="Definire roadmap tecnologica e strategia per il prossimo trimestre",
        quadrant=QuadrantType.Q2,
        completed=False,
        priority=PriorityType.HIGH,
        due_date="2026-11-15",
        tags=["Strategia", "Planning"],
        order=0,
        created_at=now_iso,
    ),
    "task-demo-3": Task(
        id="task-demo-3",
        title="Rispondere alle email di routine",
        description="Smistare richieste informative generiche e aggiornamenti",
        quadrant=QuadrantType.Q3,
        completed=False,
        priority=PriorityType.MEDIUM,
        due_date="2026-11-03",
        tags=["Comunicazione"],
        order=0,
        created_at=now_iso,
    ),
    "task-demo-4": Task(
        id="task-demo-4",
        title="Organizzare vecchi file di download",
        description="Pulizia cartella download locale, attività non urgente né prioritaria",
        quadrant=QuadrantType.Q4,
        completed=False,
        priority=PriorityType.LOW,
        due_date=None,
        tags=["Pulizia"],
        order=0,
        created_at=now_iso,
    ),
    "task-demo-5": Task(
        id="task-demo-5",
        title="Revisione bozza presentazione clienti",
        description="Attività inserita nell'inbox, da posizionare nel quadrante idoneo",
        quadrant=QuadrantType.INBOX,
        completed=False,
        priority=PriorityType.MEDIUM,
        due_date="2026-11-05",
        tags=["Marketing", "Review"],
        order=0,
        created_at=now_iso,
    ),
}

# Database in memoria di runtime
tasks_db: Dict[str, Task] = dict(INITIAL_TASKS)

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    """Verifica lo stato dell'API."""
    return {"status": "healthy", "service": "eisenhower-matrix-api"}

@app.get("/api/tasks", response_model=List[Task])
def get_tasks():
    """Recupera la lista di tutte le attività, ordinate per quadrante e ordine."""
    return sorted(list(tasks_db.values()), key=lambda t: (t.quadrant.value, t.order))

@app.post("/api/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate):
    """Crea una nuova attività."""
    task_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    # Calcola il prossimo indice order nel quadrante di destinazione
    existing_in_quadrant = [t for t in tasks_db.values() if t.quadrant == payload.quadrant]
    next_order = len(existing_in_quadrant)

    new_task = Task(
        id=task_id,
        title=payload.title,
        description=payload.description or "",
        quadrant=payload.quadrant,
        completed=False,
        priority=payload.priority,
        due_date=payload.due_date,
        tags=payload.tags,
        order=next_order,
        created_at=created_at,
    )
    tasks_db[task_id] = new_task
    return new_task

@app.get("/api/tasks/{task_id}", response_model=Task)
def get_task(task_id: str):
    """Recupera una specifica attività per ID."""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task non trovata")
    return tasks_db[task_id]

@app.put("/api/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, payload: TaskUpdate):
    """Aggiorna un'attività esistente."""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task non trovata")
    
    current_task = tasks_db[task_id]
    update_data = payload.model_dump(exclude_unset=True)
    
    updated_task = current_task.model_copy(update=update_data)
    tasks_db[task_id] = updated_task
    return updated_task

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    """Elimina un'attività per ID."""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task non trovata")
    del tasks_db[task_id]
    return {"success": True, "deleted_id": task_id}

@app.post("/api/tasks/move", response_model=Task)
def move_task(payload: TaskMoveRequest):
    """Sposta un'attività tra quadranti e aggiorna la posizione d'ordine."""
    if payload.task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task non trovata")
    
    task = tasks_db[payload.task_id]
    old_quadrant = task.quadrant
    target_quadrant = payload.target_quadrant
    
    # Aggiorna il task
    task.quadrant = target_quadrant
    task.order = payload.new_order
    tasks_db[payload.task_id] = task
    
    return task

@app.post("/api/tasks/bulk-sync", response_model=List[Task])
def bulk_sync(tasks: List[Task]):
    """Sincronizza in blocco la lista dei task (per ripristino o backup da client)."""
    global tasks_db
    tasks_db = {t.id: t for t in tasks}
    return list(tasks_db.values())

@app.post("/api/tasks/reset-demo", response_model=List[Task])
def reset_demo():
    """Ripristina i dati demo predefiniti."""
    global tasks_db
    tasks_db = dict(INITIAL_TASKS)
    return list(tasks_db.values())

# ---------------------------------------------------------------------------
# Montaggio StaticFiles per ambiente locale / standalone
# ---------------------------------------------------------------------------
public_path = Path(__file__).resolve().parent.parent / "public"
if public_path.is_dir():
    app.mount("/", StaticFiles(directory=str(public_path), html=True), name="static")
