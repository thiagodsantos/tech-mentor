# Tech Mentor API (MVP)

Async FastAPI backend for the local Tech Mentor app. The Vite client can use `/api` as its `baseURL`.

## Run locally

```sh
# Na raiz do repositório:
make setup
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e '.[test]'
set -a && . ../.env && set +a
uvicorn app.main:app --reload
```

Ou use `make api-dev` na raiz depois de instalar as dependências. A configuração e os segredos de desenvolvimento ficam no `.env` da raiz (ignorado pelo Git).

SQLite (`./tech_mentor.db`) is the development default, so health, settings, lessons, notes, and tests work without a PostgreSQL service. For preferred PostgreSQL persistence, set `DATABASE_URL=postgresql+asyncpg://...`; startup enables the `vector` extension and stores 384-dimensional feature-hash vectors in `pgvector`. The initial RAG uses those stored vectors together with token overlap; it does not call an embedding service. SQLite stores the same vectors as JSON.

If database initialization fails, `/api/health` remains available and reports `degraded`; routes requiring persistence return HTTP 503. Do not expose this unauthenticated MVP publicly. If running multiple API replicas, the credit polling loop currently runs once per replica and needs a distributed lock before scaling.

## Secrets and OpenRouter

- Set `FERNET_KEY` to a persistent Fernet key for the key-management endpoint. Generate one with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and keep it outside source control. Losing it makes stored credentials unreadable.
- `PUT /api/settings/openrouter-key` accepts `{ "api_key": "..." }`, validates the key using the credits endpoint, and stores only its Fernet-encrypted value. No response includes the key. An optional `OPENROUTER_API_KEY` environment secret is supported; a stored credential takes precedence.
- Never enable public access without authentication, HTTPS, and a deployment-specific secret policy. API/provider/database exception details are deliberately not logged.

## API surface

- `GET /api/health`
- `GET /api/models` — normalized catalogue, cached; returns `stale` and a recoverable `error` when serving stale data.
- `GET|PUT /api/settings`
- `PUT|DELETE /api/settings/openrouter-key`
- `GET /api/openrouter/credits` — last polling snapshot; background polling interval is configurable through settings and environment.
- `POST|GET /api/lessons`, `GET /api/lessons/{id}`, `GET|POST /api/lessons/{id}/feedback`
- `POST|GET /api/lessons/{id}/complements`, `POST /api/lessons/{id}/complements/{complement_id}/accept|reject`
- `POST|GET /api/notes`, `DELETE /api/notes/{id}`

Lesson generation validates the selected model against the current catalogue, then runs retrieval, OpenRouter generation, and structural validation as a LangGraph. Generated Markdown requires the six plan sections and a Mermaid block. Lessons and opted-in notes are persisted and indexed for later retrieval. Notes can be excluded from RAG with `include_in_rag: false`.

Lesson complements are generated through a separate retrieval/generation/validation LangGraph using the full current lesson content, the user prompt, and retrieved RAG context. Candidates persist as `pending`; they enter the lesson and are reindexed only after explicit acceptance. Rejected candidates remain persisted but are never indexed. The backend uses SQLAlchemy `create_all`: it creates the new complements table for existing databases, but does not migrate changes to existing table schemas. Use a versioned migration process for future schema alterations in deployed databases.

## Configuration

See `.env.example`. `CORS_ORIGINS` is a comma-separated list; defaults permit Vite at `localhost:5173` and `127.0.0.1:5173`. The configured credit polling minimum cannot be lower than 30 seconds; the default minimum is 60 seconds.

## Tests

```sh
pytest
```

The tests use temporary SQLite databases and mocked OpenRouter/LangGraph responses; they do not make paid or network calls.
