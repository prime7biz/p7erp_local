# Prime7 ERP UI Color System

This guide keeps Prime7 brand identity strong while improving enterprise readability and status clarity.

## 1) Core Rules

- Brand orange is for brand emphasis and primary actions only.
- Status colors are strictly semantic:
  - `status.danger` for critical issues and destructive actions
  - `status.warning` for warnings and caution states
  - `status.success` for completed/healthy states
  - `status.info` for neutral progress/info states
  - `status.neutral` for draft/inactive/low-emphasis states
- Neutral surfaces and text colors carry layout hierarchy.
- Never rely on color alone; pair with labels/icons where possible.

## 2) Token Groups

Defined in `frontend/tailwind.config.js`:

- `brand.primary`, `brand.primary-foreground`
- `surface.base`, `surface.raised`, `surface.subtle`, `surface.inverse`
- `text.primary`, `text.secondary`, `text.muted`, `text.inverse`
- `border.default`, `border.strong`, `border.subtle`
- `status.success|warning|danger|info|neutral` (+ `-subtle`, `-foreground`)
- `focus.ring`

## 3) Status Matrix

- Error/Critical:
  - Text/Icon: `text-status-danger-foreground`
  - Background: `bg-status-danger-subtle`
  - Border: `border-status-danger/20`
- Warning:
  - Text/Icon: `text-status-warning-foreground`
  - Background: `bg-status-warning-subtle`
  - Border: `border-status-warning/20`
- Success:
  - Text/Icon: `text-status-success-foreground`
  - Background: `bg-status-success-subtle`
  - Border: `border-status-success/20`
- Info/In-progress:
  - Text/Icon: `text-status-info-foreground`
  - Background: `bg-status-info-subtle`
  - Border: `border-status-info/20`
- Neutral/Draft:
  - Text/Icon: `text-status-neutral-foreground`
  - Background: `bg-status-neutral-subtle`
  - Border: `border-border`

## 4) Accessibility Gates (WCAG aligned)

Before merge, confirm:

- Normal text contrast >= 4.5:1
- Large text contrast >= 3:1
- Non-text contrast (icons, key borders, focus indicators) >= 3:1
- Focus ring is visible on all interactive controls
- Color is not the only status signal on critical states

Reference standards:

- W3C contrast minimum: <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html>
- W3C non-text contrast: <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>

## 5) Pilot Rollout Targets

- Shared primitives:
  - `frontend/src/components/ui/button.tsx`
  - `frontend/src/components/ui/badge.tsx`
- App shell and hierarchy:
  - `frontend/src/components/Layout.tsx`
- High-impact screens:
  - `frontend/src/pages/Dashboard.tsx`
  - `frontend/src/pages/app/OrdersPage.tsx`
- Public brand alignment:
  - `frontend/src/components/public/PublicLayout.tsx`
  - `frontend/src/pages/Landing.tsx`

## 6) PR Checklist Snippet

Add this to PR descriptions for UI work:

- [ ] Uses semantic tokens, not ad-hoc raw status colors
- [ ] Keeps orange for brand/primary action roles only
- [ ] Status badges/messages follow the status matrix
- [ ] Focus states remain visible and clear
- [ ] Basic contrast checks done for changed components

## 7) Baseline Audit Snapshot

Initial raw utility usage count in key files before rollout:

- `Dashboard.tsx`: 147 color utility usages
- `Layout.tsx`: 70 color utility usages
- `Landing.tsx`: 65 color utility usages
- `PublicLayout.tsx`: 50 color utility usages

This baseline helps track migration progress from ad-hoc to semantic tokens.
