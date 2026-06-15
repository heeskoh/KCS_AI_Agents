# KCS AI Agents

관세행정 AI 통합포털 프로토타입입니다. 로컬 DuckDB, 로컬 ChromaDB, LangChain/LangGraph 기반 에이전트, 정적 웹 UI를 함께 사용합니다.

## 로컬 실행

```powershell
git clone https://github.com/heeskoh/KCS_AI_Agents.git
cd KCS_AI_Agents

python -m venv venv
.\venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

copy .env.example .env
notepad .env
```

`.env`에는 최소 `OPENAI_API_KEY`를 설정합니다. 선택 기능은 `LAW_API_KEY`, `KIPRIS_API_KEY`, `TAVILY_API_KEY`, `SERPAPI_API_KEY`를 추가로 설정하면 됩니다.

## 로컬 데이터 생성

DuckDB와 ChromaDB는 Git에 올리지 않는 로컬 생성물입니다. 새 PC에서 처음 실행할 때 아래 명령으로 생성합니다.

```powershell
python data\scripts\setup_db.py
python data\scripts\init_chromadb.py
```

데이터를 완전히 다시 만들려면 각 스크립트에 `--reset`을 붙입니다.

## Neo4j 그래프 DB 설정 (새 PC 또는 초기 설치)

Neo4j는 Docker로 실행합니다. DuckDB가 먼저 생성되어 있어야 합니다.

### 1. Neo4j 컨테이너 기동

```powershell
docker compose -f docker-compose.neo4j.yml up -d
```

브라우저 확인: `http://localhost:7474` (ID: `neo4j` / PW: `kcsneo4j1234`)

### 2. 그래프 데이터 로드

아래 두 스크립트를 순서대로 실행합니다. `--clear`는 기존 데이터를 지우고 다시 씁니다.

```powershell
# 인물·기업·사건·관계망 그래프
.\venv\Scripts\python.exe data\scripts\load_risk_person_graph_to_neo4j.py --clear

# 기업 수입위험 그래프
.\venv\Scripts\python.exe data\scripts\load_company_import_graph_to_neo4j.py --clear
```

### 3. 로드 확인

```powershell
.\venv\Scripts\python.exe data\scripts\neo4j_smoke_test.py
```

> `load_network_edge_to_neo4j.py`는 구 버전 레거시 스크립트로 reload 시 실행하지 않습니다.

## 웹 서버

```powershell
python web_server.py
```

기본 주소는 `http://127.0.0.1:8000`입니다. 포트와 호스트는 `.env`의 `HOST`, `PORT`로 바꿀 수 있습니다.

## Docker Compose

```powershell
docker compose up --build
```

컨테이너는 `./data`를 `/app/data`로 마운트합니다. 로컬에서 생성한 DuckDB/ChromaDB를 그대로 사용할 수 있습니다.

## GitHub로 다른 PC와 동기화

현재 원격 저장소:

```powershell
git remote -v
```

변경사항 저장:

```powershell
git status
git add .
git commit -m "chore: prepare project for cross-PC setup"
git push origin main
```

다른 PC에서는 `git clone` 또는 기존 폴더에서 `git pull origin main` 후, `.env` 생성과 로컬 데이터 생성 절차를 다시 수행합니다. `.env`, `venv`, DuckDB, ChromaDB는 PC별 로컬 파일이므로 Git에 포함하지 않습니다.
