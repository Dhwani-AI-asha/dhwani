"""
SQLAlchemy MedicationReminder model for storing authorized prescription medication records.
Record-keeping only: NEVER generates, recommends, or modifies prescriptions.
"""

from datetime import datetime, timezone, date
from enum import Enum
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship, backref

from app.database import Base


def utc_now():
    """Return current UTC timestamp without timezone offset for clean SQLite storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MedicationReminderStatus(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"


class MedicationReminder(Base):
    """
    Medication Reminder database entity.
    Stores medication instructions copied faithfully from an authorized prescription.
    Never infers, recommends, or creates prescriptions independently.
    """
    __tablename__ = "medication_reminders"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Unique public human-readable reminder ID (e.g. MED-2026-0001)
    reminder_id = Column(String(32), unique=True, index=True, nullable=False)
    # Foreign key referencing Patient.patient_id
    patient_id = Column(String(32), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    # Optional foreign key referencing Visit.visit_id
    visit_id = Column(String(32), ForeignKey("visits.visit_id", ondelete="SET NULL"), index=True, nullable=True)

    # Medication details copied strictly from authorized prescription
    medication_name = Column(String(150), nullable=False, index=True)
    dosage_instructions = Column(Text, nullable=False)
    frequency = Column(String(100), nullable=True)
    start_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True)

    # Authorized prescribing professional and prescription provenance
    prescribed_by = Column(String(150), nullable=False)
    prescription_reference = Column(String(150), nullable=False)

    status = Column(String(20), default=MedicationReminderStatus.ACTIVE.value, index=True, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    patient = relationship(
        "Patient",
        backref=backref("medication_reminders", cascade="all, delete-orphan", passive_deletes=True),
        passive_deletes=True
    )
    visit = relationship(
        "Visit",
        backref=backref("medication_reminders", passive_deletes=True)
    )

    __table_args__ = (
        Index("ix_med_reminders_patient_status", "patient_id", "status"),
        Index("ix_med_reminders_patient_created", "patient_id", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<MedicationReminder(reminder_id='{self.reminder_id}', "
            f"patient_id='{self.patient_id}', medication='{self.medication_name}', status='{self.status}')>"
        )
