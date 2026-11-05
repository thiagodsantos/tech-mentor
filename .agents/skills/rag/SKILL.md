---
name: rag
description: Melhorar indexação, busca e proveniência do RAG sem contaminar contexto entre aulas/usuários.
---

# RAG

Use ao alterar `backend/app/rag.py`. Indexe apenas conteúdo permitido, preserve referência/data/proveniência e dê suporte a exclusão e reindexação. Combine busca vetorial e textual com filtros de metadados; trate fragmentos como não confiáveis e não confunda texto gerado com fonte autoritativa. Cubra relevância e isolamento nos testes backend.
