# KPI Platform (docs)

Governed apparel KPI engine for factories, agents and buying offices.

| Doc | Purpose |
|---|---|
| [00-AUDIT_REPORT.md](00-AUDIT_REPORT.md) | Codebase audit |
| [01-MASTER_CATALOGUE.md](01-MASTER_CATALOGUE.md) | 192 KPIs with P7 status |
| [02-EXECUTIVE_COCKPIT.md](02-EXECUTIVE_COCKPIT.md) | ~20 executive measures |
| [03-ARCHITECTURE.md](03-ARCHITECTURE.md) | Registry, security, APIs |
| [04-TIER1_BACKLOG.md](04-TIER1_BACKLOG.md) | First ~45 KPIs |
| [05-CANONICAL_MODEL.md](05-CANONICAL_MODEL.md) | Dim/fact map to P7 models |
| [06-IMPLEMENTATION_NOTES.md](06-IMPLEMENTATION_NOTES.md) | Enable steps, gaps, rollback |

**Flag:** `kpi_engine_v1` (strict OFF). Predictive: `kpi_predictive_v1`.  
**Code:** `backend/app/modules/kpi_engine/`, migration `314_kpi_engine_registry.py`.  
**UI:** `/app/kpi` (Operations → KPI cockpit).
