# Critical Alerts – Run migrations (Phase 1 + 2)

From the project root, with your Python environment activated:

```bash
cd backend
alembic upgrade head
```

This applies:

- **057** – Alert engine tables (alert_definition, alert_instance, alert_history, alert_comment, alert_related_entity, alert_scan_log)
- **058** – Phase 2: escalation columns on alert_instance, alert_escalation_log, alert_saved_view

If you use a virtual environment:

```bash
cd backend
.venv\Scripts\activate   # Windows
# or: source .venv/bin/activate   # Linux/Mac
alembic upgrade head
```

Then start the backend and frontend and open **Merchandising → Critical Alerts** (`/app/merchandising/alerts`).
