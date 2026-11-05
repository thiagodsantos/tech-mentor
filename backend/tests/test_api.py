import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from pydantic import SecretStr
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.config import AppConfig
from app.lesson_graph import LessonGenerationError, build_complement_graph, build_lesson_graph
from app.main import create_app, poll_credits_once
from app.models import (
    KnowledgeChunk,
    LessonComplementRecord,
    LessonRecord,
    StoredCredential,
    utc_now,
)
from app.openrouter import OpenRouterClient, OpenRouterError, normalize_model
from app.rag import index_source


LESSON_MARKDOWN = """## Introdução
Conceito e vocabulário.

## Para que é utilizado
Casos de uso.

## Como é utilizado
Exemplo progressivo.

## Diagrama
```mermaid
graph TD
    A[Início] --> B[Fim]
```

## Referências para aprofundar
Sugestões não verificadas: pesquise a documentação oficial.

## Resumo e próximos passos
Resumo e próximo estudo.
"""


class FakeOpenRouter:
    def __init__(self) -> None:
        self.model_calls = 0
        self.fail_models = False
        self.validated_keys: list[str] = []
        self.batch_calls: list[dict[str, Any]] = []
        self.batch_response: dict[str, Any] = {"id": "batch-roadmap", "status": "validating"}

    async def list_models(self) -> list[dict[str, Any]]:
        self.model_calls += 1
        if self.fail_models:
            raise OpenRouterError("OpenRouter request failed (HTTP 503).", 503)
        return [
            {
                "id": "openai/gpt-test",
                "name": "Test model",
                "context_length": 32000,
                "input_modalities": ["text"],
                "output_modalities": ["text"],
                "capabilities": ["tools"],
                "pricing": {"prompt": "0", "completion": "0"},
            },
            {
                "id": "provider/alpha",
                "name": "Alpha model",
                "context_length": 32000,
                "input_modalities": ["text"],
                "output_modalities": ["text"],
                "capabilities": [],
                "pricing": {"prompt": "0", "completion": "0"},
            },
        ]

    async def validate_key(self, api_key: str) -> None:
        self.validated_keys.append(api_key)

    async def fetch_credits(self, api_key: str) -> dict[str, Any]:
        return {"total_credits": 10, "total_usage": 2}


    async def create_batch(self, **kwargs: Any) -> dict[str, Any]:
        self.batch_calls.append(kwargs)
        return {"id": "batch-roadmap", "status": "validating"}

    async def fetch_batch(self, batch_id: str, api_key: str) -> dict[str, Any]:
        assert batch_id == "batch-roadmap"
        return self.batch_response


@pytest_asyncio.fixture
async def api(tmp_path):
    config = AppConfig(
        _env_file=None,
        app_env="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'test.db'}",
        fernet_key=Fernet.generate_key().decode("ascii"),
        openrouter_api_key=None,
        models_cache_ttl_seconds=1,
        credits_poll_interval_seconds=3600,
        minimum_credits_poll_interval_seconds=60,
        cors_origins=["http://localhost:5173"],
    )
    provider = FakeOpenRouter()
    app = create_app(config, openrouter_client=provider)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, app, provider


@pytest.mark.asyncio
async def test_health_and_model_catalog_cache_and_stale_fallback(api):
    client, app, provider = api
    health = await client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["database"] == "available"

    first = await client.get("/api/models")
    assert first.status_code == 200
    assert [model["name"] for model in first.json()["data"]] == ["Alpha model", "Test model"]
    second = await client.get("/api/models")
    assert second.json()["stale"] is False
    assert provider.model_calls == 1

    app.state.catalog._fetched_at = datetime.now(timezone.utc) - timedelta(seconds=3)
    provider.fail_models = True
    stale = await client.get("/api/models")
    assert stale.status_code == 200
    assert stale.json()["stale"] is True
    assert "temporarily" not in stale.json()["error"]
    assert [model["name"] for model in stale.json()["data"]] == ["Alpha model", "Test model"]


