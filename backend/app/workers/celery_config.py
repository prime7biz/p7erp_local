"""Queue names and optional beat schedule placeholders."""

CRITICAL_QUEUE = "critical"
NORMAL_QUEUE = "normal"
LOW_QUEUE = "low"

# Documented beat entries (actual schedule is set on celery_app.conf.beat_schedule).
BEAT_PARTY_LEDGER_DAILY = "party-ledger-daily-maintenance"
