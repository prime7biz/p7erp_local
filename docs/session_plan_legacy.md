# Objective
Fix multiple quotation issues: edit mode not loading saved data, view page showing wrong cost totals, no approval workflow buttons on view page, and print layout conflicts.

# Tasks

### T001: Fix view page Cost Summary to use stored totals instead of recalculating from wrong fields
- **Blocked By**: []
- **Details**:
  - The view page `calculateTotals()` tries to recalculate totals by summing child records, but uses unreliable field names
  - The quotation record already stores `materialCost`, `manufacturingCost`, `otherCost`, `totalCost`, `quotedPrice` — these are computed correctly during save
  - Fix: Use the stored top-level cost fields directly instead of recalculating, falling back to recalculation only if they're missing
  - Also keep the recalculated totals as a cross-check but prefer the stored values
  - File: `client/src/pages/quotations/quotation-view.tsx` (lines 113-147)
  - Acceptance: View page Cost Summary shows correct values matching what was entered in the form

### T002: Add approval workflow buttons to quotation view page
- **Blocked By**: []
- **Details**:
  - Currently the view page only has "Edit" and "Convert to Order" — no Submit/Approve/Send buttons
  - The form page has these buttons but the user naturally navigates to the view page from the list
  - Add status-dependent action buttons to the view page header:
    - DRAFT → "Submit for Review" button (sets status to SUBMITTED)
    - SUBMITTED → "Approve" button (sets status to APPROVED)
    - APPROVED → "Mark as Sent" button (sets status to SENT)
  - Use PATCH /api/quotations/:id route (which already exists) to update status
  - File: `client/src/pages/quotations/quotation-view.tsx`
  - Acceptance: Users can advance quotation through workflow stages from the view page

### T003: Fix print layout — resolve CSS conflicts between index.css and print.css
- **Blocked By**: []
- **Details**:
  - `client/src/index.css` sets print body font to `9px` (line 132)
  - `client/src/styles/print.css` sets it to `12pt` (line 27) and uses serif font
  - `index.css` forces `grid-cols-1` to 4 columns (line 148) which may not be desired for all pages
  - `print.css` sets `background: transparent !important` on `*` (line 14) which removes the orange banner
  - `index.css` hides ALL buttons including print/export (line 172), then tries to show comboboxes back
  - Fix: Make `print.css` only apply to `.print-layout` wrapped components (it's a generic print layout), ensure `index.css` print rules only apply to the quotation form via scoping to `.quotation-form-container`, and remove the conflicting `*` background rule from print.css that kills the orange banner
  - Files: `client/src/index.css`, `client/src/styles/print.css`
  - Acceptance: Print from quotation form shows proper orange banner header, correct font size, compact layout, and 5-signature footer

### T004: Verify and fix edit mode data loading
- **Blocked By**: []
- **Details**:
  - The GET /:id endpoint now returns nested materials/manufacturing/otherCosts/sizeRatios (fixed in previous session)
  - The form's useEffect at line 231 populates form fields from `existingQuotation`
  - Need to verify the edit form properly populates all sections when navigating to /quotations/:id/edit
  - Check if the queryKey `['/api/quotations', quotationDbId]` matches the response format
  - Also check: after creating a new quotation, `navigate(/quotations/${data.id})` goes to the VIEW page — this is correct behavior but the user might expect to stay on the form
  - File: `client/src/pages/quotations/quotation-form.tsx`
  - Acceptance: Editing a saved quotation loads all materials, manufacturing costs, other costs, and size ratios correctly

---

*Source: replit-legacy/primeX-ERP/.local/session_plan.md (reference PrimeX quotation fixes).*