def test_normalize_openrouter_model_metadata():
    normalized = normalize_model(
        {
            "id": "provider/model",
            "name": "Model",
            "context_length": 1000,
            "architecture": {"input_modalities": ["text", "image"], "output_modalities": ["text"]},
            "supported_parameters": ["tools"],
            "pricing": {"prompt": 0.1, "completion": 0.2, "request": "ignored"},
        }
    )
    assert normalized == {
        "id": "provider/model",
        "name": "Model",
        "context_length": 1000,
        "input_modalities": ["text", "image"],
        "output_modalities": ["text"],
        "capabilities": ["tools"],
        "pricing": {"prompt": "0.1", "completion": "0.2"},
    }


@pytest.mark.asyncio
async def test_key_is_validated_encrypted_and_never_returned(api):
    client, app, provider = api
    secret = "sk-test-secret-never-return"
    response = await client.put("/api/settings/openrouter-key", json={"api_key": secret})
    assert response.status_code == 200
    assert secret not in response.text
    assert provider.validated_keys == [secret]

    settings = await client.get("/api/settings")
    assert settings.status_code == 200
    assert settings.json()["openrouter_key_configured"] is True
    assert secret not in settings.text

    async with app.state.database.session_factory() as session:
        result = await session.execute(select(StoredCredential).where(StoredCredential.id == 1))
        credential = result.scalar_one()
    assert secret not in credential.encrypted_secret
    assert Fernet(app.state.config.fernet_key.encode()).decrypt(
        credential.encrypted_secret.encode()
    ).decode() == secret

    await poll_credits_once(app)
    credits = await client.get("/api/openrouter/credits")
    assert credits.json()["status"] == "ok"
    assert credits.json()["credits"]["total_credits"] == 10

    removed = await client.delete("/api/settings/openrouter-key")
    assert removed.status_code == 200
    assert removed.json()["configured"] is False


@pytest.mark.asyncio
async def test_lesson_feedback_and_notes_are_persisted(api, monkeypatch):
    client, app, provider = api

    class FakeGraph:
        async def ainvoke(self, state):
            return {
                "content": LESSON_MARKDOWN,
                "sources": [{"type": "note", "id": "existing", "title": "Saved note"}],
            }

    monkeypatch.setattr("app.main.build_lesson_graph", lambda *args, **kwargs: FakeGraph())

    assert (await client.put("/api/settings/openrouter-key", json={"api_key": "sk-test-lesson"})).status_code == 200
    settings = await client.put(
        "/api/settings", json={"default_model": "openai/gpt-test", "credits_poll_interval_seconds": 120}
    )
    assert settings.status_code == 200
    assert settings.json()["credits_poll_interval_seconds"] == 120

    generated = await client.post(
        "/api/lessons",
        json={"topic": "Async Python", "level": "intermediate", "goal": "Understand tasks"},
    )
    assert generated.status_code == 201, generated.text
    lesson = generated.json()
    assert set(lesson) == {"id", "topic", "level", "goal", "model", "content", "created_at", "sources"}
    assert lesson["model"] == "openai/gpt-test"
    assert lesson["content"] == LESSON_MARKDOWN
    assert lesson["sources"][0]["title"] == "Saved note"

    history = await client.get("/api/lessons")
    detail = await client.get(f"/api/lessons/{lesson['id']}")
    assert len(history.json()) == 1
    assert detail.json()["id"] == lesson["id"]

    assert (await client.get(f"/api/lessons/{lesson['id']}/feedback")).json() is None
    feedback = await client.post(
        f"/api/lessons/{lesson['id']}/feedback", json={"rating": 5, "comment": "Helpful"}
    )
    assert feedback.status_code == 201
    assert feedback.json()["rating"] == 5
    saved_feedback = await client.get(f"/api/lessons/{lesson['id']}/feedback")
    assert saved_feedback.status_code == 200
    assert saved_feedback.json()["comment"] == "Helpful"
    duplicate = await client.post(f"/api/lessons/{lesson['id']}/feedback", json={"rating": 4})
    assert duplicate.status_code == 409

    note = await client.post(
        "/api/notes",
        json={"topic": "Async Python", "content": "Remember to await tasks", "lesson_id": lesson["id"]},
    )
    assert note.status_code == 201
    assert len((await client.get("/api/notes")).json()) == 1
    assert (await client.delete(f"/api/notes/{note.json()['id']}")).status_code == 204
    assert (await client.get("/api/notes")).json() == []


