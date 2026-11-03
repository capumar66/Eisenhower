import hashlib
import json
import os
import re
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Generator, List, Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configurazione Database SQLite (con supporto Vercel /tmp)
# ---------------------------------------------------------------------------

_forced_tmp_db = False

def get_db_path() -> Path:
    global _forced_tmp_db
    if os.environ.get("DATABASE_TEST_PATH"):
        return Path(os.environ["DATABASE_TEST_PATH"])
    if _forced_tmp_db or os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp/eisenhower.db")
    try:
        local_path = Path(__file__).resolve().parent.parent / "eisenhower.db"
        if not os.access(local_path.parent, os.W_OK):
            return Path("/tmp/eisenhower.db")
        return local_path
    except Exception:
        return Path("/tmp/eisenhower.db")

@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    global _forced_tmp_db
    db_path = get_db_path()
    try:
        conn = sqlite3.connect(str(db_path))
    except sqlite3.OperationalError:
        _forced_tmp_db = True
        conn = sqlite3.connect("/tmp/eisenhower.db")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """Inizializza le tabelle del database se non esistono e gestisce migrazioni automatiche."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                email TEXT UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                display_name TEXT,
                role TEXT NOT NULL DEFAULT 'utente',
                is_blocked INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
        """)
        # Migrazione automatica se colonne mancanti
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(users);")
        columns = [row[1] for row in cursor.fetchall()]
        if "role" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'utente';")
        if "email" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN email TEXT;")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;")
        if "is_blocked" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0;")
        # Assicura che gli utenti 'admin' e 'marco' abbiano ruolo 'admin' se presenti
        cursor.execute("UPDATE users SET role = 'admin' WHERE LOWER(username) IN ('admin', 'marco');")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                quadrant TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                priority TEXT NOT NULL,
                due_date TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                order_idx INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, quadrant, order_idx);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);")

# Esegui inizializzazione all'avvio
init_db()

# ---------------------------------------------------------------------------
# Utility di Sicurezza e Hashing Password
# ---------------------------------------------------------------------------

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000
    )
    return hashed.hex(), salt

