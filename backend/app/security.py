from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AppConfig
from app.models import StoredCredential


class CredentialConfigurationError(Exception):
    pass


def _fernet(config: AppConfig) -> Fernet:
    if not config.fernet_key:
        raise CredentialConfigurationError("FERNET_KEY is not configured on the backend.")
    try:
        return Fernet(config.fernet_key.encode("utf-8"))
    except (ValueError, TypeError):
        raise CredentialConfigurationError("FERNET_KEY is invalid.") from None


async def get_api_key(session: AsyncSession, config: AppConfig) -> str | None:
    result = await session.execute(select(StoredCredential).where(StoredCredential.id == 1))
    credential = result.scalar_one_or_none()
    if credential is not None:
        try:
            return _fernet(config).decrypt(credential.encrypted_secret.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError, CredentialConfigurationError):
            return None
    return config.openrouter_api_key


async def credential_is_configured(session: AsyncSession, config: AppConfig) -> bool:
    result = await session.execute(select(StoredCredential.id).where(StoredCredential.id == 1))
    return result.scalar_one_or_none() is not None or bool(config.openrouter_api_key)


async def store_api_key(session: AsyncSession, config: AppConfig, api_key: str) -> None:
    encrypted = _fernet(config).encrypt(api_key.encode("utf-8")).decode("ascii")
    result = await session.execute(select(StoredCredential).where(StoredCredential.id == 1))
    credential = result.scalar_one_or_none()
    if credential is None:
        session.add(StoredCredential(id=1, encrypted_secret=encrypted))
    else:
        credential.encrypted_secret = encrypted
    await session.commit()


async def delete_api_key(session: AsyncSession) -> None:
    result = await session.execute(select(StoredCredential).where(StoredCredential.id == 1))
    credential = result.scalar_one_or_none()
    if credential is not None:
        await session.delete(credential)
        await session.commit()