@pytest.mark.asyncio
async def test_roadmap_uses_lesson_and_every_complement_with_selected_model(api):
    client, app, provider = api
    lesson = LessonRecord(
        id="lesson-roadmap",
        topic="Python",
        level="beginner",
        goal="Learn Python",
        model="openai/gpt-test",
        content="Fundamentos da linguagem.",
        sources=[],
        created_at=utc_now(),
    )
    async with app.state.database.session_factory() as session:
        session.add(lesson)
        session.add_all([
            LessonComplementRecord(
                id="complement-accepted", lesson_id=lesson.id, prompt="Exemplo de funções",
                content="Funções encapsulam comportamentos.", status="accepted", created_at=utc_now(),
            ),
            LessonComplementRecord(
                id="complement-rejected", lesson_id=lesson.id, prompt="Analogia de listas",
                content="Listas armazenam sequências.", status="rejected", created_at=utc_now(),
            ),
        ])
        await session.commit()

    response = await client.post(f"/api/lessons/{lesson.id}/roadmap", json={"model": "provider/alpha"})
    assert response.status_code == 409
    assert provider.batch_calls == []

    await client.put("/api/settings/openrouter-key", json={"api_key": "sk-test-roadmap"})
    response = await client.post(f"/api/lessons/{lesson.id}/roadmap", json={"model": "provider/alpha"})
    assert response.status_code == 202, response.text
    generation_id = response.json()["id"]
    assert response.json()["status"] == "pending"
    assert len(provider.batch_calls) == 1
    call = provider.batch_calls[0]
    assert call["api_key"] == "sk-test-roadmap"
    assert call["model"] == "provider/alpha"
    assert call["callback_url"] is None
    assert "Fundamentos da linguagem." in call["user_prompt"]
    assert "Funções encapsulam comportamentos." in call["user_prompt"]
    assert "Listas armazenam sequências." in call["user_prompt"]
    assert '"status": "rejected"' in call["user_prompt"]
    assert "dado não confiável" in call["system_prompt"]

    pending = await client.get(f"/api/roadmaps/{generation_id}")
    assert pending.json()["status"] == "pending"
    provider.batch_response = {
        "id": "batch-roadmap",
        "status": "completed",
        "results": [{
            "custom_id": generation_id,
            "response": {"body": {"choices": [{"message": {"content": "# Roadmap concluído"}}]}},
        }],
    }
    completed = await client.get(f"/api/roadmaps/{generation_id}")
    assert completed.json()["status"] == "completed"
    assert completed.json()["content"] == "# Roadmap concluído"

    unavailable = await client.post(f"/api/lessons/{lesson.id}/roadmap", json={"model": "missing/model"})
    assert unavailable.status_code == 422


