from datetime import datetime, timezone
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, Text, TypeDecorator, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIMENSIONS = 384


class EmbeddingVector(TypeDecorator[list[float]]):
    """Use pgvector in PostgreSQL and JSON for the local SQLite development mode."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(EMBEDDING_DIMENSIONS))
        return dialect.type_descriptor(JSON())


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AppSettings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    default_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    credits_poll_interval_seconds: Mapped[int] = mapped_column(Integer, default=300)
    study_preferences: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class StoredCredential(Base):
    __tablename__ = "provider_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    encrypted_secret: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class CreditSnapshot(Base):
    __tablename__ = "credit_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    credits: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)


class LessonRecord(Base):
    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    topic: Mapped[str] = mapped_column(String(200), index=True)
    level: Mapped[str] = mapped_column(String(80))
    goal: Mapped[str] = mapped_column(String(500))
    model: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    feedback: Mapped[list["FeedbackRecord"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")


class LessonComplementRecord(Base):
    __tablename__ = "lesson_complements"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'rejected')", name="ck_lesson_complement_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class FeedbackRecord(Base):
    __tablename__ = "lesson_feedback"
    __table_args__ = (UniqueConstraint("lesson_id", name="uq_feedback_per_lesson"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    lesson: Mapped[LessonRecord] = relationship(back_populates="feedback")


class NoteRecord(Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    topic: Mapped[str] = mapped_column(String(200), index=True)
    content: Mapped[str] = mapped_column(Text)
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)
    include_in_rag: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_type: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(EmbeddingVector())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
