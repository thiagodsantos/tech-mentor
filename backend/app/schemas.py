from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class SettingsResponse(BaseModel):
    default_model: str | None
    credits_poll_interval_seconds: int
    study_preferences: dict[str, Any]
    openrouter_key_configured: bool
    updated_at: datetime


class SettingsUpdate(BaseModel):
    default_model: str | None = Field(default=None, max_length=255)
    credits_poll_interval_seconds: int | None = Field(default=None, ge=30, le=86400)
    study_preferences: dict[str, Any] | None = None


class OpenRouterKeyInput(BaseModel):
    api_key: SecretStr = Field(min_length=10, max_length=500)


class SecretStatusResponse(BaseModel):
    configured: bool
    message: str


class NormalizedModel(BaseModel):
    id: str
    name: str
    context_length: int | None = None
    input_modalities: list[str] = Field(default_factory=list)
    output_modalities: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    pricing: dict[str, str] = Field(default_factory=dict)


class ModelsResponse(BaseModel):
    data: list[NormalizedModel]
    fetched_at: datetime
    stale: bool = False
    error: str | None = None


class LessonRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    level: str = Field(default="iniciante", min_length=1, max_length=80)
    goal: str = Field(default="Entender o tema", min_length=1, max_length=500)
    model: str | None = Field(default=None, max_length=255)

    @staticmethod
    def clean(value: str) -> str:
        return value.strip()

    def model_post_init(self, __context: Any) -> None:
        self.topic = self.clean(self.topic)
        self.level = self.clean(self.level)
        self.goal = self.clean(self.goal)


class LessonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    topic: str
    level: str
    goal: str
    model: str
    content: str
    created_at: datetime
    sources: list[dict[str, Any]] = Field(default_factory=list)


class LessonComplementRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)

    @field_validator("prompt")
    @classmethod
    def clean_prompt(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Prompt must not be blank.")
        return cleaned


class LessonComplementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lesson_id: str
    prompt: str
    content: str
    status: Literal["pending", "accepted", "rejected"]
    created_at: datetime


class FeedbackInput(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class FeedbackResponse(BaseModel):
    id: int
    lesson_id: str
    rating: int
    comment: str | None
    created_at: datetime


class NoteInput(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=10000)
    lesson_id: str | None = None
    include_in_rag: bool = True

    def model_post_init(self, __context: Any) -> None:
        self.topic = self.topic.strip()
        self.content = self.content.strip()


class NoteResponse(BaseModel):
    id: str
    topic: str
    content: str
    lesson_id: str | None
    include_in_rag: bool
    created_at: datetime


class CreditsResponse(BaseModel):
    status: str
    credits: dict[str, Any] | None = None
    checked_at: datetime | None = None
    error: str | None = None
