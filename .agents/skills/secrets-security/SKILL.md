---
name: secrets-security
description: Proteger credenciais OpenRouter, configuração local, criptografia e logs do Tutor.
---

# Segurança de segredos

Use em código de credenciais e operação. Nunca inclua chaves em frontend, respostas, logs, fixtures, prompts ou Git. A chave persistida é cifrada com Fernet e `FERNET_KEY` externa/persistente; mantenha a chave cifradora separada do banco e documente backup/rotação. Não torne o MVP local público sem HTTPS e autenticação. Use somente segredos fictícios nos testes.
