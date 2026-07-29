"""Read-only access to the shared links store.

Same pattern as the TypeScript service: an interface (Protocol) with an
in-memory implementation for dev/tests and a MongoDB implementation for
production. The analytics service never writes — the TypeScript service owns
writes.
"""

from typing import Any, Protocol, runtime_checkable

from .models import LinkRecord


@runtime_checkable
class LinkRepository(Protocol):
    async def list_links(self) -> list[LinkRecord]: ...
    async def get_link(self, slug: str) -> LinkRecord | None: ...
    async def ping(self) -> bool: ...


class InMemoryLinkRepository:
    """Backed by a dict; used for local dev (sample data) and tests."""

    def __init__(self, records: list[LinkRecord] | None = None) -> None:
        self._records: dict[str, LinkRecord] = {r.slug: r for r in (records or [])}

    async def list_links(self) -> list[LinkRecord]:
        return list(self._records.values())

    async def get_link(self, slug: str) -> LinkRecord | None:
        return self._records.get(slug)

    async def ping(self) -> bool:
        return True


def _doc_to_record(doc: dict[str, Any]) -> LinkRecord:
    return LinkRecord(
        slug=doc.get("_id", ""),
        url=doc.get("url", ""),
        description=doc.get("description"),
        hits=doc.get("hits", 0),
        created_at=doc.get("createdAt"),
        updated_at=doc.get("updatedAt"),
        last_accessed_at=doc.get("lastAccessedAt"),
    )


class MongoLinkRepository:
    """Reads the same collection the TypeScript service writes to."""

    def __init__(self, collection: Any) -> None:
        self._collection = collection

    async def list_links(self) -> list[LinkRecord]:
        docs = await self._collection.find({}).to_list(length=None)
        return [_doc_to_record(doc) for doc in docs]

    async def get_link(self, slug: str) -> LinkRecord | None:
        doc = await self._collection.find_one({"_id": slug})
        return _doc_to_record(doc) if doc else None

    async def ping(self) -> bool:
        await self._collection.database.command("ping")
        return True
