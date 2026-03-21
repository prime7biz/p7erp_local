"""Shared server-side pagination helpers (Finding #3 — scale)."""

from __future__ import annotations

DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 500

# HR / heavy list endpoints (Finding #3): default safety cap on unbounded tenant lists.
HR_LIST_DEFAULT_LIMIT = 5000
HR_LIST_MAX_LIMIT = 20000


def clamp_page_size(page_size: int) -> int:
    return max(1, min(page_size, MAX_PAGE_SIZE))


def total_pages(total: int, page_size: int) -> int:
    if page_size <= 0:
        return 1
    return max((total + page_size - 1) // page_size, 1)


def safe_page(page: int, total: int, page_size: int) -> int:
    """Clamp page to [1, total_pages]."""
    tp = total_pages(total, page_size)
    return max(1, min(page, tp))
