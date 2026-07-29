"""Pure analytics functions.

Kept free of I/O so they are trivial to unit-test. The repository fetches raw
records; these functions turn them into the API's response models.
"""

from datetime import datetime, timezone

from .models import AnalyticsSummary, LinkInsight, LinkRecord, LinkStat

_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _stat(record: LinkRecord) -> LinkStat:
    return LinkStat(
        slug=record.slug,
        url=record.url,
        hits=record.hits,
        created_at=record.created_at,
        last_accessed_at=record.last_accessed_at,
    )


def build_summary(
    records: list[LinkRecord],
    top_n: int = 5,
    now: datetime | None = None,
) -> AnalyticsSummary:
    now = now or datetime.now(timezone.utc)
    total_links = len(records)
    total_hits = sum(r.hits for r in records)
    links_with_hits = sum(1 for r in records if r.hits > 0)
    average = total_hits / total_links if total_links else 0.0

    top = sorted(records, key=lambda r: (-r.hits, r.slug))[:top_n]
    recent = sorted(
        records,
        key=lambda r: _utc(r.created_at) or _EPOCH,
        reverse=True,
    )[:top_n]

    return AnalyticsSummary(
        total_links=total_links,
        total_hits=total_hits,
        average_hits=round(average, 2),
        links_with_hits=links_with_hits,
        never_used=total_links - links_with_hits,
        top_links=[_stat(r) for r in top],
        recently_created=[_stat(r) for r in recent],
        generated_at=now,
    )


def build_link_insight(
    record: LinkRecord,
    total_hits: int,
    now: datetime | None = None,
) -> LinkInsight:
    now = now or datetime.now(timezone.utc)
    created = _utc(record.created_at)
    last = _utc(record.last_accessed_at)

    age_days = (now - created).total_seconds() / 86400 if created else None
    since_days = (now - last).total_seconds() / 86400 if last else None
    share = record.hits / total_hits if total_hits else 0.0

    return LinkInsight(
        slug=record.slug,
        url=record.url,
        description=record.description,
        hits=record.hits,
        created_at=record.created_at,
        updated_at=record.updated_at,
        last_accessed_at=record.last_accessed_at,
        age_days=round(age_days, 2) if age_days is not None else None,
        days_since_last_access=round(since_days, 2) if since_days is not None else None,
        share_of_total_hits=round(share, 4),
    )
