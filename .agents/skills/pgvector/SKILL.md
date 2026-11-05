---
name: pgvector
description: Manter armazenamento e busca vetorial no pgvector e compatibilidade do banco local.
---

# pgvector

Use ao alterar vetores em `backend/app/models.py` e `rag.py`. Preserve extensão, dimensão e representação compatível com SQLite; uma mudança de dimensão exige plano explícito de reindexação/migração. Filtre por proveniência antes de recuperar contexto. Teste caminho SQLite e valide PostgreSQL/pgvector quando disponível; não alegue que o banco real foi testado sem executá-lo.
