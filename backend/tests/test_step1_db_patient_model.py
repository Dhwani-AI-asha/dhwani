"""
Unit tests for Step 1: Database configuration, SQLAlchemy setup, and Patient model.
Uses an isolated in-memory SQLite database and fictional test data.
"""

import pytest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError

from app.database import Base
from app.models.patient import Patient


@pytest.fixture
def db_session():
    """Provides a fresh isolated in-memory SQLite database session for each test."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    # Create all tables in memory
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


def test_create_and_retrieve_patient(db_session):
    """Verify that a patient can be created and retrieved with all fields."""
    fictional_patient = Patient(
        patient_id="PAT-2026-0001",
        name="Sunita Devi",
        age=28,
        gender="Female",
        contact_number="9876543210",
        address="Ward 3, Rampur Village",
        registration_date=date(2026, 11, 21)
    )
    db_session.add(fictional_patient)
    db_session.commit()

    retrieved = db_session.query(Patient).filter(Patient.patient_id == "PAT-2026-0001").first()
    assert retrieved is not None
    assert retrieved.name == "Sunita Devi"
    assert retrieved.age == 28
    assert retrieved.gender == "Female"
    assert retrieved.contact_number == "9876543210"
    assert retrieved.address == "Ward 3, Rampur Village"
    assert retrieved.registration_date == date(2026, 11, 21)
    assert retrieved.created_at is not None
    assert retrieved.updated_at is not None


def test_optional_fields_allow_none(db_session):
    """Verify that optional fields (gender, contact_number, address) can be None."""
    minimal_patient = Patient(
        patient_id="PAT-2026-0002",
        name="Meena Kumari",
        age=34,
        gender=None,
        contact_number=None,
        address=None
    )
    db_session.add(minimal_patient)
    db_session.commit()

    retrieved = db_session.query(Patient).filter(Patient.patient_id == "PAT-2026-0002").first()
    assert retrieved is not None
    assert retrieved.name == "Meena Kumari"
    assert retrieved.gender is None
    assert retrieved.contact_number is None
    assert retrieved.address is None
    assert retrieved.registration_date == date.today()


def test_patient_id_uniqueness_enforced(db_session):
    """Verify that duplicate patient_id violates unique constraint."""
    patient1 = Patient(
        patient_id="PAT-2026-DUPLICATE",
        name="Patient One",
        age=25
    )
    patient2 = Patient(
        patient_id="PAT-2026-DUPLICATE",
        name="Patient Two",
        age=30
    )
    db_session.add(patient1)
    db_session.commit()

    db_session.add(patient2)
    with pytest.raises(IntegrityError):
        db_session.commit()
