---
name: postgresql
description: Alterar persistência SQLAlchemy e configurações PostgreSQL/SQLite do projeto.
---

# PostgreSQL

Use ao alterar `backend/app/models.py`, `database.py` ou Compose. Preserve SQLite para testes/dev e PostgreSQL no Compose. Use parâmetros SQLAlchemy e transações; não concatene entrada em SQL. Verifique impacto de schema no banco existente: `create_all` não versiona alterações. Rode testes backend e informe se PostgreSQL real não foi exercitado.
