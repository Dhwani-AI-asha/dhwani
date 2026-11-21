"""
SQLAlchemy Referral model for tracking patient clinical referrals to healthcare facilities.
"""

from datetime import datetime, timezone, date
from enum import Enum
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship, backref

from app.database import Base


def utc_now():
    """Return current UTC timestamp without timezone offset for clean SQLite storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ReferralStatus(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class Referral(Base):
    """
    Referral Tracking database entity.
    Records formal clinical referrals made by ASHA workers to secondary/tertiary facilities.
    """
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Unique public human-readable referral ID (e.g. REF-2026-0001)
    referral_id = Column(String(32), unique=True, index=True, nullable=False)
    # Foreign key referencing Patient.patient_id
    patient_id = Column(String(32), ForeignKey("patients.patient_id", ondelete="CASCADE"), index=True, nullable=False)
    # Optional foreign key referencing Visit.visit_id
    visit_id = Column(String(32), ForeignKey("visits.visit_id", ondelete="SET NULL"), index=True, nullable=True)
    reason = Column(Text, nullable=False)
    facility_name = Column(String(150), nullable=False)
    referred_by = Column(String(100), nullable=True)
    referral_date = Column(Date, default=date.today, nullable=False, index=True)
    status = Column(String(20), default=ReferralStatus.PENDING.value, index=True, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    patient = relationship(
        "Patient",
        backref=backref("referrals", cascade="all, delete-orphan", passive_deletes=True),
        passive_deletes=True
    )
    visit = relationship(
        "Visit",
        backref=backref("referrals", passive_deletes=True)
    )

    __table_args__ = (
        Index("ix_referrals_patient_status", "patient_id", "status"),
        Index("ix_referrals_patient_date", "patient_id", "referral_date"),
    )

    def __repr__(self) -> str:
        return f"<Referral(referral_id='{self.referral_id}', patient_id='{self.patient_id}', facility='{self.facility_name}', status='{self.status}')>"
