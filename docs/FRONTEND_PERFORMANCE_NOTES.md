# Frontend Performance Notes (P7 ERP)

This document summarizes the frontend performance optimizations already implemented, and how to continue safely.

## Goals

- Keep initial website load fast.
- Load heavy ERP pages only when needed.
- Improve in-app navigation speed with smart prefetching.
- Keep directory structure clear and maintainable.

## What Was Implemented

## 1) Route-level code splitting

- Public and protected app routes are split.
- Protected ERP routing is moved to:
  - `frontend/src/app/AppProtectedRouter.tsx`
- Main router lazily loads protected router:
  - `frontend/src/app/router.tsx`

Result:
- Public visitors do not download full ERP app code on first load.

## 2) Lazy loading for large modules

In `AppProtectedRouter.tsx`, many pages are lazy-loaded, including:

- Settings pages
- Tutorials pages
- Reports and analytics pages
- HR pages
- Manufacturing pages
- Multiple heavy app-core pages (finance/inventory workflows)

Result:
- Code is downloaded per route, not all at once.

## 3) Chunk strategy in Vite

- File: `frontend/vite.config.ts`
- Added manual chunk groups for:
  - `pages-hr`
  - `pages-manufacturing`
  - `pages-reports`
  - `pages-public`
  - `api-client`
  - selected vendor groups (`react-router`, `motion`, `icons`)
- Removed broad forced catch-all chunk for all app pages.

Result:
- Better chunk granularity.
- Lazy routes now produce their own small route chunks.

## 4) Smart prefetching

- File: `frontend/src/app/prefetchRoutes.ts`
- Sidebar link prefetch on hover/focus:
  - wired in `frontend/src/components/Layout.tsx`
- Top search interaction prefetch (hover/focus/click):
  - also wired in `Layout.tsx`
- Deduped prefetch with in-memory key set.

Result:
- Faster second-step navigation without increasing initial page cost too much.

## Current Verification Status

Latest checks completed:

- `npm run build` passes
- TypeScript build passes
- No linter issues introduced by performance changes

## Safe Next Steps

If you want to optimize further, prefer this order:

1. Add lazy loading to any newly created heavy pages.
2. Add prefetch rules only for high-traffic routes.
3. Re-run:
   - `npm run build`
4. Keep each optimization small and testable.

## Caution Notes

- Do not over-prefetch too many routes at once, or you lose initial-load benefits.
- Keep dashboard shell responsive (layout should stay visible while route chunk loads).
- Keep route paths unchanged when refactoring to lazy imports.

## Key Files To Remember

- `frontend/src/app/router.tsx`
- `frontend/src/app/AppProtectedRouter.tsx`
- `frontend/src/app/prefetchRoutes.ts`
- `frontend/src/components/Layout.tsx`
- `frontend/vite.config.ts`
