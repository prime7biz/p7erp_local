"""Schema foundation for HR employee onboarding: migrations 288 + 289 and their ORM models.

Static tests need no database. The DB tests run inside one rolled-back transaction
(fixture ``db_session_integration``) against a database upgraded to head.

Run: docker compose exec backend pytest tests/test_hr_onboarding_migrations.py -q
"""

from __future__ import annotations

import importlib.util
import os
import uuid
from datetime import datetime
from pathlib import Path

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from app.common.document_signature import apply_document_signature, compute_signature_hash
from app.database import Base
from app.models import Employee, HrEmployeeOnboardingRun, HrEmployeeOnboardingTask, HrGeneratedEmployeeDocument
from tests.merch_fixtures import create_merch_tenant_with_user
from tests.test_rls_policies import _become_probe_role, _set_context, owner_session  # noqa: F401

VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"

NEW_EMPLOYEE_COLUMNS = {
    "father_name": "character varying",
    "mother_name": "character varying",
    "spouse_name": "character varying",
    "religion": "character varying",
    "nationality": "character varying",
    "present_address_line": "character varying",
    "present_city": "character varying",
    "present_district": "character varying",
    "present_postal_code": "character varying",
    "present_country": "character varying",
    "permanent_address_line": "character varying",
    "permanent_city": "character varying",
    "permanent_district": "character varying",
    "permanent_postal_code": "character varying",
    "permanent_country": "character varying",
    "emergency_contact_relation": "character varying",
    "mobile_is_bkash": "boolean",
    "salary_payment_method": "character varying",
    "bank_account_name": "character varying",
    "bank_account_number": "character varying",
    "bank_name": "character varying",
    "bank_branch": "character varying",
    "bank_routing_no": "character varying",
    "probation_months": "integer",
    "facilities": "jsonb",
}
NEW_TABLES = (
    "hr_employee_onboarding_runs",
    "hr_employee_onboarding_tasks",
    "hr_generated_employee_documents",
)


