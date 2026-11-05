import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
import unicodedata
from urllib.parse import quote

from app.config import AppConfig


class OpenRouterError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class OpenRouterClient:
    def __init__(self, config: AppConfig) -> None:
        self.base_url = config.openrouter_base_url.rstrip("/")
        self.timeout = config.openrouter_timeout_seconds

    async def _get(self, path: str, api_key: str | None = None) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}{path}", headers=headers)
                if response.is_error:
                    if response.status_code == 401:
                        message = "OpenRouter rejected the API key."
                    elif response.status_code == 429:
                        message = "OpenRouter rate limit reached."
                    else:
                        message = f"OpenRouter request failed (HTTP {response.status_code})."
                    raise OpenRouterError(message, response.status_code)
                payload = response.json()
                if not isinstance(payload, dict):
                    raise OpenRouterError("OpenRouter returned an invalid response.")
                return payload
        except OpenRouterError:
            raise
        except (httpx.HTTPError, ValueError):
            raise OpenRouterError("Could not reach OpenRouter or decode its response.") from None

    async def list_models(self) -> list[dict[str, Any]]:
        payload = await self._get("/models")
        rows = payload.get("data")
        if not isinstance(rows, list):
            raise OpenRouterError("OpenRouter returned an invalid model catalogue.")
        return [normalized for row in rows if isinstance(row, dict) if (normalized := normalize_model(row))]

    async def fetch_credits(self, api_key: str) -> dict[str, Any]:
        payload = await self._get("/credits", api_key)
        data = payload.get("data")
        if not isinstance(data, dict):
            raise OpenRouterError("OpenRouter returned an invalid credits response.")
        return data


    async def create_batch(
        self,
        *,
        api_key: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        custom_id: str,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "endpoint": "/v1/chat/completions",
            "model": model,
        }
        if callback_url:
            body["callback_url"] = callback_url
        body["requests"] = [
            {
                "custom_id": custom_id,
                "body": {
                    "temperature": 0.3,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            }
        ]
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/batches",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=body,
                )
                if response.is_error:
                    if response.status_code == 401:
                        message = "OpenRouter rejected the API key."
                    elif response.status_code == 429:
                        message = "OpenRouter rate limit reached."
                    else:
                        message = f"OpenRouter request failed (HTTP {response.status_code})."
                    raise OpenRouterError(message, response.status_code)
                payload = response.json()
        except OpenRouterError:
            raise
        except (httpx.HTTPError, ValueError):
            raise OpenRouterError("Could not reach OpenRouter or decode its response.") from None

        batch = payload.get("data", payload) if isinstance(payload, dict) else None
        if not isinstance(batch, dict) or not isinstance(batch.get("id"), str):
            raise OpenRouterError("OpenRouter returned an invalid batch response.")
        return batch

    async def fetch_batch(self, batch_id: str, api_key: str) -> dict[str, Any]:
        payload = await self._get(f"/batches/{quote(batch_id, safe='')}", api_key)
        batch = payload.get("data", payload)
        if not isinstance(batch, dict):
            raise OpenRouterError("OpenRouter returned an invalid batch response.")
        return batch

    async def validate_key(self, api_key: str) -> None:
        await self.fetch_credits(api_key)


def normalize_model(row: dict[str, Any]) -> dict[str, Any] | None:
    model_id = row.get("id")
    if not isinstance(model_id, str) or not model_id:
        return None
    architecture = row.get("architecture")
    architecture = architecture if isinstance(architecture, dict) else {}
    input_modalities = architecture.get("input_modalities") or []
    output_modalities = architecture.get("output_modalities") or []
    supported_parameters = row.get("supported_parameters") or []
    pricing = row.get("pricing") or {}
    raw_context_length = row.get("context_length")
    return {
        "id": model_id,
        "name": str(row.get("name") or model_id),
        "context_length": raw_context_length if isinstance(raw_context_length, int) else None,
        "input_modalities": [str(value) for value in input_modalities if isinstance(value, str)],
        "output_modalities": [str(value) for value in output_modalities if isinstance(value, str)],
        "capabilities": [str(value) for value in supported_parameters if isinstance(value, str)],
        "pricing": {
            str(key): str(value)
            for key, value in pricing.items()
            if key in {"prompt", "completion"} and value is not None
        } if isinstance(pricing, dict) else {},
    }


def _model_sort_key(model: dict[str, Any]) -> tuple[str, str]:
    name = str(model.get("name") or model["id"])
    normalized_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return normalized_name.casefold(), str(model["id"]).casefold()


class ModelCatalog:
    def __init__(self, client: OpenRouterClient, ttl_seconds: int) -> None:
        self.client = client
        self.ttl_seconds = max(1, ttl_seconds)
        self._cached_models: list[dict[str, Any]] | None = None
        self._fetched_at: datetime | None = None
        self._lock = asyncio.Lock()

    async def get(self) -> dict[str, Any]:
        async with self._lock:
            now = datetime.now(timezone.utc)
            if (
                self._cached_models is not None
                and self._fetched_at is not None
                and (now - self._fetched_at).total_seconds() < self.ttl_seconds
            ):
                return {"data": self._cached_models, "fetched_at": self._fetched_at, "stale": False, "error": None}
            try:
                models = sorted(await self.client.list_models(), key=_model_sort_key)
                self._cached_models = models
                self._fetched_at = datetime.now(timezone.utc)
                return {"data": models, "fetched_at": self._fetched_at, "stale": False, "error": None}
            except OpenRouterError as exc:
                if self._cached_models is None or self._fetched_at is None:
                    raise
                return {
                    "data": self._cached_models,
                    "fetched_at": self._fetched_at,
                    "stale": True,
                    "error": str(exc),
                }
