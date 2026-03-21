# Inventory–Finance UAT (FIFO + GL)

Quick checklist after deploy (see also [INVENTORY_FINANCE_INTEGRATION.md](./INVENTORY_FINANCE_INTEGRATION.md)).

## Preconditions

1. Run DB migration `087`.
2. **Chart of Accounts:** create Stock-in-Hand (or RM/FG) and Clearing/GRNI accounts under appropriate groups.
3. **CoA settings** (Chart of Accounts → CoA settings): set default inventory stock + clearing accounts **or** map accounts on each **Stock Group**.
4. **Items:** assign **Stock group** where you need group-wise GL and summaries.
5. **FIFO rebuild:** Inventory → **Inventory Summary (FIFO)** → **FIFO rebuild** (admin/manager), or `POST /api/v1/inventory/fifo-rebuild`.

## Functional tests

| # | Scenario | Expect |
|---|----------|--------|
| U1 | GRN receive with PO price | Stock movement IN; FIFO layer; posted journal Dr inventory / Cr clearing (if accounts set) |
| U2 | Delivery challan → POSTED | OUT at FIFO cost; Dr COGS / Cr inventory (if COGS + inventory set on group or defaults) |
| U3 | Warehouse transfer | No GL; IN cost = OUT FIFO cost |
| U4 | Stock adjustment +/− | GL Dr/Cr inventory vs adjustment account when mapped |
| U5 | Process order issue / receive | WIP and FG journals when WIP + inventory accounts set |
| U6 | Physical count post | GL for variances when accounts set |
| U7 | Consumption issue | Dr COGS / Cr inventory when mapped |
| U8 | **Inventory Summary (FIFO)** | Group / warehouse / WIP / overview match stock layers |
| U9 | **Reconciliation → Finance/GL** | Stock vs GL and WIP vs GL show explainable variance after postings |
| U10 | **Close accounting period** | Blocked if GRN/adjustment/transfer/physical session left in DRAFT |

## Rollback

- Alembic downgrade `087` removes layers and GL mapping columns (posted vouchers are not auto-deleted).

## Cutover notes

- Run FIFO rebuild once after migration on each tenant before relying on FIFO valuation.
- Align GL inventory account balances with opening stock via manual journal if migrating mid-period.