def _load(filename: str):
    spec = importlib.util.spec_from_file_location(filename.removesuffix(".py"), VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _source(filename: str) -> str:
    return (VERSIONS / filename).read_text(encoding="utf-8")


# --- Static (no database) -----------------------------------------------------------------------


def test_revision_chain_287_288_289():
    m288 = _load("288_hr_employee_onboarding_fields.py")
    m289 = _load("289_hr_onboarding_tasks_documents.py")
    assert (m288.revision, m288.down_revision) == ("288", "287")
    assert (m289.revision, m289.down_revision) == ("289", "288")


def test_288_adds_only_nullable_columns_and_keeps_legacy_address():
    module = _load("288_hr_employee_onboarding_fields.py")
    names = {name for name, _ in module._COLUMNS}
    assert names == set(NEW_EMPLOYEE_COLUMNS)
    assert not names & {"address_line", "city", "country"}
    src = _source("288_hr_employee_onboarding_fields.py")
    assert "nullable=True" in src and "nullable=False" not in src
    assert "alter_column" not in src and "drop_column(TABLE, name)" in src  # only the downgrade drops


def test_289_downgrade_removes_trigger_and_function_before_tables():
    src = _source("289_hr_onboarding_tasks_documents.py")
    down = src[src.index("def downgrade()") :]
    assert down.index("DROP TRIGGER") < down.index("DROP FUNCTION") < down.index("op.drop_table(DOC_TABLE)")
    assert down.count("op.drop_table(") == 3
    up = src[src.index("def upgrade()") : src.index("def downgrade()")]
    assert up.count("_enable_rls(") == 3 and down.count("_disable_rls(") == 3
    assert 'RLS_POLICY_NAME = "p7_tenant_isolation"' in src


def test_orm_models_match_plan_constraints():
    tables = Base.metadata.tables
    for name in NEW_TABLES:
        assert name in tables
    emp = Employee.__table__
    for col in NEW_EMPLOYEE_COLUMNS:
        assert emp.c[col].nullable, col

    def uniques(table):
        return {tuple(c.name for c in u.columns) for u in table.constraints if u.__class__.__name__ == "UniqueConstraint"}

    runs = tables["hr_employee_onboarding_runs"]
    tasks = tables["hr_employee_onboarding_tasks"]
    docs = tables["hr_generated_employee_documents"]
    assert ("tenant_id", "request_id") in uniques(runs)
    assert ("employee_id", "task_type") in uniques(tasks)
    assert ("tenant_id", "employee_id", "document_type", "document_version") in uniques(docs)
    assert ("tenant_id", "generation_request_id") in uniques(docs)

    def ondelete(table, column):
        (fk,) = table.c[column].foreign_keys
        return fk.ondelete

    assert ondelete(runs, "tenant_id") == "CASCADE" and ondelete(runs, "employee_id") == "SET NULL"
    assert ondelete(tasks, "tenant_id") == "CASCADE" and ondelete(tasks, "employee_id") == "CASCADE"
    assert ondelete(docs, "tenant_id") == "CASCADE" and ondelete(docs, "employee_id") == "RESTRICT"
    assert docs.c.verification_id.unique and not docs.c.verification_id.nullable
    assert docs.c.document_version.type.python_type is int
    assert docs.c.snapshot_schema_version.type.python_type is int


# --- Database ---------------------------------------------------------------------------------------


def _owner_database_url() -> str | None:
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    if not raw:
        return None
    return raw.replace("postgresql://", "postgresql+asyncpg://", 1) if raw.startswith("postgresql://") else raw


@pytest.mark.asyncio
async def test_upgrade_and_downgrade_288_289():
    """Run 289 -> 288 -> 287 -> 288 -> 289 on one connection, then roll everything back.

    PostgreSQL DDL is transactional, so the shared database is left exactly as it was.
    """
    url = _owner_database_url()
    if not url:
        pytest.skip("DATABASE_URL not set — run pytest inside the backend container with compose.")
    m288 = _load("288_hr_employee_onboarding_fields.py")
    m289 = _load("289_hr_onboarding_tasks_documents.py")

    def state(sync_conn) -> tuple[set[str], set[str], int]:
        insp = inspect(sync_conn)
        tables = set(insp.get_table_names()) & set(NEW_TABLES)
        cols = {c["name"] for c in insp.get_columns("hr_employees")} & set(NEW_EMPLOYEE_COLUMNS)
        trigger = sync_conn.execute(
            text("SELECT count(*) FROM pg_trigger WHERE tgname = :n"), {"n": m289.TRIGGER_NAME}
        ).scalar()
        return tables, cols, trigger

    def round_trip(sync_conn) -> list[tuple[set[str], set[str], int]]:
        seen = [state(sync_conn)]
        with Operations.context(MigrationContext.configure(sync_conn)):
            m289.downgrade()
            seen.append(state(sync_conn))
            m288.downgrade()
            seen.append(state(sync_conn))
            m288.upgrade()
            seen.append(state(sync_conn))
            m289.upgrade()
            seen.append(state(sync_conn))
        return seen

    engine = create_async_engine(url, echo=False)
    try:
        async with engine.connect() as conn:
            trans = await conn.begin()
            try:
                head, after_289_down, after_288_down, after_288_up, after_289_up = await conn.run_sync(round_trip)
            finally:
                await trans.rollback()
    finally:
        await engine.dispose()

    all_tables, all_cols = set(NEW_TABLES), set(NEW_EMPLOYEE_COLUMNS)
    assert head == (all_tables, all_cols, 1), "database must be at head (alembic upgrade head)"
    assert after_289_down == (set(), all_cols, 0)
    assert after_288_down == (set(), set(), 0)
    assert after_288_up == (set(), all_cols, 0)
    assert after_289_up == (all_tables, all_cols, 1)


@pytest.mark.asyncio
async def test_employee_columns_are_nullable_and_legacy_address_remains(db_session_integration):
    rows = (
        await db_session_integration.execute(
            text(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = 'hr_employees'"
            )
        )
    ).all()
    cols = {r.column_name: r for r in rows}
    for name, data_type in NEW_EMPLOYEE_COLUMNS.items():
        assert name in cols, f"missing hr_employees.{name} (run alembic upgrade head)"
        assert cols[name].data_type == data_type, name
        assert cols[name].is_nullable == "YES", name
    for legacy in ("address_line", "city", "country"):
        assert legacy in cols


@pytest.mark.asyncio
async def test_new_tables_have_tenant_policy_and_global_unique_verification_index(db_session_integration):
    db = db_session_integration
    policies = {
        r.tablename
        for r in (
            await db.execute(
                text("SELECT tablename FROM pg_policies WHERE schemaname = current_schema() AND policyname = 'p7_tenant_isolation'")
            )
        ).all()
    }
    assert set(NEW_TABLES) <= policies
    unique_verification = (
        await db.execute(
            text(
                "SELECT count(*) FROM pg_indexes WHERE tablename = 'hr_generated_employee_documents' "
                "AND indexdef LIKE 'CREATE UNIQUE INDEX%(verification_id)'"
            )
        )
    ).scalar()
    assert unique_verification == 1


async def _employee(db, tenant, code: str) -> Employee:
    emp = Employee(tenant_id=tenant.id, employee_code=code, first_name="Onboard", is_active=True)
    db.add(emp)
    await db.flush()
    return emp


def _doc(tenant, emp, *, version=1, request_id=None, doc_type="APPOINTMENT_LETTER") -> HrGeneratedEmployeeDocument:
    return HrGeneratedEmployeeDocument(
        tenant_id=tenant.id,
        employee_id=emp.id,
        document_type=doc_type,
        document_version=version,
        snapshot_schema_version=1,
        snapshot={"employee_code": emp.employee_code, "version": version},
        generation_request_id=request_id or uuid.uuid4().hex,
        verification_id=f"VFY-{uuid.uuid4().hex[:16].upper()}",
    )


@pytest.mark.asyncio
async def test_employee_onboarding_fields_round_trip(db_session_integration):
    db = db_session_integration
    tenant, _, _ = await create_merch_tenant_with_user(db)
    emp = await _employee(db, tenant, "ONB-0001")
    emp.father_name = "Father"
    emp.present_district = "Dhaka"
    emp.mobile_is_bkash = True
    emp.salary_payment_method = "bkash"
    emp.probation_months = 3
    emp.facilities = ["Lunch", "Transport"]
    await db.flush()
    emp_id = emp.id
    got = (
        await db.execute(select(Employee).where(Employee.id == emp_id).execution_options(populate_existing=True))
    ).scalar_one()
    assert (got.father_name, got.present_district, got.mobile_is_bkash, got.probation_months) == (
        "Father",
        "Dhaka",
        True,
        3,
    )
    assert got.facilities == ["Lunch", "Transport"]
    assert got.address_line is None and got.permanent_city is None and got.bank_name is None


@pytest.mark.asyncio
async def test_signed_document_rejects_update_and_delete_but_unsigned_allows_them(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    emp = await _employee(db, tenant, "ONB-0002")

    draft = _doc(tenant, emp, version=1)
    db.add(draft)
    await db.flush()
    draft.snapshot = {"edited": True}  # unsigned: still editable
    await db.flush()
    await db.execute(text("DELETE FROM hr_generated_employee_documents WHERE id = :i"), {"i": draft.id})

    doc = _doc(tenant, emp, version=1)
    doc.generated_by = user.id
    db.add(doc)
    await db.flush()
    apply_document_signature(doc, {"verification_id": doc.verification_id, **doc.snapshot})
    await db.flush()
    assert doc.signed_at is not None and doc.signature_hash == compute_signature_hash(
        {"verification_id": doc.verification_id, **doc.snapshot}
    )

    with pytest.raises(DBAPIError, match="signed HR document is immutable"):
        async with db.begin_nested():
            await db.execute(
                text("UPDATE hr_generated_employee_documents SET snapshot = '{}'::jsonb WHERE id = :i"), {"i": doc.id}
            )
    with pytest.raises(DBAPIError, match="signed HR document is immutable"):
        async with db.begin_nested():
            await db.execute(text("DELETE FROM hr_generated_employee_documents WHERE id = :i"), {"i": doc.id})
    still = (
        await db.execute(text("SELECT snapshot FROM hr_generated_employee_documents WHERE id = :i"), {"i": doc.id})
    ).scalar()
    assert still["version"] == 1


@pytest.mark.asyncio
async def test_deleting_the_tenant_is_not_blocked_by_signed_documents(db_session_integration):
    """The immutability trigger lets through only the delete cascaded from the tenant row itself."""
    db = db_session_integration
    tenant, _, _ = await create_merch_tenant_with_user(db)
    emp = await _employee(db, tenant, "ONB-0007")
    doc = _doc(tenant, emp)
    db.add(doc)
    await db.flush()
    apply_document_signature(doc, {"verification_id": doc.verification_id})
    await db.flush()
    tenant_id, doc_id = tenant.id, doc.id
    async with db.begin_nested():
        await db.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tenant_id})
    left = (
        await db.execute(text("SELECT count(*) FROM hr_generated_employee_documents WHERE id = :i"), {"i": doc_id})
    ).scalar()
    assert left == 0


