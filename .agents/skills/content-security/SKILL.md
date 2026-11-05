---
name: content-security
description: Revisar XSS, HTML, SVG, URLs e conteúdo externo exibido em aulas geradas.
---

# Segurança de conteúdo

Use em Markdown, Mermaid, links e referências. Considere toda saída de modelo e conteúdo RAG não confiáveis; sanitize antes de inserir no DOM, permita apenas protocolos de URL esperados e não renderize HTML bruto sem sanitização. Não execute código e não permita acesso remoto arbitrário pelo renderer. Adicione casos maliciosos aos testes.
