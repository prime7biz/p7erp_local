# Factory Type Workflows

Per-segment end-to-end checklist. Run on staging with real users; engineering proxies in `backend/tests/test_factory_type_workflow_integration.py`.

**Quick setup:** In **Production setup** (`/app/production/setup`), choose a **Factory profile** (woven, knit, sweater, denim, buying house, hybrid) to preset optional units and related feature flags. Fine-tune optional units manually after applying a profile.

| Segment | Tenant type | Key production units | Hard gate flow |
|---------|-------------|----------------------|----------------|
| Knitwear | manufacturer | knitting, dyeing | Order → BOM → PO/GRN → Knitting WO → DC |
| Sweater | manufacturer | knitting, linking | Yarn issue → knit → linking → QC → DC |
| Denim | manufacturer | washing, finishing | Cut → sew → wash → finish → QC → DC |
| Woven shirt | manufacturer | cutting, sewing | Cut → sew → finish → QC → DC |
| Bottoms | manufacturer | cutting, sewing | Same as woven shirt |
| Buying house | buying_house | trade module | Customer → Order → PI → BTB LC → Trade case → Shipment |
| Both | both | mfg + trade | Integrated order with factory production + export docs |

## Production-to-inventory rule

Document per tenant whether finished goods post via:
- Explicit GRN on finished item, or
- Process order receive, or
- MO completion hook (future)

See `docs/INVENTORY_MODULE_ADVANCEMENT_PLAN.md` §2.6.