@pytest.mark.asyncio
async def test_generated_document_unique_keys_and_checks(db_session_integration):
    db = db_session_integration
    tenant_a, _, _ = await create_merch_tenant_with_user(db)
    tenant_b, _, _ = await create_merch_tenant_with_user(db)
    emp_a = await _employee(db, tenant_a, "ONB-0003")
    emp_b = await _employee(db, tenant_b, "ONB-0004")

    first = _doc(tenant_a, emp_a, version=1, request_id="req-1")
    db.add(first)
    await db.flush()

    # Same tenant + employee + type + version.
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(_doc(tenant_a, emp_a, version=1, request_id="req-2"))
            await db.flush()
    # Same tenant + generation request id.
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(_doc(tenant_a, emp_a, version=2, request_id="req-1"))
            await db.flush()
    # verification_id is unique across tenants.
    clash = _doc(tenant_b, emp_b, version=1, request_id="req-1")
    clash.verification_id = first.verification_id
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(clash)
            await db.flush()
    # The same request id in another tenant is fine; versions bump per type.
    db.add(_doc(tenant_b, emp_b, version=1, request_id="req-1"))
    db.add(_doc(tenant_a, emp_a, version=2, request_id="req-3"))
    db.add(_doc(tenant_a, emp_a, version=1, request_id="req-4", doc_type="JOB_DESCRIPTION"))
    await db.flush()
    # Check constraints: bad type, version 0, signature pair, non-object snapshot.
    for mutate in (
        lambda d: setattr(d, "document_type", "PAYSLIP"),
        lambda d: setattr(d, "document_version", 0),
        lambda d: setattr(d, "signed_at", datetime.utcnow()),
        lambda d: setattr(d, "snapshot", [1, 2]),
    ):
        bad = _doc(tenant_a, emp_a, version=9, request_id=uuid.uuid4().hex)
        mutate(bad)
        with pytest.raises(IntegrityError):
            async with db.begin_nested():
                db.add(bad)
                await db.flush()


