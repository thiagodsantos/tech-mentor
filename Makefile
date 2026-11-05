.PHONY: setup up dev down logs status api-dev frontend-dev test test-backend test-frontend lint migrate keygen

setup:
	python3 scripts/init_env.py

up: setup
	docker compose up --build -d

dev: up

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

status:
	docker compose ps

api-dev: setup
	cd backend && set -a && . ../.env && set +a && python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-dev:
	npm --prefix frontend run dev

test: test-backend test-frontend

test-backend:
	cd backend && python3 -m pytest -q

test-frontend:
	npm --prefix frontend test

lint:
	npm --prefix frontend run typecheck
	python3 -m compileall -q backend/app

migrate: setup
	docker compose run --rm api python -m app.init_db

keygen:
	python3 -c 'import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'
