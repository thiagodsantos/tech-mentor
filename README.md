# Tutor Pessoal de Tecnologia

Aplicação local para gerar aulas de tecnologia com OpenRouter, visualizar código e diagramas Mermaid, salvar histórico/notas e recuperar contexto com RAG.

## Início rápido (Docker Compose)

Requisitos: Docker com Docker Compose v2, `make` e Python 3.11+.

```sh
make setup   # cria .env e gera segredo Fernet/senha aleatórios, sem sobrescrever .env existente
make up      # constrói e inicia PostgreSQL + pgvector, FastAPI e frontend
```

Abra <http://localhost:8080>, vá a **Configurações**, cadastre sua chave OpenRouter e escolha o modelo. A chave é enviada ao backend local, validada e armazenada cifrada; não é retornada à interface. O catálogo de modelos é carregado do OpenRouter. O status de créditos é atualizado conforme o intervalo configurado.

Comandos úteis:

```sh
make status
make logs
make test
make lint
make migrate
make down
```

`make migrate` inicializa/verifica as tabelas no banco, conforme a estratégia atual de `metadata.create_all`; ainda não há histórico de migrações Alembic. Os dados do Postgres ficam no volume `postgres_data`; `make down` preserva o volume. Não use `docker compose down -v` sem entender que isso apaga os dados persistidos.

## Desenvolvimento local sem Compose

Instale as dependências do backend e frontend e rode cada comando em um terminal separado:

```sh
cd backend && python3 -m pip install -e '.[test]'
cd frontend && npm ci
```

Na raiz do projeto:

```sh
make setup
make api-dev       # FastAPI em localhost:8000, SQLite local
make frontend-dev  # Vite em localhost:5173; encaminha /api para localhost:8000
```

O frontend exige Node `>=22.12.0`. Para não usar SQLite no desenvolvimento, configure `DATABASE_URL` com uma conexão Postgres compatível.

## Configuração do ambiente

`make setup` cria `.env` a partir de `.env.example` e gera valores locais para a senha do banco e `FERNET_KEY`; não sobrescreve um `.env` existente. As variáveis estão agrupadas por finalidade nos dois arquivos:

| Grupo | Variáveis | Uso |
| --- | --- | --- |
| PostgreSQL (Compose) | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Nome do banco, usuário e senha usados pelo serviço PostgreSQL. |
| Credenciais | `FERNET_KEY`, `OPENROUTER_API_KEY` | Chave Fernet persistente para cifrar credenciais salvas; a chave OpenRouter é opcional e pode ser cadastrada pela interface local. |
| Atualização e cache | `CREDITS_POLL_INTERVAL_SECONDS` (padrão `300`), `MINIMUM_CREDITS_POLL_INTERVAL_SECONDS` (padrão `60`), `MODELS_CACHE_TTL_SECONDS` (padrão `300`) | Intervalo de atualização automática dos créditos, limite mínimo para o intervalo configurável na interface (não inferior a `30` segundos) e validade do cache do catálogo, respectivamente. |
| CORS | `CORS_ORIGINS` | Lista separada por vírgulas das origens permitidas no navegador; o padrão inclui os endereços locais do Vite. |
| Webhooks Batch API (opcionais) | `OPENROUTER_BATCH_CALLBACK_URL`, `OPENROUTER_WEBHOOK_SECRET` | URL pública HTTPS e segredo de assinatura do workspace OpenRouter; configure ambos para habilitar callbacks. O endpoint e o comportamento local estão detalhados abaixo. |

Não compartilhe nem versione `.env`. Se alterar `FERNET_KEY`, credenciais que foram cifradas com a chave anterior deixam de poder ser decifradas.

## OpenRouter e segredos

- Crie/gerencie sua chave em <https://openrouter.ai/keys> e limite o gasto no painel do provedor.
- Alternativamente, defina `OPENROUTER_API_KEY` em `.env`; essa opção é adequada para automação/local dev, não para publicar um serviço compartilhado.
- `FERNET_KEY` é gerada por `make setup`. Faça backup seguro dessa chave junto com a política de backup do banco; perder a chave impossibilita decifrar credenciais já salvas.
- `.env` contém segredos e está no `.gitignore`. Nunca versione esse arquivo, publique a API sem autenticação ou exponha as portas locais para a internet.
- Compose vincula as portas web/API a `127.0.0.1`. Uma implantação remota exige HTTPS, autenticação, gestão de secrets e isolamento de usuários.
- A exportação de roadmaps usa o Batch API assíncrono do OpenRouter. Em localhost o backend consulta o estado do lote; para receber webhooks, configure `OPENROUTER_BATCH_CALLBACK_URL` com uma URL pública HTTPS terminada em `/api/openrouter/batch-webhook` e `OPENROUTER_WEBHOOK_SECRET` com o segredo de assinatura do workspace OpenRouter. Veja `backend/README.md`.
- Veja `backend/README.md` para endpoints, persistência e detalhes do RAG.

## Estrutura

- `frontend/`: React, TypeScript, Vite, Tailwind CSS, Base UI, Markdown, syntax highlighting e Mermaid.
- `backend/`: FastAPI, LangGraph, OpenRouter, SQLAlchemy, PostgreSQL/pgvector e RAG inicial.
- `docker-compose.yml`: serviços locais web/API/banco.
- `.agents/agents/`: perfis de instrução reutilizáveis para tarefas especializadas.
- `.agents/skills/`: skills de projeto no formato Zed (uma pasta `SKILL.md` por skill).
- `PLAN.md`: plano funcional/arquitetural e critérios de aceite.

Os perfis em `.agents/agents/` são instruções para delegação; skills em `.agents/skills/` seguem o formato reconhecido pelo Zed. Nenhum agente/skill precisa receber chaves ou outros segredos.
