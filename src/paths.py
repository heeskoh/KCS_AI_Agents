from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "customs.duckdb"
CHROMA_DIR = DATA_DIR / "chroma_db"
STATIC_DIR = PROJECT_ROOT / "web" / "static"
