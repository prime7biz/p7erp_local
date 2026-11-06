import type { TutorialSection } from "../types";

export const settingsSection: TutorialSection = {
  id: "settings",
  title: "Settings",
  description:
    "Company configuration and feature switches, users and invitations, roles and permissions, tenant profile, currency, statutory compliance, data import, backup status, external portals and activity logs.",
  articles: [
    {
      id: "settings-overview",
      title: "Settings and administration (map)",
      summary:
        "A map of every Settings screen: what it is for, who should use it, and which step-by-step guide to read next.",
      content: `## Overview

**Settings** is where an administrator sets up the company in P7 ERP: which features are switched on, who can log in, what each person may do, and how outside people (buyers, banks, suppliers) get their own portal. Most staff never need it; **company admins** and **IT / system officers** do.

You reach it two ways: the **Settings** group in the left sidebar, or the tab bar at the top of any Settings page (**Overview**, **Configuration**, **Users**, **Roles**, **Tenant**, **Currency**, **Accounting periods**, **Pricing**, **Audit**, **External access**, **Activity logs**, **Backup & Restore**, **Statutory compliance**, **Data import**, **Bulk tenant onboarding**, **Cheque templates**).

## Before you start

- You need **Settings** access on your role (\`settings.access\`). The **admin** role has everything.
- Changes here affect **the whole company**: who sees which menu, which features exist, and who can approve. Agree big changes with management first.

## Steps: which screen do I need?

1. **Switch a feature on or off** (Trade module, financial year, MIS, AI agents, order-execution rules) → **Configuration** (\`/app/settings/config\`). Guide: *Configuration: company details and feature switches*.
2. **Give someone a login / remove a leaver** → **User Mgmt** (\`/app/settings/users\`). Guide: *Users and invitations*.
3. **Decide what a job role may see and approve** → **Roles** (\`/app/settings/roles\`). Guide: *Roles and permissions*.
4. **Company name, type, commission default, country, time zone** → **Tenant** (\`/app/settings/tenant\`).
5. **Exchange rates (USD → BDT…)** → **Currency** (\`/app/settings/currency\`).
6. **VAT / VDS / TDS rates, bonded warehouse UD/UP, payroll statutory** → **Statutory compliance** (\`/app/settings/statutory-compliance\`).
7. **Load customers, vendors, items or accounts from Excel** → **Data import** (\`/app/settings/data-import\`).
8. **Check that the server backup ran** → **Backup & Restore** (\`/app/settings/backup\`).
9. **Buyer, bank or supplier portal logins** → **External access** (\`/app/settings/external-access\`).
10. **Who changed what** → **Activity Logs** (\`/app/settings/activity-logs\`; the **Audit** tab shows the same list).
11. **Your own signature for printed documents** → **My Signature** (\`/app/my-signature\`).
12. **Plan and licence** → **Pricing** (\`/app/settings/pricing\`) and the **Subscription and licensing** box on **Overview**.
13. **Cheque print templates** → **Cheque Templates** (\`/app/settings/cheque-templates\`) — shows *"This feature will be available in a future release."* for now.
14. **Bulk tenant onboarding** (\`/app/settings/bulk-tenant-onboarding\`) — for the **platform operator** only; it needs a separate platform-admin login. Normal company admins do not use it.

## What happens next

Most changes take effect immediately. After changing **Configuration** or a **Role**, the affected users may need to refresh the page (F5) to see new or hidden menus.

## Tips

- Recommended first-day order for a new company: **Tenant** → **Configuration** → **Currency** → **Roles** → **User Mgmt** → **Data import**.
- Use **Activity Logs** after any big change to confirm it was recorded.

## Common problems

- **Settings menu is missing** → your role has no Settings access. Ask an admin.
- **A menu disappeared for everyone** → someone switched a feature off in **Configuration**. Check the switch and **Activity Logs**.`,
      tags: ["settings", "admin", "administration", "configuration", "users", "roles", "map"],
      keywords: [
        "setup",
        "admin panel",
        "company settings",
        "control panel",
        "F11",
        "features",
        "user management",
        "permissions",
        "portal",
      ],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: "/tutorials/screens/settings.jpg",
      infographics: [
        {
          type: "flow",
          title: "Setting up a new company",
          steps: [
            { label: "Tenant", href: "/app/settings/tenant" },
            { label: "Configuration", href: "/app/settings/config" },
            { label: "Currency", href: "/app/settings/currency" },
            { label: "Roles", href: "/app/settings/roles" },
            { label: "User Mgmt", href: "/app/settings/users" },
            { label: "Data import", href: "/app/settings/data-import" },
          ],
        },
        {
          type: "highlight",
          title: "Sensitive area",
          body: "User, role, configuration and portal changes affect security and what everyone sees. Make them as an admin, one at a time, and check Activity Logs afterwards.",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/settings.jpg",
          alt: "Settings overview page with the Settings tab bar, Subscription and licensing box and cards for Configuration, Users, Roles and more",
          caption: "Settings → Overview: tab bar at the top, shortcut cards below.",
        },
      ],
      relatedAppRoutes: [
        "/app/settings",
        "/app/settings/config",
        "/app/settings/users",
        "/app/settings/roles",
        "/app/settings/tenant",
        "/app/settings/pricing",
        "/app/settings/currency",
        "/app/settings/backup",
        "/app/settings/statutory-compliance",
        "/app/settings/data-import",
        "/app/settings/bulk-tenant-onboarding",
        "/app/settings/cheque-templates",
        "/app/settings/external-access",
        "/app/settings/activity-logs",
        "/app/settings/audit",
        "/app/my-signature",
      ],
      relatedArticleIds: [
        "settings-configuration",
        "settings-users-invitations",
        "settings-roles-permissions",
        "settings-tenant-profile",
        "settings-external-access",
        "settings-data-import",
        "gs-tenant-modes",
      ],
    },
    {
      id: "settings-configuration",
      title: "Configuration: company details and feature switches",
      summary:
        "Edit company name and type, then switch modules on or off using the Essential / More features / All features view, and click Save configuration.",
      content: `## Overview

**Settings → Configuration** (\`/app/settings/config\`) holds the company's basic details and the **feature switches** that decide which modules and rules exist for everyone. It works like Tally's **F11 features**: start with **Essential** and reveal advanced switches only when you need them.

Who uses it: the company admin, usually during setup and at the start of a financial year.

## Before you start

- Admin rights.
- Know what each switch does before turning it on — some add approval steps for everyone (for example **Require master contract for RM procurement**).
- **Hidden switches keep their saved values.** Changing the view (Essential / More / All) never turns anything on or off.

## Steps

1. Open **Settings → Configuration**. **Company code** is shown at the top (read-only; used for login).
2. Check **Company name \\*\\***, **Domain (optional)**, **Logo URL (optional)**, **Tenant type** (**Manufacturer**, **Buying House**, **Both**), **Country code (ISO)** (for example \`BD\`) and **Timezone (IANA)** (for example \`Asia/Dhaka\`).
3. At **Show company features**, choose **Essential**, **More features** or **All features**. If a note says *"N switches are on in hidden sections"*, choose a bigger view to see them.
4. Tick or untick switches. Each one has a short explanation under its name.
5. Click **Save configuration** at the bottom. The message **Configuration updated successfully.** confirms it.
6. Ask users to refresh their browser (F5) so menus update.

## The switches, by view

- **Essential (always shown):** **Enable Trade module**; **Finance & costing** — **Financial year starts in** (choose **July (Bangladesh July–June)** for most BD companies), **VAT BIN**, **Budget enforcement mode** (Off / Warn / Block), **Auto-post WIP journals**, **Enable MIS reports**, **Enable party ledger**, **Enable stock hierarchy**, **Enable batch tracking**, **Enable GST / tax ledger system**, **Auto-calculate tax on vouchers**.
- **More features adds:** **Require master contract for RM procurement**, **Enable Knitting module**, **Enable Operations Control Tower**, **Auto-propose line bookings**, **Advanced vouchers** (credit/debit notes, stock transfer, memorandum, optional, post-dated, recurring, voucher classes, **Direct posting (save = post)**), **Order execution spine** (TNA event sync, require order on shop floor, line allocation → TNA sync, sample approvals gate BOM→PO, open CAPA blocks challan, colour / size breakdowns, shop-floor scan station, carton detail on packing lists, traceability & certificates, commission engine, Bangladesh bond & VAT registers, **AI exception agents**, **Ask-a-metric dashboard cards**), **Requisitions & comparative statement (CS)**, **Payroll auto-calculate**.
- **All features adds:** **TDS system**, **Statutory payroll**, and **HR compliance / OCR / AI** (compliance tracking, age verification, medical certificates, OCR for CV / ID / medical, auto document generation, AI attendance / turnover / payroll anomaly / compliance risk).

## What happens next

Switched-on modules appear in the sidebar for users whose role allows them. Switched-off modules disappear for everyone, whatever their role says.

## Tips

- Change **Financial year starts in** only at a year boundary, never mid-year.
- Turn on one advanced switch at a time and test it with one order before telling everyone.
- The view you pick (Essential / More / All) is remembered on your computer only.

## Common problems

- **"I ticked a switch but nothing changed"** → you did not click **Save configuration**, or users have not refreshed.
- **Trade menu still hidden** → Trade also needs **Tenant type** = Buying House or Both.
- **A switch looks unticked but the feature works** → it may be one of the "on by default" features; tick it and save to make it explicit, or untick and save to switch it off.`,
      tags: ["settings", "configuration", "feature flags", "switches", "F11", "financial year", "tenant type"],
      keywords: [
        "enable module",
        "turn on feature",
        "feature switch",
        "Essential",
        "More features",
        "All features",
        "fiscal year",
        "July June",
        "VAT BIN",
        "budget",
        "MIS",
        "trade module",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-config.jpg",
      infographics: [
        {
          type: "steps",
          title: "Turn on an advanced feature",
          steps: [
            {
              title: "Open Configuration",
              body: "**Settings → Configuration**. Check company name and tenant type first.",
              href: "/app/settings/config",
              imageSrc: "/tutorials/screens/settings-config.jpg",
              imageAlt: "Configuration page with company code, company name, domain, logo URL, tenant type, country code and timezone",
            },
            {
              title: "Choose the view",
              body: "At **Show company features** click **More features** (or **All features**).",
              imageSrc: "/tutorials/screens/settings-config-more-features.jpg",
              imageAlt: "Show company features selector with Essential, More features and All features buttons",
            },
            {
              title: "Tick the switch",
              body: "Read the short help under the switch, then tick it.",
              imageSrc: "/tutorials/screens/settings-config-ai-switches.jpg",
              imageAlt: "Order execution spine switches including AI exception agents and Ask-a-metric dashboard cards",
            },
            {
              title: "Save",
              body: "Click **Save configuration** and ask users to refresh (F5).",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/settings-config-essential.jpg",
          alt: "Finance and costing switches on the Configuration page: financial year, VAT BIN, budget enforcement and MIS",
          caption: "Essential view: Finance & costing switches are always shown.",
        },
      ],
      relatedAppRoutes: ["/app/settings/config"],
      relatedArticleIds: ["settings-overview", "gs-tenant-modes", "ai-exception-agents", "settings-roles-permissions"],
    },
    {
      id: "settings-users-invitations",
      title: "Users and invitations: add, change and remove logins",
      summary:
        "Invite staff by email (they set their own password) or create a user directly, assign one role, and deactivate leavers instead of deleting them.",
      content: `## Overview

**Settings → User Mgmt** (\`/app/settings/users\`, page title **Users**) controls who can log in to P7 ERP for your company. Every person gets **one login** and **one role**.

Two ways to add someone:

- **Invite staff** (recommended) — P7 ERP emails a secure link; the person sets their own password.
- **Create user** — you type the email and a starting password yourself and tell the person.

## Before you start

- Admin rights (Settings access).
- The **role** must already exist (see *Roles and permissions*). If no roles exist you see *"No roles found. Create a role first."*
- One user = one device at a time: if someone logs in on a second device, the first one is signed out with *session replaced*.

## Steps: invite a new staff member

1. Open **Settings → User Mgmt** and click **Invite staff**.
2. Type **Email \\*\\***, **First name** and **Last name**.
3. Choose the **role**. A line shows how many permission keys that role has.
4. Click **Send invite**. The message **Invitation sent.** appears and the person is listed under **Pending invitations** with an **Expires** time.
5. The person opens the email link (\`/accept-invite?token=…\`), sets a password, and signs in at \`/login\` with your **company code**, their email and password.
6. Not received? Click **Resend** on the invitation row. Wrong person? Click **Cancel**.

## Steps: create a user directly

1. In the **Create user** box type **Email \\*\\***, **First name**, **Last name**.
2. Choose the role and type a **Password \\*\\***. Keep **Active user** ticked.
3. Click **Create user**. New users sign in with **email + password** (a username is generated automatically).

## Steps: change or remove a user

1. Find the person in the table and click **Actions**.
2. **Edit** loads them into the form (now called **Edit user**). Change the role, name, or type a **New password (optional)**, then click **Update user** (or **Cancel edit**).
3. **Deactivate** blocks login but keeps their history — use this for leavers. **Activate** brings them back.
4. **Delete** removes the user permanently (*"This cannot be undone."*). Prefer **Deactivate**.

## What happens next

The user sees only the menus their role allows. Every change is written to **Activity Logs** (for example \`SETTINGS_USER_UPDATE\`).

## Tips

- Never share one login between two people — approvals and audit logs show who did what.
- Set up **My Signature** for approvers so their signature prints on approved documents.

## Common problems

- **"Failed to send invitation"** → the email already belongs to a user, or the mail server is not set up. Create the user directly instead.
- **User cannot see a menu** → check their role in **Roles**, and the feature switch in **Configuration**.
- **"Session replaced" message for a user** → they logged in somewhere else. Only the newest login stays active.`,
      tags: ["settings", "users", "invite", "staff", "login", "deactivate", "password"],
      keywords: [
        "add user",
        "new user",
        "create login",
        "invite staff",
        "remove user",
        "leaver",
        "reset password",
        "change role",
        "accept invite",
        "user management",
      ],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: "/tutorials/screens/settings-users.jpg",
      videos: [
        {
          src: "/tutorials/videos/settings-invite-user.webm",
          poster: "/tutorials/videos/settings-invite-user-poster.jpg",
          title: "Invite a new staff user",
          caption:
            "Open User Mgmt, click Invite staff, fill email, name and role. The demo closes the dialog instead of clicking Send invite.",
          durationSeconds: 47,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Invite staff",
          steps: [
            {
              title: "Click Invite staff",
              body: "On **Settings → User Mgmt**.",
              href: "/app/settings/users",
              imageSrc: "/tutorials/screens/settings-users.jpg",
              imageAlt: "Users page with Invite staff button, Create user form and the user table",
            },
            {
              title: "Fill email, name and role",
              body: "Then click **Send invite**.",
              imageSrc: "/tutorials/screens/settings-users-invite-modal.jpg",
              imageAlt: "Invite staff dialog with email, first name, last name, role and Send invite button",
            },
            {
              title: "Person accepts",
              body: "They open the email link, set a password and sign in with the company code.",
            },
            {
              title: "Manage later with Actions",
              body: "**Edit**, **Deactivate** / **Activate** or **Delete**.",
              imageSrc: "/tutorials/screens/settings-users-row-actions.jpg",
              imageAlt: "Actions menu on a user row showing Edit, Deactivate and Delete",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/settings/users", "/app/my-signature"],
      relatedArticleIds: ["settings-roles-permissions", "settings-overview", "gs-login", "wf-digital-signatures"],
    },
    {
      id: "settings-roles-permissions",
      title: "Roles and permissions: decide who can do what",
      summary:
        "Create a role from a template, tick module Access and Read / Write / Edit / Approve / Export per area, add governance switches, then assign the role to users.",
      content: `## Overview

A **role** is a job profile such as *Store keeper*, *Merchandiser* or *Accounts officer*. It holds **permission keys** that decide which menus a person sees and which buttons work. **Settings → Roles** (\`/app/settings/roles\`) is where admins build them. Each user has exactly one role.

## Before you start

- Admin rights. The **admin** role is fully enabled, cannot be edited (*"The admin role is fully enabled and cannot be edited here."*) and cannot be deleted.
- Company feature switches (**Configuration**) sit above roles: if a module is switched off, nobody sees it.

## Steps: create a role

1. Open **Settings → Roles**. The **Add role** form is at the top.
2. Type **System name \\*\\*** — a short code without spaces, for example \`store_keeper\` (cannot be changed later).
3. Type **Display name \\*\\***, for example *Store keeper*. This is what people see.
4. Optional: **Templates → Apply template…**: **Full access**, **Manager (no approve)**, **Viewer (read)** or **Data entry (read + write)**. It ticks many boxes at once; you can change them after.
5. In the matrix, tick **Access** for each module the person needs (Merchandising, Inventory, Production, Finance, HR, Trade, Settings, Reports, AI tools, Loans & Facilities, Business Overview). *Module Access gates the whole module; sub-permissions apply when Access is on.*
6. For each area tick the levels: **Read**, **Write** (create), **Edit**, **Approve**, **Export**. Shortcuts: **All modules** (whole column), **All** (one module), **Row all** (one area).
7. Scroll to **Material control & finance governance** and tick extra powers this role needs (see below).
8. Click **Create role**. Then assign it to people in **User Mgmt**.

## Steps: change or delete a role

1. In the roles table click **Actions → Edit** (**View** for admin).
2. Change ticks, then **Update role** (or **Cancel edit**).
3. **Actions → Delete** removes the role. Move its users to another role first.

## Governance switches (for admins)

These are extra yes/no powers stored on the role. **Admin and manager roles always have them**; tick them for custom roles such as warehouse lead or finance officer. Examples:

- **Material control:** \`bom.price_override\`, \`inventory.non_po_receipt_approve\`, \`inventory.over_receipt_approve\`, \`inventory.over_issue_approve\`, \`inventory.process_order_approve\`.
- **Finance:** \`finance.ap_posting_approve\`, \`finance.budget_override\`, party ledger, tax ledger, TDS and MIS keys.
- **HR & payroll:** \`hr.payroll.manage\`, \`hr.attendance.manage\`, \`hr.leave.types.manage\` — these are *fail-closed*: without the tick (or a manager-type role) the action is refused.
- **AI, Commercial, Inventory** groups for LC / shipping extraction, forecasts, stock groups, cycle counts and more.

## Merchandising and trade keys (advanced)

Some keys are not tick boxes; they follow a *soft* rule stored in the role's permission JSON: **missing = allowed**, **false = denied**, \`merch.*\`, \`trade.*\` or \`*\` set to true = grant all. Examples: \`merch.bom.approve\`, \`merch.bom.freeze\`, \`merch.po.generate\`, \`merch.alert.scan\`, \`merch.tna.manage\`, \`merch.style.manage\`, \`trade.create\`, \`trade.transition\`, \`trade.document.upload\`. To block one of them for a role, ask your system administrator to set it to \`false\`.

Exception agents use \`ai.agents.confirm\` (admin and manager roles already have it). There is no tick box for it yet.

## What happens next

Users with the role see the change after refreshing. The table column **Enabled permissions** shows how many keys each role has.

## Tips

- Build roles around jobs, not people. Start from **Data entry** for clerks and **Manager (no approve)** for supervisors, then add **Approve** only where needed.
- Keep **Approve** and **Write** apart for money (maker-checker): the person who enters a voucher should not approve it.

## Common problems

- **Level boxes are greyed out** → tick the module's **Access** first.
- **User still cannot approve** → check the governance switch and any \`merch.*\` / \`trade.*\` key set to false.
- **Cannot edit the admin role** → by design. Create a separate role.`,
      tags: ["settings", "roles", "permissions", "RBAC", "access", "governance", "approve"],
      keywords: [
        "user rights",
        "permission matrix",
        "role template",
        "maker checker",
        "approval rights",
        "merch.*",
        "trade.*",
        "ai.agents.confirm",
        "over receipt",
        "access control",
      ],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: "/tutorials/screens/settings-roles.jpg",
      videos: [
        {
          src: "/tutorials/videos/settings-roles-tour.webm",
          poster: "/tutorials/screens/settings-roles-new-role.jpg",
          title: "Create a role and choose permissions",
          caption:
            "Name the role, apply the Data entry template, read the Access and level columns, then the governance switches. Not saved in the demo.",
          durationSeconds: 42,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Users, roles and permission keys",
          caption: "One role per user; the role holds module Access, levels per area and governance switches. Company feature switches sit above all roles.",
          imageSrc: "/tutorials/diagrams/settings/roles-permissions-model.svg",
          imageAlt: "Diagram: users point to a role; the role holds module access keys, level keys and governance switches; feature switches apply to everyone",
        },
        {
          type: "steps",
          title: "Create a role",
          steps: [
            {
              title: "Name it and apply a template",
              body: "System name, Display name, then **Apply template…**.",
              href: "/app/settings/roles",
              imageSrc: "/tutorials/screens/settings-roles-new-role.jpg",
              imageAlt: "Add role form with system name store_keeper, display name Store keeper and the permission matrix ticked by the Data entry template",
            },
            {
              title: "Adjust Access and levels",
              body: "Untick modules the job does not need; add **Approve** only where required.",
              imageSrc: "/tutorials/screens/settings-roles.jpg",
              imageAlt: "Permission matrix with Access, Read, Write, Edit, Approve and Export columns",
            },
            {
              title: "Add governance switches",
              body: "Tick extra powers under **Material control & finance governance**.",
              imageSrc: "/tutorials/screens/settings-roles-governance.jpg",
              imageAlt: "Material control and finance governance section with permission keys and descriptions",
            },
            {
              title: "Create role and assign",
              body: "Click **Create role**, then pick it for users in **User Mgmt**.",
              href: "/app/settings/users",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/settings-roles-list-actions.jpg",
          alt: "Roles table with name, display name and enabled permissions columns and an Actions menu showing Edit and Delete",
          caption: "Roles list: Actions → Edit or Delete. Enabled permissions shows how many keys a role has.",
        },
      ],
      relatedAppRoutes: ["/app/settings/roles", "/app/settings/users"],
      relatedArticleIds: ["settings-users-invitations", "settings-configuration", "ai-exception-agents", "settings-overview"],
    },
    {
      id: "settings-tenant-profile",
      title: "Tenant profile, pricing plan and My Signature",
      summary:
        "Keep company name, tenant type, default commission mode, country and time zone correct; check your plan; let approvers upload their signature.",
      content: `## Overview

- **Settings → Tenant** (\`/app/settings/tenant\`, page title **Tenant Settings**) — the company profile.
- **Settings → Pricing** (\`/app/settings/pricing\`, page title **Subscription & Pricing**) — your current plan and what it includes.
- **Settings → My Signature** (\`/app/my-signature\`) — each user's designation and signature image for printed approvals.

## Before you start

- Admin rights for Tenant. Everyone can open My Signature for themselves.

## Steps: tenant profile

1. Open **Settings → Tenant**. **Company code** is read-only (*used for login*).
2. Check **Company name \\*\\*** and **Domain (optional)**.
3. **Tenant type**: **Manufacturer** (own factory), **Buying House** (sourcing, trade module) or **Both**.
4. **Default commission mode**: **No default**, **INCLUDE** or **EXCLUDE** — used on new inquiries and quotations when the customer has no commission setting.
5. **Country code (ISO)** (for example \`BD\`) — used to import public holidays into the factory calendar. **Timezone (IANA)** (for example \`Asia/Dhaka\`).
6. Click **Save changes**. The message **Tenant settings updated successfully.** confirms it.

## Steps: plan and signature

1. **Pricing** shows your plan name (for example *Trial*), the user limit and included features. *Contact support to upgrade or change your plan.* Admins can also pay through **Settings → Overview → Subscription and licensing**.
2. **My Signature**: type your designation, upload a PNG / JPEG / WebP signature (max 2 MB) and save. It prints in the **Approved By** / **Posted By** blocks.

## What happens next

Changing **Tenant type** changes which menus appear (for example Trade for buying houses). Users should refresh.

## Tips

- Set the country and time zone before importing holidays or running attendance.
- The same company fields also appear on **Configuration**; either page saves them.

## Common problems

- **Trade menu missing after setting Buying House** → also check **Enable Trade module** in Configuration.
- **Signature not printing** → the approver has not uploaded it on **My Signature**.`,
      tags: ["settings", "tenant", "company profile", "tenant type", "commission", "pricing", "signature"],
      keywords: ["company name", "manufacturer", "buying house", "both", "time zone", "country", "plan", "subscription", "my signature"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-tenant.jpg",
      images: [
        {
          src: "/tutorials/screens/settings-tenant.jpg",
          alt: "Tenant Settings with company code, company name, domain, tenant type, default commission mode and country code",
          caption: "Settings → Tenant.",
        },
        {
          src: "/tutorials/screens/settings-pricing.jpg",
          alt: "Subscription and Pricing page showing the Trial plan and its features",
          caption: "Settings → Pricing shows your current plan.",
        },
        {
          src: "/tutorials/screens/my-signature.jpg",
          alt: "My Signature page with designation and signature upload",
          caption: "My Signature: each approver uploads their own.",
        },
      ],
      relatedAppRoutes: ["/app/settings/tenant", "/app/settings/pricing", "/app/my-signature"],
      relatedArticleIds: ["gs-tenant-modes", "settings-configuration", "wf-digital-signatures"],
    },
    {
      id: "settings-currency",
      title: "Currency: maintain exchange rates",
      summary: "Add, edit or delete exchange rates (for example 1 USD = 121.50 BDT) with an effective date and source.",
      content: `## Overview

**Settings → Currency** (\`/app/settings/currency\`, page title **Currency Management**) keeps the exchange rates used for multi-currency documents — export LCs and invoices in USD or EUR, books in BDT. Accounts staff update it.

## Before you start

- Settings access.
- Decide your source (bank rate on the date, or a monthly rate).

## Steps

1. Open **Settings → Currency** and click **Add exchange rate**.
2. Pick **From currency** (for example USD) and **To currency** (for example BDT). They cannot be the same.
3. Type the **Exchange rate (1 USD = ? BDT)**, for example \`121.50\`.
4. Set the **Effective date** and **Source** (**Manual**, **API**, **Bank**).
5. Click **Add rate**. The message **Exchange rate added.** confirms it.
6. To change a rate, click **Edit** on its row, change the rate or date, and click **Update**. **Delete** removes a rate after confirmation.

## What happens next

New documents use the active rate for their date. Existing posted vouchers keep the rate they were posted with.

## Tips

- Add both directions if you need them (USD → BDT and BDT → USD), as in the demo data.
- Add a new row for a new date instead of editing an old one — history stays correct.

## Common problems

- **"From and To currencies cannot be the same."** → choose two different currencies.
- **Document shows rate 1.0** → no rate exists for that pair or date.`,
      tags: ["settings", "currency", "exchange rate", "USD", "BDT", "multi-currency"],
      keywords: ["dollar rate", "conversion rate", "FX", "forex", "taka", "EUR"],
      estimatedMinutes: 2,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-currency.jpg",
      images: [
        {
          src: "/tutorials/screens/settings-currency-add-form.jpg",
          alt: "Add exchange rate form with From currency, To currency, rate, effective date and source",
          caption: "Add exchange rate: 1 USD = 121.50 BDT.",
        },
        {
          src: "/tutorials/screens/settings-currency.jpg",
          alt: "Currency Management with a table of exchange rates and Edit and Delete buttons",
          caption: "Exchange rates list.",
        },
      ],
      relatedAppRoutes: ["/app/settings/currency", "/app/accounts/currency"],
      relatedArticleIds: ["settings-overview", "fin-overview"],
    },
    {
      id: "settings-statutory-compliance",
      title: "Statutory compliance: VAT / VDS / TDS, bonded warehouse, payroll",
      summary:
        "Set Bangladesh VAT, VDS and TDS rates, test them with the line tax calculator, record UD/UP bonded warehouse entries and check payroll AIT / PF.",
      content: `## Overview

**Settings → Statutory compliance** (\`/app/settings/statutory-compliance\`, page title **Bangladesh statutory compliance**) has three tabs:

- **Tax rates** — VAT, VDS and TDS rates with registration number, plus a **Line tax calculator**.
- **Bonded warehouse** — a simple UD / UP register of bonded imports.
- **Payroll statutory** — a calculator for AIT and PF on a gross salary.

Used by the accounts / VAT officer and the commercial team.

## Before you start

- Settings access. Know the current rates from your VAT consultant.
- For full Mushak registers (6.1 / 6.2 / 6.3) use **Export & Import → Bond & VAT registers** instead.

## Steps: tax rates

1. Open the **Tax rates** tab.
2. Choose **Tax code** (**VAT**, **VDS** or **TDS**), type **Rate (%)** (for example 15), **Registration no.**, keep **Active** ticked, add **Notes**.
3. Click **Save tax rate**. The table on the right lists **Code**, **Rate %**, **Active**.
4. Test: in **Line tax calculator** type a **Line amount (BDT)**, tick **VAT** / **VDS** / **TDS** and click **Calculate**. You see each tax, **Total tax** and **Gross with tax**.

## Steps: bonded warehouse

1. Open **Bonded warehouse**.
2. Fill **Reference no.** (required), **UD no.**, **UP no.**, **Item description**, **Quantity**, **Value (BDT)**, **Entry date**.
3. Click **Add entry**. It appears in the list with its UD / UP and **Status**.

## Steps: payroll statutory

1. Open **Payroll statutory**.
2. Type **Gross pay (BDT)**, **AIT %**, **PF emp %** and **PF er %**.
3. Click **Calculate** to see **AIT**, **PF (employee)**, **PF (employer)** and **Net payable**.
4. Tick **Save summary for period**, set **Year** and **Month**, and click **Calculate** again to store a monthly summary.

## What happens next

Saved tax rates are used by tax calculations on documents. Saved payroll summaries can be reviewed by HR and accounts.

## Tips

- Saving the same tax code again updates its rate.
- Use the calculator to show staff how VDS is deducted before they enter real bills.

## Common problems

- **Calculator shows 0.0000 for VAT** → no VAT rate is saved yet. Save it on the left first.
- **"Reference number is required."** → fill **Reference no.** on the bonded entry.
- **"No tax rates configured yet."** → save at least VAT once.`,
      tags: ["settings", "statutory", "VAT", "VDS", "TDS", "bonded warehouse", "UD", "UP", "AIT", "PF", "Bangladesh"],
      keywords: ["mushak", "NBR", "tax rate", "withholding", "source tax", "bond", "utilization declaration", "provident fund", "income tax"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-statutory-compliance.jpg",
      images: [
        {
          src: "/tutorials/screens/settings-statutory-tax-calc.jpg",
          alt: "Tax rates tab with the line tax calculator result showing VAT, VDS, TDS, total tax and gross with tax",
          caption: "Line tax calculator: amounts stay 0.0000 until you save a rate with Save tax rate.",
        },
        {
          src: "/tutorials/screens/settings-statutory-bonded.jpg",
          alt: "Bonded warehouse tab with the new bonded entry form and the UD / UP list",
          caption: "Bonded warehouse: record UD / UP entries.",
        },
        {
          src: "/tutorials/screens/settings-statutory-payroll.jpg",
          alt: "Payroll statutory calculator with gross pay, AIT, PF employee and PF employer fields",
          caption: "Payroll statutory calculator.",
        },
      ],
      relatedAppRoutes: ["/app/settings/statutory-compliance", "/app/commercial/bd-compliance"],
      relatedArticleIds: ["commercial-bd-registers", "settings-overview", "hr-overview"],
    },
    {
      id: "settings-data-import",
      title: "Data import: load master data from Excel (dry-run, then commit)",
      summary:
        "Pick what to import, download the sample CSV, fill it, run a Dry-run preview until there are no errors, then Commit import.",
      content: `## Overview

**Settings → Data import** (\`/app/settings/data-import\`) loads lists you already have in Excel — **customers**, **vendors**, **items**, **chart of accounts** and more — so you do not type them one by one. Used once during go-live, and later for big updates.

## Before you start

- Settings access.
- Files: **CSV** or **Excel (.xlsx, first sheet only)**.
- Request a backup first (**Backup & Restore**) if you are importing hundreds of rows.

## Steps

1. Open **Settings → Data import**.
2. Choose the **Entity type** (for example \`customers\`). The line **Required columns** lists the columns you must have (for customers: \`code, name\`).
3. Click **Download sample CSV**, open it in Excel and fill one row per record. Keep the header row.
4. Click **Choose File** under **CSV or Excel file** and pick your file.
5. Click **Dry-run preview**. Nothing is saved. You see **Mode: Dry-run**, **Rows**, **OK**, **Skipped**, **Errors** and a row-by-row table with a **Message**.
6. Fix every **error** row in your file, choose the file again and run **Dry-run preview** again. Repeat until **Errors: 0**.
7. Click **Commit import** and confirm the warning (*"Import will create records in your tenant…"*). **Mode: Committed** shows it is done.

## What happens next

The new records appear in their normal lists (Customers, Vendors, Items, Chart of Accounts). Rows marked **skip** (for example already existing codes) were not changed.

## Tips

- Use your existing codes (customer code, item code) so other documents match.
- Import in this order: chart of accounts → customers / vendors → items.

## Common problems

- **"Choose a CSV or Excel (.xlsx) file first."** → pick a file before clicking a button.
- **Many rows "skip"** → those codes already exist.
- **Column not found** → the header must match **Required columns** exactly (lower case, underscores).`,
      tags: ["settings", "data import", "CSV", "Excel", "migration", "master data", "dry run"],
      keywords: ["upload excel", "bulk import", "import customers", "import items", "import vendors", "go-live data", "xlsx", "opening data"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-data-import.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Preview before commit",
          caption: "Dry-run never saves. Repeat it until Errors is 0, then Commit import.",
          imageSrc: "/tutorials/diagrams/settings/data-import-flow.svg",
          imageAlt: "Five-step diagram: entity type, sample CSV, dry-run preview, fix errors loop, commit import",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/settings-data-import.jpg",
          alt: "Data import page with entity type customers, required columns code and name, Download sample CSV link, file chooser, Dry-run preview and Commit import buttons",
          caption: "Settings → Data import.",
        },
      ],
      relatedAppRoutes: ["/app/settings/data-import", "/app/customers", "/app/settings/backup"],
      relatedArticleIds: ["settings-backup-restore", "settings-overview"],
    },
    {
      id: "settings-backup-restore",
      title: "Backup & Restore: check the real server backup",
      summary:
        "See whether the last server backup completed, request an extra backup, and know that restores are done by the platform operator.",
      content: `## Overview

**Settings → Backup & Restore** (\`/app/settings/backup\`) shows the **real status** of the database backups made on the server. It does not make a copy on your computer. Admins check it weekly and before big changes such as a data import.

## Before you start

- Settings access.
- Backups and restores are run by the **platform operator** (the team hosting P7 ERP).

## Steps

1. Open **Settings → Backup & Restore**.
2. Read **Backup status**:
   - **Completed** — the last backup finished and its archive was verified (size shown, *checksum recorded*).
   - **Requested** — you asked for a backup; waiting for the operator.
   - **Running** — in progress.
   - **Failed** — the last attempt failed; tell support.
   - **Unavailable** — no server backup recorded yet.
3. Check **Last server backup**, **Retention on server** (how many days copies are kept) and **Notes**.
4. Need an extra copy (for example before a large import)? Click **Request backup**. The button changes to **Backup already requested** until it runs.
5. **Backup history** lists recent **Server backup** and **Request** rows with **Status** and **Size**.

## What happens next

The status shows **Completed** only after the server backup really finishes and is verified — never just because you clicked.

## Tips

- *Restore is not available in the app because it replaces the whole database.* Contact support with the exact backup time you need.
- Take a backup request before importing data or changing many settings.

## Common problems

- **Status stays Requested for a long time** → the operator's scheduled job has not run yet; contact support if urgent.
- **History shows Failed** → a later Completed row means the next attempt worked.`,
      tags: ["settings", "backup", "restore", "database", "disaster recovery"],
      keywords: ["take backup", "data backup", "restore data", "lost data", "server backup", "safety copy"],
      estimatedMinutes: 2,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-backup.jpg",
      images: [
        {
          src: "/tutorials/screens/settings-backup.jpg",
          alt: "Backup and Restore page with status Completed, last server backup time, archive size, retention, Request backup button and backup history",
          caption: "Backup status Completed with a verified archive.",
        },
      ],
      relatedAppRoutes: ["/app/settings/backup"],
      relatedArticleIds: ["settings-data-import", "settings-overview"],
    },
    {
      id: "settings-activity-logs",
      title: "Activity logs: see who changed what",
      summary: "Filter the audit trail by action code or text to find settings and data changes.",
      content: `## Overview

**Settings → Activity Logs** (\`/app/settings/activity-logs\`; the **Audit** tab shows the same list) records actions in the system with **Time**, **Action**, **Resource** and **Details**. Admins and auditors use it to answer *"who changed this setting?"*.

## Before you start

- Settings access.

## Steps

1. Open **Settings → Activity Logs**.
2. Type an action code in **Filter by action (e.g. SETTINGS_USER_UPDATE)** — for example \`SETTINGS_USER_UPDATE\` for user changes.
3. Optional: type words in **Search details**.
4. Click **Apply filters**.
5. Use **Previous** / **Next** at the bottom; the line *Showing N of M logs* tells you how many matched.

## What happens next

Nothing changes — this page is read-only.

## Tips

- Without a filter you see many \`API_REQUEST\` rows (every screen load). Always filter by an action code.
- Portal logins and portal admin actions are in a separate log: **External access → View external audit log**.

## Common problems

- **Only API_REQUEST rows** → add an action filter.
- **Nothing found** → the action code must match exactly (upper case, underscores).`,
      tags: ["settings", "audit", "activity log", "history", "who changed"],
      keywords: ["audit trail", "log", "change history", "track changes", "SETTINGS_USER_UPDATE"],
      estimatedMinutes: 2,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-activity-logs.jpg",
      images: [
        {
          src: "/tutorials/screens/settings-activity-logs.jpg",
          alt: "Activity logs page with filter by action, search details and Apply filters, above a table of log rows",
          caption: "Filter by an action code to cut out API_REQUEST noise.",
        },
      ],
      relatedAppRoutes: ["/app/settings/activity-logs", "/app/settings/audit", "/app/settings/external-access/audit"],
      relatedArticleIds: ["settings-overview", "settings-external-access"],
    },
    {
      id: "settings-cheque-templates",
      title: "Cheque templates (coming soon)",
      summary: "The Cheque Templates screen lists cheque print layouts for payment vouchers; creating templates will arrive in a future release.",
      content: `## Overview

**Settings → Cheque Templates** (\`/app/settings/cheque-templates\`) will hold cheque print layouts for payment vouchers. Today it only lists templates (**Name**, **Default**) and shows *"No cheque templates yet. This feature will be available in a future release."*

## Before you start

- Nothing to set up yet.

## Steps

1. Open **Settings → Cheque Templates** to check whether templates have been added for your company.
2. Until the feature is released, print payment vouchers from **Finance → Vouchers** and write cheques by hand or with your bank's software.

## What happens next

When the feature is released this guide will be updated with the setup steps.

## Tips

- Bank payment advice is available under **Finance → Banking → Payment advice**.

## Common problems

- **Empty page** → expected; the feature is not released yet.`,
      tags: ["settings", "cheque", "check", "print", "payment voucher"],
      keywords: ["cheque print", "check printing", "bank cheque", "cheque layout"],
      estimatedMinutes: 1,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-cheque-templates.jpg",
      relatedAppRoutes: ["/app/settings/cheque-templates", "/app/accounts/vouchers", "/app/banking/payment-advice"],
      relatedArticleIds: ["settings-overview", "fin-voucher-entry"],
    },
    {
      id: "settings-external-access",
      title: "External access: buyer, bank and supplier portals",
      summary:
        "Enable each portal, invite buyers (linked to a customer), banks (with an access scope) and suppliers (linked to vendors), then manage and audit their logins.",
      content: `## Overview

Outside people can get their own, limited login — a **portal**:

- **Customer portal** — buyers see their own orders, approvals, shipments and notes.
- **Financier portal** — banks and lenders see financed orders, contracts, credit lines and risk, depending on the **access scope** you give.
- **Supplier portal** — suppliers see their own approved POs, confirm them and post ship dates.

**Settings → External access** (\`/app/settings/external-access\`) is where an admin switches portals on and invites people. Portal users are separate from staff users and never see the internal ERP.

## Before you start

- Admin rights (Settings → External access).
- The buyer must exist as a **customer**; the bank as a **financier party** (the same party used on your loan facilities); the supplier as a **vendor**.

## Steps: switch a portal on

1. Open **Settings → External access**. Each portal has a card with its number of **Principals** (portal users).
2. Click **Enable portal** on the card (it then reads **Disable portal**).
3. Optional switches: customer **Notes: on/off**; financier **Financial summary**, **Projections**, **Doc downloads**.
4. **Pending invitations** shows invites not yet accepted; **View external audit log →** opens the log.

## Steps: invite a buyer (customer portal)

1. Click **Manage customer access →**, then **Invite customer**.
2. In **Invite customer user** pick the **Customer**. Email and name fill in from the customer master; you can change them.
3. Choose **Portal role**: \`customer_viewer\` (read only) or \`customer_collaborator\` (viewer plus notes on their orders).
4. Click **Create invite**. You see *Invitation email sent to …*. If email fails, the message shows a token to share manually — send it privately.

## Steps: invite a bank user (financier portal)

1. Click **Manage financier access →**, then **Invite financier**.
2. Pick the **Financier party (bank / lender record)** — or **None** to link later.
3. Choose **Access scope** (smallest to largest): \`tenant_summary\`, \`orders_and_pipeline\`, \`financial_summary\`, \`credit_monitoring\`, \`full_financier_portal\`.
4. Choose **Portal role** (\`financier_viewer\` or \`financier_analyst\`), check **Email** and **Full name**, then **Create invite**.
5. Later, **Actions → Edit access** changes the scope or party.

## Steps: invite a supplier and manage everyone

1. **Manage supplier access →**: fill **Email**, **Full name**, tick the **vendors** this person may see, click **Send invitation**.
2. On any portal list, **Actions → Deactivate** blocks a portal user; **Reactivate** restores them.

## What the outside person does

1. Opens the emailed link (for example \`/portal/customer/accept-invite\`) and sets a password.
2. Signs in at \`/login\`, chooses **Customer portal**, **Financier portal** or **Supplier portal**, and enters your **company code**, their email and password. Bookmark \`/login?role=customer\` or \`/login?role=financier\`.
3. Forgot password: \`/forgot-password?role=customer\` (or \`financier\`, \`supplier\`).

## What happens next

Portal users see only data linked to them. Portal activity and admin actions are written to **External access audit** (\`/app/settings/external-access/audit\`): **When**, **Action**, **Resource**, **Principal**.

## Tips

- Give banks the smallest scope that does the job; \`credit_monitoring\` is needed for credit-line and collateral views.
- Staff can jump to portal login pages from **Portals** in the top bar.

## Common problems

- **"Select a customer"** → pick the customer first; the invite needs a customer link.
- **"No customers found"** → create the customer in **Merchandising → Customers** first.
- **Bank sees no credit lines** → scope is below \`credit_monitoring\`, or the financier party is not the one on the facility.`,
      tags: ["settings", "external access", "portal", "customer portal", "financier portal", "supplier portal", "invite", "bank"],
      keywords: [
        "buyer login",
        "bank login",
        "lender",
        "supplier login",
        "portal invite",
        "access scope",
        "credit monitoring",
        "external user",
        "accept invite",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: "/tutorials/screens/settings-external-access.jpg",
      infographics: [
        {
          type: "diagram",
          title: "From invite to portal",
          caption: "Admin enables and invites; the outside person accepts, signs in on the unified login page and sees only linked data. Everything is audited.",
          imageSrc: "/tutorials/diagrams/settings/external-portal-access-flow.svg",
          imageAlt: "Flow diagram: enable portal, invite, accept invite by email, unified login, use portal, manage and audit; with financier scopes from tenant_summary to full_financier_portal",
        },
        {
          type: "steps",
          title: "Invite a buyer",
          steps: [
            {
              title: "Enable the portal",
              body: "**Settings → External access → Enable portal** on the Customer portal card.",
              href: "/app/settings/external-access",
              imageSrc: "/tutorials/screens/settings-external-access.jpg",
              imageAlt: "External access page with Customer, Financier and Supplier portal cards",
            },
            {
              title: "Invite customer",
              body: "**Manage customer access → Invite customer**, pick the customer and portal role, then **Create invite**.",
              href: "/app/settings/external-access/customers",
              imageSrc: "/tutorials/screens/settings-ext-customer-invite.jpg",
              imageAlt: "Invite customer user dialog with customer, portal role, email and full name",
            },
            {
              title: "Watch the audit log",
              body: "Check acceptance and logins under **View external audit log**.",
              href: "/app/settings/external-access/audit",
              imageSrc: "/tutorials/screens/settings-ext-audit.jpg",
              imageAlt: "External access audit table with when, action, resource and principal",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/settings-ext-financier-invite.jpg",
          alt: "Invite financier user dialog with financier party, access scope, portal role, email and full name",
          caption: "Financier invite: party, access scope and role.",
        },
        {
          src: "/tutorials/screens/settings-ext-suppliers.jpg",
          alt: "Supplier portal access page with the invite form and vendor picker",
          caption: "Supplier portal access: tick the vendors this person may see.",
        },
      ],
      relatedAppRoutes: [
        "/app/settings/external-access",
        "/app/settings/external-access/customers",
        "/app/settings/external-access/financiers",
        "/app/settings/external-access/suppliers",
        "/app/settings/external-access/audit",
        "/login",
        "/forgot-password",
        "/portal/customer",
        "/portal/financier",
        "/portal/supplier",
      ],
      relatedArticleIds: ["settings-financier-portal", "inv-supplier-portal", "settings-overview", "settings-activity-logs"],
    },
    {
      id: "settings-financier-portal",
      title: "What banks see in the financier portal",
      summary:
        "A screen-by-screen list of the financier portal and the access scope each screen needs, so you can choose the right scope when inviting a bank.",
      content: `## Overview

When a bank or lender signs in to the **Financier portal** (\`/portal/financier\`), the top menu shows only the screens their **access scope** allows. Use this list to choose a scope in **Settings → External access → Manage financier access**, and to answer the bank's questions.

## Before you start

- **Financier portal** enabled in **Settings → External access**.
- For credit views, link the same **financier party** you use on **Finance → Loans & Facilities**.

## Steps: screens by scope

1. **tenant_summary** (smallest): **Dashboard**, **Alerts**, **Risk panel** (includes recovery signals).
2. **orders_and_pipeline** adds: **Order book**, **Pipeline**, **Goods movement**, **Projections**.
3. **financial_summary** adds: **Financial summary** (when the *Financial summary* switch is on).
4. **credit_monitoring** adds: **Contracts** (master contract command centre with OTD, BTB maturity, cash / CM ladder, a **Production** tab, optional AI brief), **Credit lines**, **Portfolio** (loan detail), **Order finance**, **Recovery outlook** (coverage ratio and recovery band per financed order), **Procurement**, **Raw materials**, **Stock** (collateral), **BTB liabilities**, **Inventory**, **Production**, **Traceability**, **Export finance**, **Health**, **AI confidence**.
5. **full_financier_portal** adds: **Snapshots** and **Reports** (recovery, production status and portfolio summary).

## Steps: order detail in the portal

1. In **Order book** the bank sees **financed orders only** (with credit-monitoring scope).
2. Opening an order shows tabs: **Overview** (pipeline ribbon, export path), **Production** (floor % and 14-day sewing trend), **Finance & recovery**, **Materials**.

## What happens next

Portal logins and actions are recorded in **External access audit**. Raising or lowering the scope (**Actions → Edit access**) takes effect at their next page load.

## Tips

- Start banks on \`orders_and_pipeline\`; move to \`credit_monitoring\` once facilities are linked.
- Switch off **Projections** or **Doc downloads** on the External access page if the bank should not see them.

## Common problems

- **A menu item is missing for the bank** → their scope is too small; see the list above.
- **Credit lines empty** → the facility's financier party is not the one linked to this user.`,
      tags: ["settings", "financier portal", "bank", "scope", "credit monitoring", "external access"],
      keywords: ["bank portal", "lender view", "credit lines", "BTB liabilities", "stock collateral", "recovery outlook", "order finance"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/settings-ext-financier-invite.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Access scopes",
          caption: "Each scope includes everything in the scopes before it.",
          imageSrc: "/tutorials/diagrams/settings/external-portal-access-flow.svg",
          imageAlt: "Portal access flow with the five financier access scopes shown from smallest to largest",
        },
      ],
      relatedAppRoutes: [
        "/app/settings/external-access/financiers",
        "/portal/financier",
        "/portal/financier/contracts",
        "/portal/financier/order-book",
        "/portal/financier/credit-lines",
        "/portal/financier/recovery-outlook",
        "/portal/financier/stock-collateral",
        "/portal/financier/btb-liabilities",
        "/portal/financier/reports",
        "/portal/financier/risk-panel",
      ],
      relatedArticleIds: ["settings-external-access", "fin-loans-facilities"],
    },
  ],
};
