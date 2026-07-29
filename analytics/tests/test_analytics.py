from datetime import datetime, timedelta, timezone

from app.analytics import build_link_insight, build_summary
from app.models import LinkRecord


def _rec(slug: str, hits: int, days_ago: int = 0) -> LinkRecord:
    return LinkRecord(
        slug=slug,
        url=f"https://example.com/{slug}",
        hits=hits,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )


def test_build_summary_aggregates_and_ranks():
    records = [_rec("a", 5, days_ago=1), _rec("b", 0, days_ago=2), _rec("c", 3, days_ago=0)]

    summary = build_summary(records, top_n=2)

    assert summary.total_links == 3
    assert summary.total_hits == 8
    assert summary.links_with_hits == 2
    assert summary.never_used == 1
    assert summary.average_hits == round(8 / 3, 2)
    assert [s.slug for s in summary.top_links] == ["a", "c"]
    # most recently created first
    assert summary.recently_created[0].slug == "c"


def test_build_summary_handles_empty():
    summary = build_summary([], top_n=5)
    assert summary.total_links == 0
    assert summary.total_hits == 0
    assert summary.average_hits == 0.0
    assert summary.top_links == []


def test_link_insight_share_of_total():
    records = [_rec("a", 5), _rec("b", 5)]
    insight = build_link_insight(records[0], total_hits=10)
    assert insight.share_of_total_hits == 0.5
    assert insight.age_days is not None and insight.age_days >= 0
