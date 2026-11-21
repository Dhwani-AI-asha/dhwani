"""
Service exports for Dhwani backend.
"""

from app.services.patient_service import (
    generate_unique_patient_id,
    create_patient,
    get_patient_by_id,
    get_patients,
    update_patient
)
from app.services.visit_service import (
    generate_unique_visit_id,
    create_visit,
    get_visits_by_patient_id,
    get_visit_by_id
)

from app.services.care_promise_service import (
    generate_unique_promise_id,
    create_care_promise,
    get_care_promise_by_id,
    get_care_promises,
    get_pending_care_promises,
    get_overdue_care_promises,
    update_care_promise,
    complete_care_promise
)
from app.services.next_visit_service import generate_next_visit_summary
from app.services.referral_service import (
    generate_unique_referral_id,
    create_referral,
    get_referral_by_id,
    get_referrals,
    update_referral,
    get_patient_referrals
)
from app.services.medication_reminder_service import (
    generate_unique_reminder_id,
    create_medication_reminder,
    get_medication_reminder_by_id,
    get_medication_reminders,
    update_medication_reminder,
    deactivate_medication_reminder,
    get_patient_medication_reminders
)

__all__ = [
    "generate_unique_patient_id",
    "create_patient",
    "get_patient_by_id",
    "get_patients",
    "update_patient",
    "generate_unique_visit_id",
    "create_visit",
    "get_visits_by_patient_id",
    "get_visit_by_id",
    "generate_unique_promise_id",
    "create_care_promise",
    "get_care_promise_by_id",
    "get_care_promises",
    "get_pending_care_promises",
    "get_overdue_care_promises",
    "update_care_promise",
    "complete_care_promise",
    "generate_next_visit_summary",
    "generate_unique_referral_id",
    "create_referral",
    "get_referral_by_id",
    "get_referrals",
    "update_referral",
    "get_patient_referrals",
    "generate_unique_reminder_id",
    "create_medication_reminder",
    "get_medication_reminder_by_id",
    "get_medication_reminders",
    "update_medication_reminder",
    "deactivate_medication_reminder",
    "get_patient_medication_reminders"
]