@pytest.mark.asyncio
async def test_openrouter_batch_webhook_verifies_signature_and_saves_response(api):
    client, app, provider = api
    app.state.config.openrouter_batch_callback_url = "https://public.example.test/api/openrouter/batch-webhook"
    app.state.config.openrouter_webhook_secret = SecretStr("webhook-test-secret")
    await client.put("/api/settings/openrouter-key", json={"api_key": "sk-test-webhook"})
    async with app.state.database.session_factory() as session:
        session.add(LessonRecord(
            id="lesson-webhook", topic="Python", level="beginner", goal="Learn",
            model="openai/gpt-test", content="Basics", sources=[], created_at=utc_now(),
        ))
        await session.commit()

    submitted = await client.post("/api/lessons/lesson-webhook/roadmap", json={"model": "provider/alpha"})
    assert submitted.status_code == 202
    assert provider.batch_calls[-1]["callback_url"] == app.state.config.openrouter_batch_callback_url
    generation_id = submitted.json()["id"]
    provider.batch_response = {
        "id": "batch-roadmap",
        "status": "completed",
        "results": [{
            "custom_id": generation_id,
            "response": {"body": {"choices": [{"message": {"content": "# Webhook roadmap"}}]}},
        }],
    }

    event_body = json.dumps({
        "id": "event-roadmap-1", "type": "batch.completed", "data": {"id": "batch-roadmap"}
    }).encode()
    timestamp = str(int(datetime.now(timezone.utc).timestamp()))
    signature = hmac.new(
        b"webhook-test-secret", timestamp.encode() + b"," + event_body, hashlib.sha256
    ).hexdigest()
    headers = {"X-OpenRouter-Signature": f"t={timestamp},v1={signature}"}
    webhook = await client.post("/api/openrouter/batch-webhook", content=event_body, headers=headers)
    assert webhook.status_code == 204
    repeated = await client.post("/api/openrouter/batch-webhook", content=event_body, headers=headers)
    assert repeated.status_code == 204
    result = await client.get(f"/api/roadmaps/{generation_id}")
    assert result.json()["status"] == "completed"
    assert result.json()["content"] == "# Webhook roadmap"

    invalid = await client.post(
        "/api/openrouter/batch-webhook", content=event_body,
        headers={"X-OpenRouter-Signature": "t=1,v1=invalid"},
    )
    assert invalid.status_code == 401


@pytest.mark.asyncio
async def test_openrouter_batch_submission_uses_mocked_httpx(monkeypatch):
    captured: dict[str, Any] = {}

    class MockResponse:
        status_code = 202
        is_error = False

        def json(self):
            return {"id": "batch-test", "status": "validating"}

    class MockAsyncClient:
        def __init__(self, *, timeout):
            assert timeout > 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, body=json)
            return MockResponse()

    monkeypatch.setattr("app.openrouter.httpx.AsyncClient", MockAsyncClient)
    provider = OpenRouterClient(AppConfig(_env_file=None, openrouter_base_url="https://router.test/api/v1"))
    result = await provider.create_batch(
        api_key="mock-secret", model="provider/model", system_prompt="system",
        user_prompt="user", custom_id="roadmap-1", callback_url="https://app.example.test/webhook",
    )
    assert result["id"] == "batch-test"
    assert captured["url"] == "https://router.test/api/v1/batches"
    assert captured["headers"] == {"Authorization": "Bearer mock-secret"}
    assert captured["body"]["model"] == "provider/model"
    assert captured["body"]["endpoint"] == "/v1/chat/completions"
    assert captured["body"]["callback_url"] == "https://app.example.test/webhook"
    request = captured["body"]["requests"][0]
    assert request["custom_id"] == "roadmap-1"
    assert request["body"]["messages"] == [
        {"role": "system", "content": "system"}, {"role": "user", "content": "user"}
    ]


@pytest.mark.asyncio
async def test_langgraph_retrieves_context_and_validates_output(api, monkeypatch):
    _, app, _ = api

    class FakeLLM:
        def __init__(self, **kwargs):
            self.model = kwargs["model"]

        async def ainvoke(self, prompt):
            assert "Contexto pessoal recuperado" in prompt
            return type("LLMResponse", (), {"content": LESSON_MARKDOWN})()

    monkeypatch.setattr("app.lesson_graph.ChatOpenAI", FakeLLM)
    async with app.state.database.session_factory() as session:
        await index_source(
            session,
            source_type="note",
            source_id="note-1",
            title="Async Python",
            content="Async tasks use await and an event loop.",
        )
        await session.commit()
        graph = build_lesson_graph(
            session,
            config=app.state.config,
            api_key="mocked-only",
        )
        result = await graph.ainvoke(
            {"topic": "Async Python", "level": "intermediate", "goal": "Understand tasks", "model": "mock/model"}
        )
    assert result["content"] == LESSON_MARKDOWN.strip()
    assert result["sources"][0]["id"] == "note-1"


