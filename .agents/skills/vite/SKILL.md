---
name: vite
description: Configurar e validar desenvolvimento, proxy de API e build do frontend Vite.
---

# Vite

Use ao alterar `frontend/vite.config.ts`, variáveis públicas ou o build. Nunca coloque segredos em `VITE_*`, pois são embutidos no bundle. Preserve o proxy `/api` para o FastAPI em desenvolvimento e verifique o caminho do Nginx para produção. Valide com `npm --prefix frontend run build`.
