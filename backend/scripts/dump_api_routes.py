"""Print every registered FastAPI route as JSON (read-only).

Used by `frontend/scripts/audit-api-wiring.mjs` to check that each frontend API call
has a matching backend route.

Usage (from repo root):
    docker compose exec -T backend python scripts/dump_api_routes.py > backend_routes.json
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from starlette.routing import Mount, Route, WebSocketRoute  # noqa: E402


def _walk(routes, prefix: str = ""):
    for route in routes:
        if isinstance(route, Mount):
            yield from _walk(route.routes or [], prefix + route.path)
        elif isinstance(route, WebSocketRoute):
            yield {"path": prefix + route.path, "methods": ["WS"]}
        elif isinstance(route, Route):
            methods = sorted(m for m in (route.methods or []) if m not in {"HEAD", "OPTIONS"})
            yield {"path": prefix + route.path, "methods": methods}


def main() -> None:
    logging.disable(logging.CRITICAL)
    from app.main import app

    rows = sorted(_walk(app.routes), key=lambda r: (r["path"], r["methods"]))
    json.dump(rows, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
