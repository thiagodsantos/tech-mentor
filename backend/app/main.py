import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AppConfig, get_config
from app.database import Database
from app.lesson_graph import LessonGenerationError, build_complement_graph, build_lesson_graph
from app.models import (
    AppSettings,
    CreditSnapshot,
    FeedbackRecord,
    KnowledgeChunk,
    LessonComplementRecord,
    LessonRecord,
    NoteRecord,
    utc_now,
)
from app.openrouter import ModelCatalog, OpenRouterClient, OpenRouterError
from app.rag import index_source
from app.schemas import (
    CreditsResponse,
    FeedbackInput,
    FeedbackResponse,
    LessonComplementRequest,
    LessonComplementResponse,
    LessonRequest,
    LessonResponse,
    ModelsResponse,
    NoteInput,
    NoteResponse,
    OpenRouterKeyInput,
    SecretStatusResponse,
    SettingsResponse,
    SettingsUpdate,
)
from app.security import (
    CredentialConfigurationError,
    credential_is_configured,
    delete_api_key,
    get_api_key,
    store_api_key,
)

logger = logging.getLogger(__name__)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    database: Database = request.app.state.database
    if not database.available:
        raise HTTPException(status_code=503, detail="Persistent storage is unavailable.")
    async with database.session_factory() as session:
        yield session


async def get_or_create_settings(session: AsyncSession, config: AppConfig) -> AppSettings:
    result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = AppSettings(
            id=1,
            credits_poll_interval_seconds=config.credits_poll_interval_seconds,
            study_preferences={},
        )
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
    return settings


async def poll_credits_once(app: FastAPI) -> None:
    database: Database = app.state.database
    if not database.available:
        return
    async with database.session_factory() as session:
        api_key = await get_api_key(session, app.state.config)
        result = await session.execute(select(CreditSnapshot).where(CreditSnapshot.id == 1))
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            snapshot = CreditSnapshot(id=1, status="pending")
            session.add(snapshot)
        if not api_key:
            snapshot.status = "unconfigured"
            snapshot.credits = None
            snapshot.checked_at = None
            snapshot.error = "OpenRouter API key is not configured."
            await session.commit()
            return
        try:
            credits = await app.state.openrouter.fetch_credits(api_key)
            snapshot.status = "ok"
            snapshot.credits = credits
            snapshot.checked_at = utc_now()
            snapshot.error = None
        except OpenRouterError as exc:
            snapshot.status = "error"
            snapshot.credits = None
            snapshot.checked_at = utc_now()
            snapshot.error = str(exc)
        await session.commit()


