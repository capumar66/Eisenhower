import sys
from pathlib import Path
import uvicorn

# Assicura che la directory radice sia nel sys.path
root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
from api.index import app
if __name__ == "__main__":
    print("================================================================")
    print(" Eisenhower Matrix App — Server Avviato con Successo")
    print(" Apri nel browser: http://localhost:8000")
    print(" Documentazione API: http://localhost:8000/docs")
    print("================================================================")
    uvicorn.run("api.index:app", host="127.0.0.1", port=8000, reload=True)
