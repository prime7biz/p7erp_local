# ERP benchmark: Tally and Akij ERP vs P7 ERP

Research date: 2026-11-04.

## Summary

We studied how two popular ERPs work so P7 can borrow their best workflow ideas:
- **Tally** (TallyPrime): the most-used accounting and inventory software in South Asia.
- **Akij ERP** (AKIJ iBOS): a Bangladeshi ERP with a garments edition and NBR-enlisted VAT software. The original request said "Azik ERP"; that product does not exist, and Akij was confirmed as the intended one.

**What we found:**
- **Tally's strength is speed and trust:** keyboard-first entry, save = post, drill-down from every report to the voucher, and exception reports built from document links.
- **Akij's strength is Bangladesh fit:** a Comparative Statement before every PO, one approval inbox, order-wise profit and LC dashboards, and official Mushak VAT forms.
- **P7 already has most of the functional depth**, and is ahead of both on RMG, MRP, WIP, QC and approvals. The gaps are mainly convenience features and a few procurement and compliance items.

## Files in this folder

| File | What it contains |
|---|---|
| [TALLY_WORKFLOW.md](TALLY_WORKFLOW.md) | Tally accounting, inventory, manufacturing and payroll workflows; 20 design ideas; weaknesses; sources |
| [AKIJ_IBOS_WORKFLOW.md](AKIJ_IBOS_WORKFLOW.md) | Product identification, modules, procurement / garments / HR / VAT workflows, ideas, weaknesses, sources |
| [P7_GAP_AND_ROADMAP.md](P7_GAP_AND_ROADMAP.md) | Side-by-side comparison with P7 status and file evidence, plus a Tier 1 / 2 / 3 roadmap and a "do not copy" list |

## How to use these docs

1. Start with the roadmap in `P7_GAP_AND_ROADMAP.md` and pick one item.
2. Make a small plan for that item only, with a feature flag if it is risky, tests and a rollback note.
3. Re-check the P7 status column before building, because the code may have changed since the research date.
4. When the item ships, update its status in `P7_GAP_AND_ROADMAP.md` and the matching Help & Tutorials pages.

The vendor research is based on public sources, which are linked in each file. Akij material is mostly vendor marketing, so treat its claims with care.
