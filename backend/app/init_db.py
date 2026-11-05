import asyncio

from app.config import get_config
from app.database import Database


async def initialize() -> None:
    database = Database(get_config().database_url)
    try:
        await database.initialize()
    finally:
        await database.close()


if __name__ == "__main__":
    asyncio.run(initialize())
