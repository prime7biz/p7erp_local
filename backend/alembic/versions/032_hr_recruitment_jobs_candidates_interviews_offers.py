"""Add HR recruitment requisition, candidate, interview, offer tables

Revision ID: 032
Revises: 031
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "032"
down_revision: Union[str, None] = "031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_recruitment_requisitions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("requested_by_employee_id", sa.Integer(), nullable=True),
        sa.Column("hiring_manager_employee_id", sa.Integer(), nullable=True),
        sa.Column("vacancy_count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("employment_type", sa.String(length=32), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("budget_min", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("budget_max", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("opened_at", sa.Date(), nullable=True),
        sa.Column("closed_at", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["hr_departments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by_employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["hiring_manager_employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_req_tenant_id", "hr_recruitment_requisitions", ["tenant_id"])
    op.create_index("ix_hr_req_title", "hr_recruitment_requisitions", ["title"])
    op.create_index("ix_hr_req_department_id", "hr_recruitment_requisitions", ["department_id"])
    op.create_index("ix_hr_req_requested_by", "hr_recruitment_requisitions", ["requested_by_employee_id"])
    op.create_index("ix_hr_req_hiring_manager", "hr_recruitment_requisitions", ["hiring_manager_employee_id"])
    op.create_index("ix_hr_req_status", "hr_recruitment_requisitions", ["status"])

    op.create_table(
        "hr_recruitment_candidates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("requisition_id", sa.Integer(), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("current_company", sa.String(length=255), nullable=True),
        sa.Column("current_designation", sa.String(length=255), nullable=True),
        sa.Column("expected_salary", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("resume_url", sa.String(length=512), nullable=True),
        sa.Column("stage", sa.String(length=32), nullable=False, server_default=sa.text("'applied'")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'active'")),
        sa.Column("assigned_recruiter_user_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requisition_id"], ["hr_recruitment_requisitions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_recruiter_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_candidate_tenant_id", "hr_recruitment_candidates", ["tenant_id"])
    op.create_index("ix_hr_candidate_requisition_id", "hr_recruitment_candidates", ["requisition_id"])
    op.create_index("ix_hr_candidate_full_name", "hr_recruitment_candidates", ["full_name"])
    op.create_index("ix_hr_candidate_email", "hr_recruitment_candidates", ["email"])
    op.create_index("ix_hr_candidate_stage", "hr_recruitment_candidates", ["stage"])
    op.create_index("ix_hr_candidate_status", "hr_recruitment_candidates", ["status"])
    op.create_index(
        "ix_hr_candidate_assigned_recruiter_user_id",
        "hr_recruitment_candidates",
        ["assigned_recruiter_user_id"],
    )

    op.create_table(
        "hr_recruitment_interviews",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("requisition_id", sa.Integer(), nullable=True),
        sa.Column("interviewer_employee_id", sa.Integer(), nullable=True),
        sa.Column("interviewer_user_id", sa.Integer(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("rating", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'scheduled'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["candidate_id"], ["hr_recruitment_candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requisition_id"], ["hr_recruitment_requisitions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["interviewer_employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["interviewer_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_interview_tenant_id", "hr_recruitment_interviews", ["tenant_id"])
    op.create_index("ix_hr_interview_candidate_id", "hr_recruitment_interviews", ["candidate_id"])
    op.create_index("ix_hr_interview_requisition_id", "hr_recruitment_interviews", ["requisition_id"])
    op.create_index("ix_hr_interview_interviewer_employee_id", "hr_recruitment_interviews", ["interviewer_employee_id"])
    op.create_index("ix_hr_interview_interviewer_user_id", "hr_recruitment_interviews", ["interviewer_user_id"])
    op.create_index("ix_hr_interview_scheduled_at", "hr_recruitment_interviews", ["scheduled_at"])
    op.create_index("ix_hr_interview_status", "hr_recruitment_interviews", ["status"])

    op.create_table(
        "hr_recruitment_offers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("requisition_id", sa.Integer(), nullable=True),
        sa.Column("offered_role", sa.String(length=255), nullable=False),
        sa.Column("proposed_salary", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default=sa.text("'BDT'")),
        sa.Column("joining_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["candidate_id"], ["hr_recruitment_candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requisition_id"], ["hr_recruitment_requisitions.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_offer_tenant_id", "hr_recruitment_offers", ["tenant_id"])
    op.create_index("ix_hr_offer_candidate_id", "hr_recruitment_offers", ["candidate_id"])
    op.create_index("ix_hr_offer_requisition_id", "hr_recruitment_offers", ["requisition_id"])
    op.create_index("ix_hr_offer_status", "hr_recruitment_offers", ["status"])


def downgrade() -> None:
    op.drop_index("ix_hr_offer_status", table_name="hr_recruitment_offers")
    op.drop_index("ix_hr_offer_requisition_id", table_name="hr_recruitment_offers")
    op.drop_index("ix_hr_offer_candidate_id", table_name="hr_recruitment_offers")
    op.drop_index("ix_hr_offer_tenant_id", table_name="hr_recruitment_offers")
    op.drop_table("hr_recruitment_offers")

    op.drop_index("ix_hr_interview_status", table_name="hr_recruitment_interviews")
    op.drop_index("ix_hr_interview_scheduled_at", table_name="hr_recruitment_interviews")
    op.drop_index("ix_hr_interview_interviewer_user_id", table_name="hr_recruitment_interviews")
    op.drop_index("ix_hr_interview_interviewer_employee_id", table_name="hr_recruitment_interviews")
    op.drop_index("ix_hr_interview_requisition_id", table_name="hr_recruitment_interviews")
    op.drop_index("ix_hr_interview_candidate_id", table_name="hr_recruitment_interviews")
    op.drop_index("ix_hr_interview_tenant_id", table_name="hr_recruitment_interviews")
    op.drop_table("hr_recruitment_interviews")

    op.drop_index("ix_hr_candidate_assigned_recruiter_user_id", table_name="hr_recruitment_candidates")
    op.drop_index("ix_hr_candidate_status", table_name="hr_recruitment_candidates")
    op.drop_index("ix_hr_candidate_stage", table_name="hr_recruitment_candidates")
    op.drop_index("ix_hr_candidate_email", table_name="hr_recruitment_candidates")
    op.drop_index("ix_hr_candidate_full_name", table_name="hr_recruitment_candidates")
    op.drop_index("ix_hr_candidate_requisition_id", table_name="hr_recruitment_candidates")
    op.drop_index("ix_hr_candidate_tenant_id", table_name="hr_recruitment_candidates")
    op.drop_table("hr_recruitment_candidates")

    op.drop_index("ix_hr_req_status", table_name="hr_recruitment_requisitions")
    op.drop_index("ix_hr_req_hiring_manager", table_name="hr_recruitment_requisitions")
    op.drop_index("ix_hr_req_requested_by", table_name="hr_recruitment_requisitions")
    op.drop_index("ix_hr_req_department_id", table_name="hr_recruitment_requisitions")
    op.drop_index("ix_hr_req_title", table_name="hr_recruitment_requisitions")
    op.drop_index("ix_hr_req_tenant_id", table_name="hr_recruitment_requisitions")
    op.drop_table("hr_recruitment_requisitions")