def test_cors_origins_accept_comma_separated_configuration():
    config = AppConfig(_env_file=None, cors_origins="http://localhost:5173,http://localhost:3000")
    assert config.cors_origins == ["http://localhost:5173", "http://localhost:3000"]
    assert AppConfig(_env_file=None, openrouter_batch_callback_url="").openrouter_batch_callback_url is None


@pytest.mark.asyncio
async def test_lesson_rejects_unavailable_model(api):
    client, _, _ = api
    await client.put("/api/settings/openrouter-key", json={"api_key": "sk-test-lesson"})
    response = await client.post(
        "/api/lessons",
        json={"topic": "Python", "level": "beginner", "goal": "Learn", "model": "missing/model"},
    )
    assert response.status_code == 422
    assert "not currently available" in response.json()["detail"]


@pytest.mark.asyncio
async def test_complement_graph_uses_full_lesson_and_retrieved_context(api, monkeypatch):
    _, app, _ = api
    captured: dict[str, str] = {}
    lesson_content = "Aula integral: explicação original.\n\nSeção final completa."
    requested_prompt = "Explique uma aplicação prática adicional."

    class FakeLLM:
        def __init__(self, **kwargs):
            assert kwargs["model"] == "mock/complement-model"

        async def ainvoke(self, prompt):
            captured["prompt"] = prompt
            return type("LLMResponse", (), {"content": "### Aplicação prática\nExemplo complementar."})()

    monkeypatch.setattr("app.lesson_graph.ChatOpenAI", FakeLLM)
    async with app.state.database.session_factory() as session:
        await index_source(
            session,
            source_type="note",
            source_id="complement-rag-note",
            title="Aplicações práticas",
            content="Uma aplicação prática adicional demonstra o conceito com um exemplo concreto.",
        )
        await session.commit()
        graph = build_complement_graph(session, config=app.state.config, api_key="mocked-only")
        result = await graph.ainvoke(
            {
                "topic": "Aplicações práticas",
                "prompt": requested_prompt,
                "lesson_content": lesson_content,
                "model": "mock/complement-model",
            }
        )
        assert result["sources"][0]["id"] == "complement-rag-note"

        class EmptyLLM:
            def __init__(self, **kwargs):
                pass

            async def ainvoke(self, prompt):
                return type("LLMResponse", (), {"content": "  "})()

        monkeypatch.setattr("app.lesson_graph.ChatOpenAI", EmptyLLM)
        invalid_graph = build_complement_graph(session, config=app.state.config, api_key="mocked-only")
        with pytest.raises(LessonGenerationError, match="empty"):
            await invalid_graph.ainvoke(
                {
                    "topic": "Aplicações práticas",
                    "prompt": requested_prompt,
                    "lesson_content": lesson_content,
                    "model": "mock/complement-model",
                }
            )

    materials_json = captured["prompt"].split("Dados de referência:\n", 1)[1].split(
        "\n\nRetorne apenas", 1
    )[0]
    materials = json.loads(materials_json)
    assert materials["user_request"] == requested_prompt
    assert materials["current_lesson_full_content"] == lesson_content
    assert materials["retrieved_rag_context"][0]["content"].startswith("Uma aplicação prática")
    assert result["content"] == "### Aplicação prática\nExemplo complementar."


