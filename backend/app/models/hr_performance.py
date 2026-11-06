from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PerformanceCycle(Base):
    __tablename__ = "hr_performance_cycles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "start_date", name="uq_hr_perf_cycles_tenant_name_start"),
        Index("ix_hr_perf_cycles_created_by_user_id", "created_by_user_id"),
        Index("ix_hr_perf_cycles_name", "name"),
        Index("ix_hr_perf_cycles_status", "status"),
        Index("ix_hr_perf_cycles_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    goals: Mapped[list["PerformanceGoal"]] = relationship("PerformanceGoal", back_populates="cycle")
    reviews: Mapped[list["PerformanceReview"]] = relationship("PerformanceReview", back_populates="cycle")


class PerformanceGoal(Base):
    __tablename__ = "hr_performance_goals"
    __table_args__ = (
        Index("ix_hr_perf_goals_created_by_user_id", "created_by_user_id"),
        Index("ix_hr_perf_goals_cycle_id", "cycle_id"),
        Index("ix_hr_perf_goals_employee_id", "employee_id"),
        Index("ix_hr_perf_goals_status", "status"),
        Index("ix_hr_perf_goals_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("hr_performance_cycles.id", ondelete="CASCADE"), nullable=False)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    weight: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    target_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    manager_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    cycle: Mapped["PerformanceCycle"] = relationship("PerformanceCycle", back_populates="goals")


class PerformanceReview(Base):
    __tablename__ = "hr_performance_reviews"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "cycle_id",
            "employee_id",
            "review_type",
            name="uq_hr_perf_reviews_cycle_employee_type",
        ),
        Index("ix_hr_perf_reviews_cycle_id", "cycle_id"),
        Index("ix_hr_perf_reviews_employee_id", "employee_id"),
        Index("ix_hr_perf_reviews_reviewer_employee_id", "reviewer_employee_id"),
        Index("ix_hr_perf_reviews_reviewer_user_id", "reviewer_user_id"),
        Index("ix_hr_perf_reviews_status", "status"),
        Index("ix_hr_perf_reviews_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("hr_performance_cycles.id", ondelete="CASCADE"), nullable=False)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    reviewer_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    reviewer_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    review_type: Mapped[str] = mapped_column(String(32), nullable=False, default="manager")
    self_rating: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    manager_rating: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    final_rating: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    employee_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    cycle: Mapped["PerformanceCycle"] = relationship("PerformanceCycle", back_populates="reviews")
