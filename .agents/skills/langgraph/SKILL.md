---
name: langgraph
description: Evoluir o grafo LangGraph de recuperação, geração, validação e persistência de aulas.
---

# LangGraph

Use ao alterar `backend/app/lesson_graph.py`. Mantenha estado e transições explícitos; separe recuperação, chamada do modelo e validação; propague erros de provider sem perder contexto. Persistência/checkpoints não devem misturar usuários. Cubra caminhos de sucesso e falha com modelos simulados em `backend/tests/`.