@pytest.mark.asyncio
async def test_lesson_complement_accept_reject_and_idempotency(api, monkeypatch):
    client, app, _ = api
    assert (await client.put(
        "/api/settings/openrouter-key", json={"api_key": "sk-test-complement"}
    )).status_code == 200

    original_content = "Aula original integral e sem alterações."
    second_original = "Outra aula que não pode receber este complemento."
    async with app.state.database.session_factory() as session:
        for lesson_id, content in (
            ("lesson-complement", original_content),
            ("other-complement-lesson", second_original),
        ):
            lesson = LessonRecord(
                id=lesson_id,
                topic="Async Python",
                level="intermediate",
                goal="Understand tasks",
                model="mock/model",
                content=content,
                sources=[],
                created_at=utc_now(),
            )
            session.add(lesson)
            await index_source(
                session, source_type="lesson", source_id=lesson_id, title=lesson.topic, content=content
            )
        await session.commit()

    graph_states: list[dict[str, str]] = []

    class FakeGraph:
        async def ainvoke(self, state):
            graph_states.append(dict(state))
            return {"content": f"Complemento gerado para: {state['prompt']}"}

    monkeypatch.setattr("app.main.build_complement_graph", lambda *args, **kwargs: FakeGraph())
    endpoint = "/api/lessons/lesson-complement/complements"
    rejected = await client.post(endpoint, json={"prompt": "Explique um detalhe extra"})
    assert rejected.status_code == 201, rejected.text
    rejected_candidate = rejected.json()
    assert set(rejected_candidate) == {"id", "lesson_id", "prompt", "content", "status", "created_at"}
    assert rejected_candidate["status"] == "pending"
    assert graph_states[-1]["lesson_content"] == original_content
    assert graph_states[-1]["prompt"] == "Explique um detalhe extra"

    listed = await client.get(endpoint)
    assert [item["id"] for item in listed.json()] == [rejected_candidate["id"]]
    assert listed.json()[0]["status"] == "pending"
    async with app.state.database.session_factory() as session:
        chunks_before_rejection = list(
            (await session.execute(
                select(KnowledgeChunk).where(KnowledgeChunk.source_id == "lesson-complement")
            )).scalars().all()
        )
        assert all("Complemento gerado" not in chunk.content for chunk in chunks_before_rejection)

    rejected_response = await client.post(
        f"{endpoint}/{rejected_candidate['id']}/reject", json={}
    )
    assert rejected_response.status_code == 200
    assert rejected_response.json()["status"] == "rejected"
    assert (await client.post(f"{endpoint}/{rejected_candidate['id']}/reject")).json()["status"] == "rejected"
    assert (await client.post(f"{endpoint}/{rejected_candidate['id']}/accept")).status_code == 409
    assert (await client.get(f"/api/lessons/lesson-complement")).json()["content"] == original_content

    accepted = await client.post(endpoint, json={"prompt": "Acrescente um conceito muito específico"})
    assert accepted.status_code == 201, accepted.text
    accepted_candidate = accepted.json()
    accepted_response = await client.post(f"{endpoint}/{accepted_candidate['id']}/accept")
    assert accepted_response.status_code == 200, accepted_response.text
    updated_content = (
        f"{original_content}\n\n## Complemento\n\n"
        "Complemento gerado para: Acrescente um conceito muito específico"
    )
    assert accepted_response.json()["content"] == updated_content

    repeated_accept = await client.post(f"{endpoint}/{accepted_candidate['id']}/accept")
    assert repeated_accept.status_code == 200
    assert repeated_accept.json()["content"] == updated_content
    assert (await client.post(f"{endpoint}/{accepted_candidate['id']}/reject")).status_code == 409
    assert (await client.get(endpoint)).json()[1]["status"] == "accepted"

    async with app.state.database.session_factory() as session:
        indexed_chunks = list(
            (await session.execute(
                select(KnowledgeChunk).where(KnowledgeChunk.source_id == "lesson-complement")
            )).scalars().all()
        )
        assert indexed_chunks
        assert any("Complemento gerado para: Acrescente" in chunk.content for chunk in indexed_chunks)

    wrong_lesson = await client.post(
        f"/api/lessons/other-complement-lesson/complements/{accepted_candidate['id']}/accept"
    )
    assert wrong_lesson.status_code == 404
    assert (await client.post(endpoint, json={"prompt": "   "})).status_code == 422
