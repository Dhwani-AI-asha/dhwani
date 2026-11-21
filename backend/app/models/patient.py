"""
SQLAlchemy Patient model for patient demographic and registration records.
"""

from datetime import date, datetime, timezone
from sqlalchemy import Column, Integer, String, Date, DateTime
from app.database import Base


def utc_now():
    """Return current UTC timestamp without timezone offset for clean SQLite storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Patient(Base):
    """
    Patient demographic record table.
    Stores minimal essential details needed by ASHA workers for identification and care continuity.
    """
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Unique human-readable patient identifier (e.g., PAT-2026-0001)
    patient_id = Column(String(32), unique=True, index=True, nullable=False)
    name = Column(String(120), nullable=False, index=True)
    age = Column(Integer, nullable=False)
    gender = Column(String(20), nullable=True)
    contact_number = Column(String(20), nullable=True, index=True)
    address = Column(String(255), nullable=True)
    registration_date = Column(Date, default=date.today, nullable=False)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    def __repr__(self) -> str:
        return f"<Patient(patient_id='{self.patient_id}', name='{self.name}', age={self.age})>"
