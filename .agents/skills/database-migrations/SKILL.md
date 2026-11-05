---
name: database-migrations
description: Gerenciar alterações de schema e migrações sem perder dados persistidos.
---

# Schema e migrações

Use ao alterar modelos ou schema. O MVP usa `metadata.create_all` e ainda não tem Alembic; isso não aplica alterações complexas a tabelas existentes. Para mudanças incompatíveis, crie migrações versionadas, plano de backup/rollback e testes antes de produção. Não descreva `make migrate` como sistema de migrações versionadas enquanto Alembic não estiver instalado.