@pytest.mark.asyncio
async def test_generated_document_employee_is_restricted(db_session_integration):
    db = db_session_integration
    tenant, _, _ = await create_merch_tenant_with_user(db)
    emp = await _employee(db, tenant, "ONB-0005")
    db.add(_doc(tenant, emp))
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            await db.execute(text("DELETE FROM hr_employees WHERE id = :i"), {"i": emp.id})


@pytest.mark.asyncio
async def test_new_tables_rls_isolates_tenants_at_runtime(owner_session):  # noqa: F811
    """Under a non-owner role the p7_tenant_isolation policy hides and refuses other tenants' rows."""
    db = owner_session
    ids: dict[str, dict[int, int]] = {t: {} for t in NEW_TABLES}
    tenants = []
    for n in (1, 2):
        tenant, user, _ = await create_merch_tenant_with_user(db)
        emp = await _employee(db, tenant, f"RLS-{n}")
        run = HrEmployeeOnboardingRun(
            tenant_id=tenant.id, request_id=f"rls-req-{n}", employee_id=emp.id, created_by=user.id,
            status="PENDING", employee_step_status="PENDING", payroll_step_status="PENDING",
            gate_pass_step_status="PENDING", checklist_step_status="PENDING",
        )
        task = HrEmployeeOnboardingTask(tenant_id=tenant.id, employee_id=emp.id, task_type="MEDICAL_EXAM", status="DUE")
        doc = _doc(tenant, emp)
        db.add_all([run, task, doc])
        await db.flush()
        ids["hr_employee_onboarding_runs"][tenant.id] = run.id
        ids["hr_employee_onboarding_tasks"][tenant.id] = task.id
        ids["hr_generated_employee_documents"][tenant.id] = doc.id
        tenants.append((tenant.id, emp.id))
    (a_id, a_emp), (b_id, _b_emp) = tenants

    await _become_probe_role(db)
    for table, by_tenant in ids.items():
        all_ids = list(by_tenant.values())
        for tenant_id, own in by_tenant.items():
            await _set_context(db, tenant_id=tenant_id, bypass=False)
            visible = set((await db.execute(text(f"SELECT id FROM {table} WHERE id = ANY(:ids)"), {"ids": all_ids})).scalars())
            assert visible == {own}, table
        await _set_context(db, tenant_id=None, bypass=False)
        assert (await db.execute(text(f"SELECT count(*) FROM {table} WHERE id = ANY(:ids)"), {"ids": all_ids})).scalar() == 0
        await _set_context(db, tenant_id=None, bypass=True)
        assert (await db.execute(text(f"SELECT count(*) FROM {table} WHERE id = ANY(:ids)"), {"ids": all_ids})).scalar() == 2

    # Writing a row for another tenant is refused by the policy's WITH CHECK.
    await _set_context(db, tenant_id=b_id, bypass=False)
    with pytest.raises(DBAPIError, match="row-level security"):
        async with db.begin_nested():
            await db.execute(
                text(
                    "INSERT INTO hr_employee_onboarding_tasks (tenant_id, employee_id, task_type, status, created_at, updated_at) "
                    "VALUES (:t, :e, 'EMPLOYEE_PHOTO', 'DUE', now(), now())"
                ),
                {"t": a_id, "e": a_emp},
            )


