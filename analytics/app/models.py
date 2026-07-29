from datetime import datetime

from pydantic import BaseModel


class LinkRecord(BaseModel):
    """Internal representation of a link, as read from the shared store."""

    slug: str
    url: str
    description: str | None = None
    hits: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_accessed_at: datetime | None = None


class LinkStat(BaseModel):
    """Compact link summary used in ranked lists."""

    slug: str
    url: str
    hits: int
    created_at: datetime | None = None
    last_accessed_at: datetime | None = None


class AnalyticsSummary(BaseModel):
    total_links: int
    total_hits: int
    average_hits: float
    links_with_hits: int
    never_used: int
    top_links: list[LinkStat]
    recently_created: list[LinkStat]
    generated_at: datetime


class LinkInsight(BaseModel):
    slug: str
    url: str
    description: str | None = None
    hits: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_accessed_at: datetime | None = None
    age_days: float | None = None
    days_since_last_access: float | None = None
    share_of_total_hits: float = 0.0
