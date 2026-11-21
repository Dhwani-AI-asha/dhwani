"""
Idempotent seeder for Dhwani's 5 synthetic Ward 4 Rampur beneficiaries.

Ensures the synthetic beneficiaries displayed in the frontend exist in the
backend patients table under stable, canonical PAT-2026-XXXX identifiers
without creating duplicates or altering existing records (such as PAT-2026-0001).
"""

from datetime import date
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.models.patient import Patient


SYNTHETIC_BENEFICIARIES: List[Dict[str, Any]] = [
    {
        "patient_id": "PAT-2026-0002",
        "name": "Pooja Devi",
        "age": 24,
        "gender": "Female",
        "contact_number": "+91 98721 44510",
        "address": "Village Rampur, Gali 2, Ward 4 (RCH #9842-8819)",
        "rch_id": "#9842-8819",
    },
    {
        "patient_id": "PAT-2026-0003",
        "name": "Meena Kumari",
        "age": 28,
        "gender": "Female",
        "contact_number": "+91 98112 33441",
        "address": "Village Rampur, Gali 1, Ward 4 (RCH #7712-4011)",
        "rch_id": "#7712-4011",
    },
    {
        "patient_id": "PAT-2026-0004",
        "name": "Aarav Sharma",
        "age": 2,
        "gender": "Male",
        "contact_number": None,
        "address": "East Basti, Rampur, House #08, Ward 4 (RCH #5521-9032)",
        "rch_id": "#5521-9032",
    },
    {
        "patient_id": "PAT-2026-0005",
        "name": "Savitri Devi",
        "age": 58,
        "gender": "Female",
        "contact_number": None,
        "address": "Main Road, Rampur, House #19, Ward 4 (RCH #3319-1102)",
        "rch_id": "#3319-1102",
    },
    {
        "patient_id": "PAT-2026-0006",
        "name": "Geeta Patel",
        "age": 21,
        "gender": "Female",
        "contact_number": None,
        "address": "Rampur South, Ward 4 (RCH #8801-6543)",
        "rch_id": "#8801-6543",
    },
]


def seed_synthetic_beneficiaries(db: Session) -> int:
    """
    Insert any missing synthetic beneficiaries into the patients table.
    Idempotent: existing patient IDs are never duplicated, overwritten, or deleted.

    Returns the number of newly inserted patient records.
    """
    inserted = 0
    for item in SYNTHETIC_BENEFICIARIES:
        existing = (
            db.query(Patient)
            .filter(Patient.patient_id == item["patient_id"])
            .first()
        )
        if existing is not None:
            continue

        patient = Patient(
            patient_id=item["patient_id"],
            name=item["name"],
            age=item["age"],
            gender=item["gender"],
            contact_number=item["contact_number"],
            address=item["address"],
            registration_date=date.today(),
        )
        db.add(patient)
        inserted += 1

    if inserted > 0:
        db.commit()
    return inserted
