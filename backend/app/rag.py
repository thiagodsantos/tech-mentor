import hashlib
import math
import re
from collections import Counter
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeChunk

TOKEN_RE = re.compile(r"[\w-]+", re.UNICODE)


def embed_text(text: str) -> list[float]:
    """Small deterministic feature-hash embedding; no external model or network is required."""
    vector = [0.0] * 384
    tokens = TOKEN_RE.findall(text.lower())
    for token, count in Counter(tokens).items():
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        index = int.from_bytes(digest[:4], "big") % len(vector)
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign * (1.0 + math.log(count))
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


def _split_chunks(text: str, max_chars: int = 1200) -> list[str]:
    blocks = [block.strip() for block in re.split(r"\n\s*\n", text) if block.strip()]
    chunks: list[str] = []
    current = ""
    for block in blocks:
        while len(block) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.append(block[:max_chars])
            block = block[max_chars:]
        candidate = f"{current}\n\n{block}".strip()
        if len(candidate) > max_chars and current:
            chunks.append(current)
            current = block
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [text[:max_chars]]


async def index_source(
    session: AsyncSession,
    *,
    source_type: str,
    source_id: str,
    title: str,
    content: str,
) -> None:
    await session.execute(
        delete(KnowledgeChunk).where(
            KnowledgeChunk.source_type == source_type,
            KnowledgeChunk.source_id == source_id,
        )
    )
    for chunk in _split_chunks(content):
        session.add(
            KnowledgeChunk(
                source_type=source_type,
                source_id=source_id,
                title=title,
                content=chunk,
                embedding=embed_text(f"{title}\n{chunk}"),
            )
        )


def _cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right, strict=False))


async def retrieve_context(session: AsyncSession, query: str, limit: int = 4) -> list[dict[str, Any]]:
    result = await session.execute(select(KnowledgeChunk))
    candidates = result.scalars().all()
    if not candidates:
        return []

    query_tokens = set(token.lower() for token in TOKEN_RE.findall(query))
    query_embedding = embed_text(query)
    scored: list[tuple[float, KnowledgeChunk]] = []
    for chunk in candidates:
        chunk_tokens = set(token.lower() for token in TOKEN_RE.findall(f"{chunk.title} {chunk.content}"))
        lexical = len(query_tokens & chunk_tokens) / max(1, len(query_tokens))
        semantic = _cosine(query_embedding, chunk.embedding or [])
        scored.append((semantic * 0.7 + lexical * 0.3, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [(score, chunk) for score, chunk in scored[:limit] if score > 0]
    return [
        {
            "source_type": chunk.source_type,
            "source_id": chunk.source_id,
            "title": chunk.title,
            "content": chunk.content,
        }
        for _, chunk in selected
    ]
