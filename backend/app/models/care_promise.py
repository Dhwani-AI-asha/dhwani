"""
SQLAlchemy CarePromise model for tracking ASHA worker follow-up tasks and commitments.
"""

from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship, backref

from app.database import Base


def utc_now():
    """Return current UTC timestamp without timezone offset for clean SQLite storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PromiseStatus(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"


class CarePromise(Base):
    """
    Care Promise Tracker database entity.
    Stores commitments made to patients by ASHA workers with target due dates and completion tracking.
    """
    __tablename__ = "care_promises"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Unique public human-readable promise ID (e.g. CP-2026-0001)
    promise_id = Column(String(32), unique=True, index=True, nullable=False)
    # Foreign key referencing Patient.patient_id
    patient_id = Column(String(32), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    # Optional foreign key referencing Visit.visit_id
    visit_id = Column(String(32), ForeignKey("visits.visit_id", ondelete="SET NULL"), index=True, nullable=True)
    description = Column(Text, nullable=False)
    due_date = Column(Date, index=True, nullable=False)
    status = Column(String(20), default=PromiseStatus.PENDING.value, index=True, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    patient = relationship(
        "Patient",
        backref=backref("care_promises", cascade="all, delete-orphan", passive_deletes=True),
        passive_deletes=True
    )
    visit = relationship(
        "Visit",
        backref=backref("care_promises", passive_deletes=True)
    )

    __table_args__ = (
        Index("ix_care_promises_patient_status", "patient_id", "status"),
        Index("ix_care_promises_status_due_date", "status", "due_date"),
    )

    def __repr__(self) -> str:
        return f"<CarePromise(promise_id='{self.promise_id}', patient_id='{self.patient_id}', status='{self.status}', due_date={self.due_date})>"
