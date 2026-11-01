# 🎯 Eisenhower Matrix Web App (Python + Vercel)

Un'applicazione web moderna, professionale e ultra-reattiva per gestire le attività quotidiane e strategiche secondo la celebre **Matrice di Eisenhower**, con supporto completo al **Drag & Drop**, interfaccia dal design elegante (Dark/Light mode, Glassmorphism) e backend asincrono in **Python con FastAPI**, ottimizzata per il deploy immediato su **Vercel**.

---

## 🚀 Caratteristiche Principali

- **Matrice 2x2 Interattiva:**
  - 🔥 **Q1 — Fai Subito (Do First):** Urgente & Importante (crisi, problemi bloccanti, scadenze immediate).
  - 📅 **Q2 — Pianifica (Schedule):** Non Urgente ma Importante (obiettivi strategici, crescita, salute, prevenzione).
  - 👥 **Q3 — Delega (Delegate):** Urgente ma Non Importante (interruzioni, attività delegabili).
  - 🗑️ **Q4 — Elimina (Eliminate):** Non Urgente & Non Importante (sprechi di tempo, distrazioni).
- **📥 Inbox / Da Smistare:** Barra laterale dedicata per annotare rapidamente nuove attività e smistarle nei quadranti tramite Drag & Drop.
- **✨ Drag & Drop Fluido:** Basato su `SortableJS`, touch-friendly per smartphone e tablet, con animazioni fluide, indicatori visivi di rilascio e gestione automatica dei quadranti vuoti.
- **🎨 Design Moderno & Accattivante:**
  - Ispirato ai design system più moderni (Linear, Raycast, Vercel).
  - Supporto Dark Mode / Light Mode istantaneo con persistenza.
  - Micro-interazioni, badge colorati per priorità (Alta, Media, Bassa), date di scadenza con avviso urgenza e tag personalizzati.
- **⚡ Architettura Resiliente (Vercel Serverless):**
  - Backend in Python con **FastAPI** e modelli validati con **Pydantic v2**.
  - Persistenza autoritativa in **LocalStorage** + sincronizzazione in background via API REST.
  - Esportazione e importazione istantanea di backup in formato **JSON**.
  - Monitoraggio in tempo reale della percentuale di completamento delle attività.

---

## 📁 Struttura del Progetto

```
.
├── api/
│   ├── __init__.py        # Package API Python
│   └── index.py           # Backend FastAPI (REST Endpoints & Serverless Handler Vercel)
├── public/
│   ├── index.html         # Interfaccia utente moderna
│   ├── css/
│   │   └── style.css      # Design System CSS (Glassmorphism, Dark/Light, Layout)
│   └── js/
│       ├── app.js         # Controller UI, eventi, rendering DOM sicuro (XSS-safe)
│       ├── dnd.js         # Setup SortableJS drag & drop
│       └── storage.js     # Gestore sincronizzazione LocalStorage & API REST
├── tests/
│   ├── __init__.py
│   └── test_api.py        # Suite di test automatizzati (Pytest + TestClient)
├── run.py                 # Script per l'avvio del server di sviluppo locale
├── requirements.txt       # Dipendenze Python (FastAPI, Uvicorn, Pydantic, Pytest, HTTPX)
├── vercel.json            # Configurazione di routing per Vercel
└── README.md
```

---

## 💻 Avvio in Locale

### 1. Prerequisiti
- Python 3.9 o superiore installato sul proprio sistema.

### 2. Installazione delle dipendenze
Crea un ambiente virtuale (consigliato) e installa le dipendenze:

```bash
# Crea e attiva l'ambiente virtuale
python3 -m venv .venv
source .venv/bin/activate   # Su Linux/macOS
# oppure .venv\Scripts\activate su Windows

# Installa le librerie richieste
pip install -r requirements.txt
```

### 3. Avvio dell'Applicazione
Esegui semplicemente lo script `run.py`:

```bash
python run.py
```

L'applicazione sarà immediatamente accessibile nel tuo browser all'indirizzo:
👉 **`http://localhost:8000`**

Documentazione interattiva OpenAPI / Swagger:
👉 **`http://localhost:8000/docs`**

---

## 🧪 Esecuzione dei Test Automatizzati

Per verificare il corretto funzionamento di tutte le API e del montaggio dei file statici:

```bash
pytest tests/test_api.py -v
```

---

## ☁️ Deploy su Vercel

Il progetto è configurato nativamente per **Vercel** tramite il file `vercel.json` e l'entrypoint `api/index.py`.

### Metodo 1: Tramite Vercel CLI

1. Installa la CLI di Vercel (se non già presente):
   ```bash
   npm i -g vercel
   ```
2. Dalla cartella principale del progetto, esegui:
   ```bash
   vercel
   ```
3. Segui le istruzioni a schermo. Per rilasciare in produzione:
   ```bash
   vercel --prod
   ```

### Metodo 2: Tramite Git (GitHub / GitLab / Bitbucket)

1. Pubblica questa cartella su una nuova repository GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: Eisenhower Matrix Web App"
   git remote add origin <URL_REPOSITORY>
   git push -u origin main
   ```
2. Vai sulla dashboard di [Vercel](https://vercel.com).
3. Clicca su **Add New Project** e seleziona la tua repository.
4. Vercel rileverà automaticamente `api/index.py` e `vercel.json`. Clicca su **Deploy**.
5. La tua applicazione sarà online in pochi secondi con certificato HTTPS e CDN globale!

---

## 📝 Licenza

Distribuito sotto licenza Open Source.
