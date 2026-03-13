# HR UAT Test Cases (ID-Based)

This document expands the HR checklist into executable test cases with IDs.

Status values:
- Not Run
- Pass
- Fail
- Blocked

Severity values:
- Critical
- High
- Medium
- Low

---

## Test Case Table

| Test ID | Module | Scenario | Preconditions | Steps | Expected Result | Severity | Status |
|---|---|---|---|---|---|---|---|
| HR-UAT-001 | Auth | HR user login with company code | User exists and tenant active | 1) Open login 2) Enter company code, username/email, password 3) Submit | Login succeeds and HR menus appear per role | Critical | Pass |
| HR-UAT-002 | Departments | Create department | HR user logged in | 1) Open HR Departments 2) Enter code + name 3) Save | Department created and shown in list | High | Pass |
| HR-UAT-003 | Departments | Edit department | Department exists | 1) Edit code/name/details 2) Save | Updated values appear and persist after reload | Medium | Pass |
| HR-UAT-004 | Departments | Duplicate department validation | Existing department code/name present | 1) Try to create duplicate 2) Save | API/UI blocks save with clear duplicate error | Critical | Pass |
| HR-UAT-005 | Designations | Create designation and map department | Department exists | 1) Open HR Designations 2) Add code + title + department 3) Save | Designation created and mapping shown in list | High | Pass |
| HR-UAT-006 | Designations | Edit designation details | Designation exists | 1) Edit title/department/status 2) Save | Updates persist in list and reload | Medium | Pass |
| HR-UAT-007 | Designations | Duplicate designation validation | Existing designation code/title present | 1) Try duplicate code/title 2) Save | API/UI blocks save with clear duplicate error | Critical | Pass |
| HR-UAT-008 | Employees | Create employee with required fields | At least one department/designation exists | 1) Open Employees 2) Enter employee code + first name 3) Save | Employee created and shown in list | Critical | Pass |
| HR-UAT-009 | Employees | Save employee optional fields | Employee create form available | 1) Fill optional fields (last name, email, phone, joining date) 2) Save | Optional fields persist and display correctly | High | Pass |
| HR-UAT-010 | Employees | Map employee to department/designation | Department/designation exists | 1) Select mappings 2) Save | Employee mapping saved correctly | High | Pass |
| HR-UAT-011 | Employees | Employee list search | Multiple employees exist | 1) Search by code/name/email | Matching rows shown accurately | Medium | Pass |
| HR-UAT-012 | Employees | Active/inactive filter behavior | Active and inactive employees exist | 1) Toggle show inactive 2) Observe list | Filter reflects status correctly | Medium | Pass |
| HR-UAT-013 | Employees | Employee detail edit flow | Employee exists | 1) Open employee detail 2) Edit fields 3) Save | Changes saved and reflected in list/detail | High | Pass |
| HR-UAT-014 | Employees | Activate/deactivate employee | Employee exists | 1) Open employee detail 2) Deactivate/Activate | Employee status changes and persists | Critical | Pass |
| HR-UAT-015 | Employees | Reporting manager self-check | Employee exists | 1) Try setting employee as own manager 2) Save | API rejects with clear validation error | Critical | Pass |
| HR-UAT-016 | Security | Tenant data isolation | Two tenants with distinct HR data | 1) Login tenant A 2) Check HR data 3) Login tenant B | No cross-tenant data visible | Critical | Pass |
| HR-UAT-017 | Security | Unauthorized access blocked | Session without auth token | 1) Call protected HR page/API | Access blocked (401/403) | Critical | Pass |
| HR-UAT-018 | Security | User-tenant mismatch blocked | Auth user and header tenant mismatch | 1) Trigger HR API request with mismatch | Request rejected with forbidden error | Critical | Pass |
| HR-UAT-019 | API UX | Invalid FK validation clarity | Non-existent department/designation id used | 1) Submit employee/designation with bad FK | API returns clear not-found validation message | High | Pass |
| HR-UAT-020 | API UX | Empty-state stability | No HR records available | 1) Open Departments/Designations/Employees pages | Pages render stable empty states with no crash | Medium | Pass |
| HR-UAT-021 | Attendance | Shift master CRUD | HR user logged in | 1) Create shift 2) Edit 3) List | Shift changes persist correctly | High | Pass |
| HR-UAT-022 | Attendance | Attendance daily entry | Employees exist | 1) Create attendance entry 2) Update status/time | Attendance saved and listed correctly | Critical | Pass |
| HR-UAT-023 | Attendance | Regularization workflow | Attendance entry exists | 1) Submit regularization 2) Approve/reject | State transitions and data updates are correct | Critical | Pass |
| HR-UAT-024 | Leave | Leave type and policy setup | HR admin logged in | 1) Create leave type 2) Create policy | Types/policies created successfully | High | Pass |
| HR-UAT-025 | Leave | Leave request workflow | Employee and leave balance exist | 1) Create request 2) Submit 3) Approve/reject | Workflow and status transitions work | Critical | Pass |
| HR-UAT-026 | Leave | Leave balance impact | Approved leave request exists | 1) Review leave balance after approval | Balance updates accurately | High | Pass |
| HR-UAT-027 | Payroll | Payroll setup and structures | Employees and components exist | 1) Create components 2) Create structure lines | Setup saved and reusable for runs | High | Pass |
| HR-UAT-028 | Payroll | Payroll run lifecycle | Payroll period exists | 1) Create run 2) Finalize 3) Approve | Status transitions follow allowed workflow | Critical | Pass |
| HR-UAT-029 | Payroll | Payroll post with finance integration | Approved run exists and period open | 1) Post run | Voucher created and run status posted | Critical | Pass |
| HR-UAT-030 | Payroll | Payroll post blocked in closed period | Period closed | 1) Attempt posting | Posting blocked with clear message | Critical | Pass |
| HR-UAT-031 | Payroll | Payslip generation | Posted/approved run exists | 1) Generate/list payslips | Payslips generated and listed correctly | High | Pass |
| HR-UAT-032 | Performance | Performance cycle-goal-review flow | Employees exist | 1) Create cycle 2) Add goal 3) Submit review | Performance workflow persists and returns correctly | Medium | Pass |
| HR-UAT-033 | Recruitment | Requisition to offer flow | Recruitment module ready | 1) Create requisition 2) Add candidate 3) Interview 4) Offer | Workflow completes with valid status transitions | Medium | Pass |
| HR-UAT-034 | ESS | My profile and self-data isolation | Employee linked user exists | 1) Open ESS pages 2) Update profile | Only self data visible and update works | Critical | Pass |
| HR-UAT-035 | Reports | HR reports dashboard data load | Seed data exists | 1) Open HR reports dashboard | Summary widgets/lists load without errors | Medium | Pass |

---

## Execution Notes

- Run all `Critical` test cases first for early go/no-go confidence.
- Capture screenshot for each `Fail` with exact date/time and user.
- Re-test failed cases after fix and update status to `Pass` only after full flow is revalidated.

---

## Defect Mapping (Optional)

Add defect IDs next to failing test IDs:
- Example: `HR-UAT-014 -> BUG-301 (Deactivate action fails with 500 error)`

