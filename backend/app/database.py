from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


class Database:
    def __init__(self, url: str) -> None:
        self.engine = create_async_engine(url, pool_pre_ping=True)
        self.session_factory = async_sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
        self.available = False
        self.url = url

    async def initialize(self) -> None:
        from app.models import Base

        async with self.engine.begin() as connection:
            if self.engine.url.get_backend_name() == "postgresql":
                await connection.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
            await connection.run_sync(Base.metadata.create_all)
        self.available = True

    async def close(self) -> None:
        await self.engine.dispose()

    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.session_factory() as session:
            yield session