async def credit_polling_loop(app: FastAPI, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await poll_credits_once(app)
        except Exception:
            # Never include exception details here: database/provider errors can contain secrets.
            logger.warning("Credits polling failed; the last snapshot remains available.")
        interval = app.state.config.credits_poll_interval_seconds
        if app.state.database.available:
            async with app.state.database.session_factory() as session:
                try:
                    result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
                    settings = result.scalar_one_or_none()
                    if settings is not None:
                        interval = max(
                            app.state.config.minimum_credits_poll_interval_seconds,
                            settings.credits_poll_interval_seconds,
                        )
                except Exception:
                    logger.warning("Could not read credits polling interval; using the configured default.")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            continue



def create_app(
    config: AppConfig | None = None,
    openrouter_client: OpenRouterClient | None = None,
) -> FastAPI:
    app_config = config or get_config()
    database = Database(app_config.database_url)
    provider = openrouter_client or OpenRouterClient(app_config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            await database.initialize()
        except Exception:
            # Do not log exception text: a configured database URL may contain credentials.
            database.available = False
            logger.warning("Database initialization failed; persistent API routes are disabled.")
        app.state.poll_stop = asyncio.Event()
        app.state.credits_task = None
        if database.available:
            app.state.credits_task = asyncio.create_task(
                credit_polling_loop(app, app.state.poll_stop), name="openrouter-credits-poller"
            )
        try:
            yield
        finally:
            app.state.poll_stop.set()
            task = app.state.credits_task
            if task is not None:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            await database.close()

    app = FastAPI(title="Tech Mentor API", version="0.1.0", lifespan=lifespan)
    app.state.config = app_config
    app.state.database = database
    app.state.openrouter = provider
    app.state.catalog = ModelCatalog(provider, app_config.models_cache_ttl_seconds)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_config.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health(request: Request) -> dict[str, str]:
        available = request.app.state.database.available
        return {
            "status": "ok" if available else "degraded",
            "database": "available" if available else "unavailable",
            "environment": request.app.state.config.app_env,
        }

    @app.get("/api/models", response_model=ModelsResponse)
    async def list_models(request: Request) -> dict:
        try:
            return await request.app.state.catalog.get()
        except OpenRouterError:
            raise HTTPException(
                status_code=502,
                detail="The model catalogue is temporarily unavailable from OpenRouter.",
            ) from None

    @app.get("/api/settings", response_model=SettingsResponse)
    async def read_settings(
        request: Request, session: AsyncSession = Depends(get_session)
    ) -> SettingsResponse:
        settings = await get_or_create_settings(session, request.app.state.config)
        configured = await credential_is_configured(session, request.app.state.config)
        return SettingsResponse(
            default_model=settings.default_model,
            credits_poll_interval_seconds=settings.credits_poll_interval_seconds,
            study_preferences=settings.study_preferences,
            openrouter_key_configured=configured,
            updated_at=settings.updated_at,
        )

    @app.put("/api/settings", response_model=SettingsResponse)
    async def update_settings(
        payload: SettingsUpdate,
        request: Request,
        session: AsyncSession = Depends(get_session),
    ) -> SettingsResponse:
        settings = await get_or_create_settings(session, request.app.state.config)
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            if value is not None or field == "default_model":
                setattr(settings, field, value)
        await session.commit()
        await session.refresh(settings)
        configured = await credential_is_configured(session, request.app.state.config)
        return SettingsResponse(
            default_model=settings.default_model,
            credits_poll_interval_seconds=settings.credits_poll_interval_seconds,
            study_preferences=settings.study_preferences,
            openrouter_key_configured=configured,
            updated_at=settings.updated_at,
        )

    @app.put("/api/settings/openrouter-key", response_model=SecretStatusResponse)
    async def put_openrouter_key(
        payload: OpenRouterKeyInput,
        request: Request,
        session: AsyncSession = Depends(get_session),
    ) -> SecretStatusResponse:
        config: AppConfig = request.app.state.config
        if not config.fernet_key:
            raise HTTPException(status_code=503, detail="Backend secret encryption is not configured.")
        api_key = payload.api_key.get_secret_value()
        try:
            await request.app.state.openrouter.validate_key(api_key)
            await store_api_key(session, config, api_key)
        except OpenRouterError as exc:
            raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from None
        except CredentialConfigurationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        return SecretStatusResponse(configured=True, message="OpenRouter API key validated and stored.")

    @app.delete("/api/settings/openrouter-key", response_model=SecretStatusResponse)
    async def remove_openrouter_key(
        request: Request, session: AsyncSession = Depends(get_session)
    ) -> SecretStatusResponse:
        await delete_api_key(session)
        configured = bool(request.app.state.config.openrouter_api_key)
        message = "Environment-provided OpenRouter key remains active." if configured else "OpenRouter API key removed."
        return SecretStatusResponse(configured=configured, message=message)

    @app.get("/api/openrouter/credits", response_model=CreditsResponse)
    async def read_credits(session: AsyncSession = Depends(get_session)) -> CreditsResponse:
        result = await session.execute(select(CreditSnapshot).where(CreditSnapshot.id == 1))
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            return CreditsResponse(status="pending")
        return CreditsResponse(
            status=snapshot.status,
            credits=snapshot.credits,
            checked_at=snapshot.checked_at,
            error=snapshot.error,
        )

    @app.post("/api/lessons", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
    async def create_lesson(
        payload: LessonRequest,
        request: Request,
        session: AsyncSession = Depends(get_session),
    ) -> LessonResponse:
        config: AppConfig = request.app.state.config
        api_key = await get_api_key(session, config)
        if not api_key:
            raise HTTPException(status_code=409, detail="Configure an OpenRouter API key before generating a lesson.")
        settings = await get_or_create_settings(session, config)
        selected_model = payload.model or settings.default_model
        if not selected_model:
            raise HTTPException(status_code=422, detail="Select a model in settings or in the lesson request.")
        try:
            catalogue = await request.app.state.catalog.get()
        except OpenRouterError:
            raise HTTPException(status_code=502, detail="The model catalogue could not be checked.") from None
        if not any(model["id"] == selected_model for model in catalogue["data"]):
            raise HTTPException(status_code=422, detail="The selected model is not currently available in OpenRouter.")

        graph = build_lesson_graph(session, config=config, api_key=api_key)
        try:
            result = await graph.ainvoke(
                {
                    "topic": payload.topic,
                    "level": payload.level,
                    "goal": payload.goal,
                    "model": selected_model,
                }
            )
        except LessonGenerationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from None
        except Exception:
            logger.warning("Lesson graph failed.")
            raise HTTPException(status_code=502, detail="Lesson generation failed. Please try again.") from None

        lesson = LessonRecord(
            id=str(uuid4()),
            topic=payload.topic,
            level=payload.level,
            goal=payload.goal,
            model=selected_model,
            content=result["content"],
            sources=result.get("sources", []),
            created_at=utc_now(),
        )
        session.add(lesson)
        await index_source(
            session,
            source_type="lesson",
            source_id=lesson.id,
            title=lesson.topic,
            content=lesson.content,
        )
        await session.commit()
        await session.refresh(lesson)
        return LessonResponse.model_validate(lesson)

    @app.get("/api/lessons", response_model=list[LessonResponse])
    async def list_lessons(
        session: AsyncSession = Depends(get_session),
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
    ) -> list[LessonRecord]:
        result = await session.execute(
            select(LessonRecord).order_by(desc(LessonRecord.created_at)).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    @app.get("/api/lessons/{lesson_id}", response_model=LessonResponse)
    async def read_lesson(
        lesson_id: str, session: AsyncSession = Depends(get_session)
    ) -> LessonRecord:
        lesson = await session.get(LessonRecord, lesson_id)
        if lesson is None:
            raise HTTPException(status_code=404, detail="Lesson not found.")
        return lesson

    @app.post(
        "/api/lessons/{lesson_id}/complements",
        response_model=LessonComplementResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_lesson_complement(
        lesson_id: str,
        payload: LessonComplementRequest,
        request: Request,
        session: AsyncSession = Depends(get_session),
    ) -> LessonComplementRecord:
        lesson = await session.get(LessonRecord, lesson_id)
        if lesson is None:
            raise HTTPException(status_code=404, detail="Lesson not found.")

        config: AppConfig = request.app.state.config
        api_key = await get_api_key(session, config)
        if not api_key:
            raise HTTPException(status_code=409, detail="Configure an OpenRouter API key before generating a complement.")

        graph = build_complement_graph(session, config=config, api_key=api_key)
        try:
            result = await graph.ainvoke(
                {
                    "topic": lesson.topic,
                    "prompt": payload.prompt,
                    "lesson_content": lesson.content,
                    "model": lesson.model,
                }
            )
        except LessonGenerationError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from None
        except Exception:
            logger.warning("Lesson complement graph failed.")
            raise HTTPException(status_code=502, detail="Complement generation failed. Please try again.") from None

        complement = LessonComplementRecord(
            id=str(uuid4()),
            lesson_id=lesson.id,
            prompt=payload.prompt,
            content=result["content"],
            status="pending",
            created_at=utc_now(),
        )
        session.add(complement)
        await session.commit()
        await session.refresh(complement)
        return complement

    @app.get(
        "/api/lessons/{lesson_id}/complements",
        response_model=list[LessonComplementResponse],
    )
    async def list_lesson_complements(
        lesson_id: str, session: AsyncSession = Depends(get_session)
    ) -> list[LessonComplementRecord]:
        if await session.get(LessonRecord, lesson_id) is None:
            raise HTTPException(status_code=404, detail="Lesson not found.")
        result = await session.execute(
            select(LessonComplementRecord)
            .where(LessonComplementRecord.lesson_id == lesson_id)
            .order_by(LessonComplementRecord.created_at, LessonComplementRecord.id)
        )
        return list(result.scalars().all())

    @app.post(
        "/api/lessons/{lesson_id}/complements/{complement_id}/accept",
        response_model=LessonResponse,
    )
    async def accept_lesson_complement(
        lesson_id: str,
        complement_id: str,
        session: AsyncSession = Depends(get_session),
    ) -> LessonRecord:
        lesson_result = await session.execute(
            select(LessonRecord).where(LessonRecord.id == lesson_id).with_for_update()
        )
        lesson = lesson_result.scalar_one_or_none()
        if lesson is None:
            raise HTTPException(status_code=404, detail="Lesson not found.")
        complement_result = await session.execute(
            select(LessonComplementRecord)
            .where(
                LessonComplementRecord.id == complement_id,
                LessonComplementRecord.lesson_id == lesson_id,
            )
            .with_for_update()
        )
        complement = complement_result.scalar_one_or_none()
        if complement is None:
            raise HTTPException(status_code=404, detail="Lesson complement not found.")
        if complement.status == "accepted":
            return lesson
        if complement.status != "pending":
            raise HTTPException(status_code=409, detail="Only pending complements can be accepted.")

        lesson.content = f"{lesson.content.rstrip()}\n\n## Complemento\n\n{complement.content.strip()}"
        complement.status = "accepted"
        await index_source(
            session,
            source_type="lesson",
            source_id=lesson.id,
            title=lesson.topic,
            content=lesson.content,
        )
        await session.commit()
        await session.refresh(lesson)
        return lesson

    @app.post(
        "/api/lessons/{lesson_id}/complements/{complement_id}/reject",
        response_model=LessonComplementResponse,
    )
    async def reject_lesson_complement(
        lesson_id: str,
        complement_id: str,
        session: AsyncSession = Depends(get_session),
    ) -> LessonComplementRecord:
        if await session.get(LessonRecord, lesson_id) is None:
            raise HTTPException(status_code=404, detail="Lesson not found.")
        complement_result = await session.execute(
            select(LessonComplementRecord)
            .where(
                LessonComplementRecord.id == complement_id,
                LessonComplementRecord.lesson_id == lesson_id,
            )
            .with_for_update()
        )
        complement = complement_result.scalar_one_or_none()
        if complement is None:
            raise HTTPException(status_code=404, detail="Lesson complement not found.")
        if complement.status == "rejected":
            return complement
        if complement.status != "pending":
            raise HTTPException(status_code=409, detail="Only pending complements can be rejected.")

        complement.status = "rejected"
        await session.commit()
        await session.refresh(complement)
        return complement

    @app.get("/api/lessons/{lesson_id}/feedback", response_model=FeedbackResponse | None)
    async def read_feedback(
        lesson_id: str, session: AsyncSession = Depends(get_session)
    ) -> FeedbackRecord | None:
        if await session.get(LessonRecord, lesson_id) is None:
            raise HTTPException(status_code=404, detail="Lesson not found.")
        result = await session.execute(
            select(FeedbackRecord).where(FeedbackRecord.lesson_id == lesson_id)
        )
        return result.scalar_one_or_none()

    @app.post(
        "/api/lessons/{lesson_id}/feedback",
        response_model=FeedbackResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_feedback(
        lesson_id: str,
        payload: FeedbackInput,
        session: AsyncSession = Depends(get_session),
    ) -> FeedbackRecord:
        if await session.get(LessonRecord, lesson_id) is None:
            raise HTTPException(status_code=404, detail="Lesson not found.")
        feedback = FeedbackRecord(lesson_id=lesson_id, rating=payload.rating, comment=payload.comment)
        session.add(feedback)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(status_code=409, detail="Feedback has already been submitted for this lesson.") from None
        await session.refresh(feedback)
        return feedback

    @app.post("/api/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
    async def create_note(
        payload: NoteInput, session: AsyncSession = Depends(get_session)
    ) -> NoteRecord:
        if payload.lesson_id and await session.get(LessonRecord, payload.lesson_id) is None:
            raise HTTPException(status_code=404, detail="Related lesson not found.")
        note = NoteRecord(
            id=str(uuid4()),
            topic=payload.topic,
            content=payload.content,
            lesson_id=payload.lesson_id,
            include_in_rag=payload.include_in_rag,
            created_at=utc_now(),
        )
        session.add(note)
        if note.include_in_rag:
            await index_source(
                session,
                source_type="note",
                source_id=note.id,
                title=note.topic,
                content=note.content,
            )
        await session.commit()
        await session.refresh(note)
        return note

    @app.get("/api/notes", response_model=list[NoteResponse])
    async def list_notes(session: AsyncSession = Depends(get_session)) -> list[NoteRecord]:
        result = await session.execute(select(NoteRecord).order_by(desc(NoteRecord.created_at)))
        return list(result.scalars().all())

    @app.delete("/api/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def remove_note(note_id: str, session: AsyncSession = Depends(get_session)) -> Response:
        note = await session.get(NoteRecord, note_id)
        if note is None:
            raise HTTPException(status_code=404, detail="Note not found.")
        await session.execute(
            delete(KnowledgeChunk).where(
                KnowledgeChunk.source_type == "note",
                KnowledgeChunk.source_id == note_id,
            )
        )
        await session.delete(note)
        await session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


app = create_app()
