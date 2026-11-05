---
name: markdown-rendering
description: Renderizar respostas Markdown e código sem XSS, com alternância Preview/Code.
---

# Markdown e código

Use ao alterar componentes de renderização em `frontend/src/components/`. Trate texto de LLM como não confiável; mantenha sanitização/allowlist, preserve fenced code e acessibilidade do controle Preview/Code. Syntax highlighting é visual: nunca execute exemplos. Cubra conteúdo normal e malicioso nos testes frontend.