@pytest.mark.asyncio
async def test_run_and_task_constraints(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    emp = await _employee(db, tenant, "ONB-0006")

    run = HrEmployeeOnboardingRun(tenant_id=tenant.id, request_id="req-A", employee_id=emp.id, created_by=user.id)
    run.status = run.employee_step_status = "PENDING"
    run.payroll_step_status = run.gate_pass_step_status = run.checklist_step_status = "PENDING"
    db.add(run)
    await db.flush()

    dup = HrEmployeeOnboardingRun(tenant_id=tenant.id, request_id="req-A")
    dup.status = dup.employee_step_status = dup.payroll_step_status = "PENDING"
    dup.gate_pass_step_status = dup.checklist_step_status = "PENDING"
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(dup)
            await db.flush()

    bad_status = HrEmployeeOnboardingRun(tenant_id=tenant.id, request_id="req-B")
    bad_status.status = "DONE"
    bad_status.employee_step_status = bad_status.payroll_step_status = "PENDING"
    bad_status.gate_pass_step_status = bad_status.checklist_step_status = "PENDING"
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(bad_status)
            await db.flush()

    def task(**kw):
        base = dict(tenant_id=tenant.id, employee_id=emp.id, task_type="MEDICAL_EXAM", status="DUE")
        base.update(kw)
        return HrEmployeeOnboardingTask(**base)

    db.add(task())
    await db.flush()
    cases = [
        task(),  # duplicate employee + task type
        task(task_type="OTHER"),
        task(task_type="CV_CONSENT", status="COMPLETED"),  # no evidence
        task(task_type="CV_CONSENT", status="COMPLETED", completed_at=datetime.utcnow(), source_table="x"),
        task(task_type="CV_CONSENT", status="WAIVED", waived_at=datetime.utcnow(), waive_reason="  "),
        task(task_type="CV_CONSENT", status="WAIVED", waived_at=datetime.utcnow()),
        task(task_type="CV_CONSENT", status="PENDING"),
    ]
    for bad in cases:
        with pytest.raises(IntegrityError):
            async with db.begin_nested():
                db.add(bad)
                await db.flush()

    db.add(
        task(
            task_type="CV_CONSENT",
            status="COMPLETED",
            completed_at=datetime.utcnow(),
            source_table="hr_employee_privacy_consents",
            source_id=1,
        )
    )
    db.add(task(task_type="FACE_CONSENT", status="WAIVED", waived_at=datetime.utcnow(), waive_reason="Not captured"))
    await db.flush()