def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000
    )
    return secrets.compare_digest(hashed.hex(), expected_hash)

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

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: Optional[str] = Field(default=None, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    display_name: Optional[str] = Field(default="", max_length=50)

class AdminUserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    display_name: Optional[str] = Field(default="", max_length=50)
    role: str = Field(default="utente")

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = "utente"
    is_blocked: bool = False
    created_at: str

class AdminUserItem(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = "utente"
    is_blocked: bool = False
    created_at: str
    task_count: int = 0

class AuthResponse(BaseModel):
    token: str
    user: UserResponse

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
# Inizializzazione Applicazione FastAPI e Router
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Eisenhower Matrix API",
    description="Backend API in Python per la gestione della Matrice di Eisenhower con autenticazione utente",
    version="2.0.0",
    redirect_slashes=False
)

# Configurazione CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def vercel_path_normalizer(request: Request, call_next):
    """
    Normalizza il percorso su ambienti Vercel serverless.
    Gestisce percorsi con prefisso file (/api/index.py/...), rewrites Vercel (x-matched-path, query parameters ?path=...)
    e varianti generate dai rewrites Vercel.
    """
    raw_path = request.scope.get("path", "")

    # 1. Controlla se Vercel ha popolato header di rewrite con il percorso originale
    matched = (
        request.headers.get("x-matched-path")
        or request.headers.get("x-vercel-matched-path")
        or request.headers.get("x-rewrite-url")
        or request.headers.get("x-forwarded-uri")
    )
    if matched:
        matched_clean = matched.split("?")[0]
        if matched_clean and not matched_clean.endswith("index.py"):
            raw_path = matched_clean

    # 2. Se Vercel ha convertito il percorso in query param (es. ?path=auth/register o ?path=config)
    param_path = request.query_params.get("path") or request.query_params.get("__route__")
    if param_path:
        param_clean = "/" + param_path.lstrip("/")
        if not raw_path or raw_path in ("/api/index.py", "/api/index", "/index.py", "/"):
            raw_path = param_clean

    # 3. Rimuove prefissi del file serverless se ancora presenti
    for prefix in ("/api/index.py", "/api/index", "/index.py"):
        if raw_path.startswith(prefix):
            remainder = raw_path[len(prefix):]
            raw_path = remainder if remainder else "/"
            break

    # 4. Assicura che inizi sempre con slash
    if not raw_path.startswith("/"):
        raw_path = "/" + raw_path

    request.scope["path"] = raw_path

    response = await call_next(request)
    
    # Headers no-cache per prevenire problemi di caching dei browser
    path = request.url.path
    if path.startswith("/api/") or path.startswith("/auth/") or path.startswith("/tasks/") or path.startswith("/admin/") or path.startswith("/config"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    elif path.endswith((".html", ".js", ".css")) or path == "/":
        response.headers["Cache-Control"] = "no-cache, must-revalidate"

    return response

    return response

# Router unificato per gestire endpoint sia con prefisso '/api' che senza
api_router = APIRouter()

# ---------------------------------------------------------------------------
# Dipendenza Autenticazione (Bearer Token)
# ---------------------------------------------------------------------------

def get_current_user(authorization: Optional[str] = Header(None)) -> UserResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticazione richiesta. Effettua il login."
        )
    token = authorization.split("Bearer ", 1)[1].strip()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT u.id, u.username, u.email, u.display_name, u.role, u.is_blocked, u.created_at
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
            """,
            (token,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sessione non valida o scaduta. Effettua nuovamente il login."
            )
        if row["is_blocked"]:
            cursor.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Il tuo account è stato bloccato dall'amministratore."
            )
        return UserResponse(
            id=row["id"],
            username=row["username"],
            email=row["email"],
            display_name=row["display_name"],
            role=row["role"] or "utente",
            is_blocked=bool(row["is_blocked"]),
            created_at=row["created_at"]
        )

# ---------------------------------------------------------------------------
# Helper Task Row -> Task Pydantic
# ---------------------------------------------------------------------------

def row_to_task(row: sqlite3.Row) -> Task:
    tags = []
    if row["tags"]:
        try:
            tags = json.loads(row["tags"])
        except Exception:
            tags = []
    return Task(
        id=row["id"],
        title=row["title"],
        description=row["description"] or "",
        quadrant=QuadrantType(row["quadrant"]),
        completed=bool(row["completed"]),
        priority=PriorityType(row["priority"]),
        due_date=row["due_date"],
        tags=tags,
        order=row["order_idx"],
        created_at=row["created_at"]
    )

# ---------------------------------------------------------------------------
# Endpoint di Autenticazione
# ---------------------------------------------------------------------------

@api_router.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister):
    """Registra un nuovo utente e restituisce il token di sessione."""
    clean_username = payload.username.strip()
    clean_email = payload.email.strip().lower() if payload.email else f"{clean_username.lower()}@eisenhower.app"

    if not re.match(r"^[a-zA-Z0-9_.-]+$", clean_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lo username può contenere solo lettere, numeri, punti, trattini o underscore."
        )

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", clean_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indirizzo email non valido."
        )

    user_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    pwd_hash, salt = hash_password(payload.password)
    display_name = payload.display_name.strip() if payload.display_name else clean_username

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE LOWER(username) = ?", (clean_username.lower(),))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nome utente già utilizzato. Scegline un altro."
            )

        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Indirizzo email già registrato. Utilizzane un altro."
            )

        cursor.execute("SELECT COUNT(*) FROM users;")
        total_users = cursor.fetchone()[0]
        assigned_role = "admin" if (total_users == 0 or clean_username.lower() in ["admin", "marco"]) else "utente"

        cursor.execute(
            """
            INSERT INTO users (id, username, email, password_hash, salt, display_name, role, is_blocked, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (user_id, clean_username, clean_email, pwd_hash, salt, display_name, assigned_role, now_iso)
        )

        token = secrets.token_urlsafe(32)
        cursor.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, now_iso)
        )

    user_res = UserResponse(
        id=user_id,
        username=clean_username,
        email=clean_email,
        display_name=display_name,
        role=assigned_role,
        is_blocked=False,
        created_at=now_iso
    )
    return AuthResponse(token=token, user=user_res)

