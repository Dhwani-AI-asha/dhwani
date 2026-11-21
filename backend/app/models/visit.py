"""
SQLAlchemy Visit model for storing longitudinal visit records and Member 2 structured medical reports.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Date, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


def utc_now():
    """Return current UTC timestamp without timezone offset for clean SQLite storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Visit(Base):
    """
    Longitudinal visit record table.
    Links structured medical reports extracted by Member 2 to an existing registered patient.
    """
    __tablename__ = "visits"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Unique human-readable visit identifier (e.g. VIS-2026-0001)
    visit_id = Column(String(32), unique=True, index=True, nullable=False)
    # Foreign key referencing Patient.patient_id
    patient_id = Column(String(32), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    visit_date = Column(Date, nullable=False, index=True)

    # Full structured medical report JSON from Member 2
    report = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationship to Patient
    patient = relationship("Patient", backref="visits")

    def __repr__(self) -> str:
        return f"<Visit(visit_id='{self.visit_id}', patient_id='{self.patient_id}', visit_date={self.visit_date})>"
