# Knitting module — UAT checklist

Run after migrating (`alembic upgrade head`) and enabling **Knitting** in Production setup optional units plus **knitting_enabled** in Settings → Configuration.

## Tenant & access

- [ ] Sidebar **Knitting** hub hidden until `knitting_enabled` is true and optional unit knitting is enabled.
- [ ] Direct URL `/app/production/knitting` redirects when knitting is disabled.

## Masters

- [ ] Create knitting **charge rate** (fabric code, effective from, rate per kg greige); preview used on WO create.
- [ ] Register knitting **department machines** on Production setup; allocate machine ID on work order optional.

## Work order lifecycle

- [ ] Create WO: in-house / customer job-work / subcontract; correct customer/vendor required.
- [ ] **Create process order** from WO; open Inventory → Process orders → issue yarn → receive greige.
- [ ] **Refresh status** pulls status from linked process order.
- [ ] Link **delivery challan** and **gate pass** IDs created under Inventory after save.

## Finance (posted journals + bills)

 Preconditions: seeded system COA, open accounting period, greige item resolves WIP + inventory accounts.

- [ ] **In-house**: processing charge 0 → no knitting service voucher; stock receipt GL only.
- [ ] **Subcontract**: charging amount > 0, vendor set → POST receive creates WIP/AP journal + payable bill; FG unit cost includes charge.
- [ ] **Customer job-work**: charge > 0, customer set → POST receive creates AR/Revenue journal + receivable bill; FG unit cost **excludes** charge.

## Regression

- [ ] Non-knitting process orders unchanged.