@api_router.post("/auth/login", response_model=AuthResponse)
def login(payload: UserLogin):
    """Autentica un utente esistente (tramite username o email) e genera un nuovo token di sessione."""
    clean_login = payload.username.strip().lower()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, username, email, password_hash, salt, display_name, role, is_blocked, created_at
            FROM users
            WHERE LOWER(username) = ? OR LOWER(email) = ?
            """,
            (clean_login, clean_login)
        )
        row = cursor.fetchone()
        if not row or not verify_password(payload.password, row["salt"], row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Nome utente/email o password non corretti."
            )

        if row["is_blocked"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Questo account è stato bloccato dall'amministratore."
            )

        user_id = row["id"]
        now_iso = datetime.now(timezone.utc).isoformat()
        token = secrets.token_urlsafe(32)
        cursor.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, now_iso)
        )

    user_res = UserResponse(
        id=user_id,
        username=row["username"],
        email=row["email"],
        display_name=row["display_name"],
        role=row["role"] or "utente",
        is_blocked=bool(row["is_blocked"]),
        created_at=row["created_at"]
    )
    return AuthResponse(token=token, user=user_res)

@api_router.get("/auth/me", response_model=UserResponse)
def get_me(current_user: UserResponse = Depends(get_current_user)):
    """Restituisce il profilo dell'utente correntemente autenticato."""
    return current_user

@api_router.post("/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    """Invalida la sessione corrente dell'utente."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        with get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return {"success": True, "message": "Disconnessione effettuata con successo."}

# ---------------------------------------------------------------------------
# API Endpoints Tasks (Isolati per Utente)
# ---------------------------------------------------------------------------

@api_router.get("/health")
def health_check():
    """Verifica lo stato dell'API."""
    return {"status": "healthy", "service": "eisenhower-matrix-api"}

@api_router.get("/config")
def get_public_config():
    """Restituisce le configurazioni del client se impostate come variabili d'ambiente sul server (Vercel o locale)."""
    supabase_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or ""
    ).strip()
    supabase_anon_key = (
        os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    ).strip()
    return {
        "supabase_url": supabase_url,
        "supabase_anon_key": supabase_anon_key,
        "configured": bool(supabase_url and supabase_anon_key)
    }

# ---------------------------------------------------------------------------
# API Endpoints Amministrazione (Riservati al ruolo 'admin')
# ---------------------------------------------------------------------------

@api_router.get("/admin/users", response_model=List[AdminUserItem])
def get_all_users(current_user: UserResponse = Depends(get_current_user)):
    """Restituisce l'elenco di tutti gli utenti registrati con relative metriche."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso negato: operazione riservata agli amministratori."
        )
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.username, u.email, u.display_name, u.role, u.is_blocked, u.created_at,
                   COUNT(t.id) as task_count
            FROM users u
            LEFT JOIN tasks t ON u.id = t.user_id
            GROUP BY u.id
            ORDER BY u.created_at ASC;
        """)
        return [
            AdminUserItem(
                id=r["id"],
                username=r["username"],
                email=r["email"],
                display_name=r["display_name"],
                role=r["role"] or "utente",
                is_blocked=bool(r["is_blocked"]),
                created_at=r["created_at"],
                task_count=r["task_count"]
            )
            for r in cursor.fetchall()
        ]

