---
name: openrouter-api
description: Integrar catálogo, créditos e geração de LLM pela API OpenRouter com cache e tratamento de falhas.
---

# OpenRouter API

Use ao alterar `backend/app/openrouter.py` e seus consumidores. Use o catálogo dinâmico `/models`, créditos autenticados `/credits` e endpoint de chat configurado; não fixe lista/preços nem assuma capacidade de modelo. Defina timeout, normalize respostas e traduza 401/429 sem expor headers. Teste com `httpx` mockado, nunca com chave real ou chamadas pagas. Documentação: <https://openrouter.ai/docs>.
