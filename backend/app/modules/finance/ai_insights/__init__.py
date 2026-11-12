"""Governed, read-only finance AI (PLAN Phase 5, tenant flag `finance_ai_insights_v2`, default OFF).

  POST /api/v1/finance/statements/commentary   (see router.py)

Every figure is computed first by the committed Phase 2-4 services and put in a bounded `fact_catalog`. A provider
(`generate_text_for_tenant`) only ever sees that catalog; its answer is accepted only when every number and every
cited fact id checks out, otherwise the deterministic commentary is returned. No write path exists.
"""