@api_router.post("/admin/users", response_model=AdminUserItem, status_code=status.HTTP_201_CREATED)
def create_user_by_admin(payload: AdminUserCreate, current_user: UserResponse = Depends(get_current_user)):
    """Crea un nuovo utente tramite maschera Admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso negato: operazione riservata agli amministratori."
        )

    clean_username = payload.username.strip()
    clean_email = payload.email.strip().lower()
    display_name = payload.display_name.strip() if payload.display_name else clean_username
    role = "admin" if payload.role == "admin" else "utente"

    if not re.match(r"^[a-zA-Z0-9_.-]+$", clean_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lo username può contenere solo lettere, numeri, punti, trattini o underscore."
        )

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", clean_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indirizzo email non valido."
        )

    user_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    pwd_hash, salt = hash_password(payload.password)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE LOWER(username) = ?", (clean_username.lower(),))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nome utente già utilizzato. Scegline un altro."
            )
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Indirizzo email già utilizzato. Scegline un altro."
            )

        cursor.execute(
            """
            INSERT INTO users (id, username, email, password_hash, salt, display_name, role, is_blocked, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (user_id, clean_username, clean_email, pwd_hash, salt, display_name, role, now_iso)
        )

    return AdminUserItem(
        id=user_id,
        username=clean_username,
        email=clean_email,
        display_name=display_name,
        role=role,
        is_blocked=False,
        created_at=now_iso,
        task_count=0
    )

@api_router.post("/admin/users/{user_id}/toggle-block", response_model=AdminUserItem)
def toggle_block_user(user_id: str, current_user: UserResponse = Depends(get_current_user)):
    """Blocca o sblocca un utente. Se bloccato, invalida immediatamente tutte le sue sessioni attive."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso negato: operazione riservata agli amministratori."
        )
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non puoi bloccare il tuo account amministratore."
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_blocked FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Utente non trovato.")

        new_blocked_state = 0 if row["is_blocked"] else 1
        cursor.execute("UPDATE users SET is_blocked = ? WHERE id = ?", (new_blocked_state, user_id))

        # Se l'utente viene bloccato, cancella subito tutte le sue sessioni attive per forzare la disconnessione immediata
        if new_blocked_state == 1:
            cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

        cursor.execute("""
            SELECT u.id, u.username, u.email, u.display_name, u.role, u.is_blocked, u.created_at,
                   COUNT(t.id) as task_count
            FROM users u
            LEFT JOIN tasks t ON u.id = t.user_id
            WHERE u.id = ?
            GROUP BY u.id;
        """, (user_id,))
        r = cursor.fetchone()
        return AdminUserItem(
            id=r["id"],
            username=r["username"],
            email=r["email"],
            display_name=r["display_name"],
            role=r["role"] or "utente",
            is_blocked=bool(r["is_blocked"]),
            created_at=r["created_at"],
            task_count=r["task_count"]
        )

@api_router.delete("/admin/users/{user_id}")
def delete_user_by_admin(user_id: str, current_user: UserResponse = Depends(get_current_user)):
    """Consente a un amministratore di eliminare un utente."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso negato: operazione riservata agli amministratori."
        )
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non puoi eliminare il tuo stesso account amministratore."
        )
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Utente non trovato.")
    return {"success": True, "message": "Utente eliminato con successo."}

@api_router.get("/tasks", response_model=List[Task])
def get_tasks(current_user: UserResponse = Depends(get_current_user)):
    """Recupera la lista delle attività dell'utente loggato, ordinate per quadrante e ordine."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM tasks
            WHERE user_id = ?
            ORDER BY quadrant ASC, order_idx ASC, created_at DESC
            """,
            (current_user.id,)
        )
        rows = cursor.fetchall()
        return [row_to_task(r) for r in rows]

