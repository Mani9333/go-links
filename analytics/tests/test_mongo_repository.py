"""Integration test for the MongoDB repository.

Skipped unless MONGODB_TEST_URI is set, so the default `pytest` run is
hermetic. Uses asyncio.run to avoid an async-test-runner dependency.

    MONGODB_TEST_URI="mongodb://127.0.0.1:27017" pytest
"""

import asyncio
import os

import pytest

URI = os.environ.get("MONGODB_TEST_URI")


@pytest.mark.skipif(not URI, reason="MONGODB_TEST_URI not set")
def test_mongo_repository_reads_records():
    async def run() -> None:
        from motor.motor_asyncio import AsyncIOMotorClient

        from app.repository import MongoLinkRepository

        client = AsyncIOMotorClient(URI, tz_aware=True)
        collection = client["golinks_pytest"]["links"]
        await collection.delete_many({})
        await collection.insert_one(
            {"_id": "oncall", "url": "https://example.com/oncall", "hits": 2}
        )

        repo = MongoLinkRepository(collection)
        assert await repo.ping() is True

        records = await repo.list_links()
        assert [r.slug for r in records] == ["oncall"]
        assert records[0].hits == 2

        one = await repo.get_link("oncall")
        assert one is not None and one.url == "https://example.com/oncall"
        assert await repo.get_link("missing") is None

        await client["golinks_pytest"].drop_collection("links")
        client.close()

    asyncio.run(run())