@api_router.post("/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, current_user: UserResponse = Depends(get_current_user)):
    """Crea una nuova attività per l'utente loggato."""
    task_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM tasks WHERE user_id = ? AND quadrant = ?",
            (current_user.id, payload.quadrant.value)
        )
        next_order = cursor.fetchone()[0]

        tags_json = json.dumps(payload.tags or [])
        cursor.execute(
            """
            INSERT INTO tasks (id, user_id, title, description, quadrant, completed, priority, due_date, tags, order_idx, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                current_user.id,
                payload.title,
                payload.description or "",
                payload.quadrant.value,
                0,
                payload.priority.value,
                payload.due_date,
                tags_json,
                next_order,
                created_at,
            )
        )

    return Task(
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

@api_router.get("/tasks/{task_id}", response_model=Task)
def get_task(task_id: str, current_user: UserResponse = Depends(get_current_user)):
    """Recupera una specifica attività dell'utente per ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task non trovata")
        return row_to_task(row)

@api_router.put("/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, payload: TaskUpdate, current_user: UserResponse = Depends(get_current_user)):
    """Aggiorna un'attività esistente dell'utente."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task non trovata")

        current_task = row_to_task(row)
        update_data = payload.model_dump(exclude_unset=True)

        new_title = update_data.get("title", current_task.title)
        new_desc = update_data.get("description", current_task.description)
        new_quadrant = update_data.get("quadrant", current_task.quadrant)
        if isinstance(new_quadrant, QuadrantType):
            new_quadrant = new_quadrant.value
        new_completed = int(update_data.get("completed", current_task.completed))
        new_priority = update_data.get("priority", current_task.priority)
        if isinstance(new_priority, PriorityType):
            new_priority = new_priority.value
        new_due_date = update_data.get("due_date", current_task.due_date)
        new_tags = update_data.get("tags", current_task.tags)
        new_order = update_data.get("order", current_task.order)

        cursor.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, quadrant = ?, completed = ?, priority = ?, due_date = ?, tags = ?, order_idx = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                new_title,
                new_desc,
                new_quadrant,
                new_completed,
                new_priority,
                new_due_date,
                json.dumps(new_tags),
                new_order,
                task_id,
                current_user.id
            )
        )

        cursor.execute("SELECT * FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id))
        updated_row = cursor.fetchone()
        return row_to_task(updated_row)

@api_router.delete("/tasks/{task_id}")
def delete_task(task_id: str, current_user: UserResponse = Depends(get_current_user)):
    """Elimina un'attività dell'utente per ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Task non trovata")
        cursor.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, current_user.id))
    return {"success": True, "deleted_id": task_id}

@api_router.post("/tasks/move", response_model=Task)
def move_task(payload: TaskMoveRequest, current_user: UserResponse = Depends(get_current_user)):
    """Sposta un'attività tra quadranti e aggiorna la posizione d'ordine."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks WHERE id = ? AND user_id = ?", (payload.task_id, current_user.id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task non trovata")

        cursor.execute(
            """
            UPDATE tasks
            SET quadrant = ?, order_idx = ?
            WHERE id = ? AND user_id = ?
            """,
            (payload.target_quadrant.value, payload.new_order, payload.task_id, current_user.id)
        )

        cursor.execute("SELECT * FROM tasks WHERE id = ? AND user_id = ?", (payload.task_id, current_user.id))
        updated_row = cursor.fetchone()
        return row_to_task(updated_row)

@api_router.post("/tasks/bulk-sync", response_model=List[Task])
def bulk_sync(tasks: List[Task], current_user: UserResponse = Depends(get_current_user)):
    """Sincronizza in blocco le attività dell'utente loggato."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tasks WHERE user_id = ?", (current_user.id,))
        for t in tasks:
            cursor.execute(
                """
                INSERT INTO tasks (id, user_id, title, description, quadrant, completed, priority, due_date, tags, order_idx, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    t.id,
                    current_user.id,
                    t.title,
                    t.description or "",
                    t.quadrant.value,
                    int(t.completed),
                    t.priority.value,
                    t.due_date,
                    json.dumps(t.tags or []),
                    t.order,
                    t.created_at
                )
            )

        cursor.execute(
            "SELECT * FROM tasks WHERE user_id = ? ORDER BY quadrant ASC, order_idx ASC",
            (current_user.id,)
        )
        return [row_to_task(r) for r in cursor.fetchall()]

# ---------------------------------------------------------------------------
# Registrazione Router (supporta sia percorsi con prefisso '/api' che senza)
# ---------------------------------------------------------------------------
app.include_router(api_router, prefix="/api")
app.include_router(api_router)

# ---------------------------------------------------------------------------
# Montaggio StaticFiles per ambiente locale / standalone (escluso su Vercel CDN)
# ---------------------------------------------------------------------------
if not os.environ.get("VERCEL") and not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    public_path = Path(__file__).resolve().parent.parent / "public"
    if public_path.is_dir():
        app.mount("/", StaticFiles(directory=str(public_path), html=True), name="static")
