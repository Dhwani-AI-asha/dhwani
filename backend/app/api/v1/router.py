"""
Aggregated API v1 router.
"""

from fastapi import APIRouter
from app.api.v1.patients import router as patients_router
from app.api.v1.visits import router as visits_router
from app.api.v1.care_promises import router as care_promises_router
from app.api.v1.referrals import router as referrals_router
from app.api.v1.medication_reminders import router as medication_reminders_router

api_router = APIRouter()
api_router.include_router(patients_router)
api_router.include_router(visits_router)
api_router.include_router(care_promises_router)
api_router.include_router(referrals_router)
api_router.include_router(medication_reminders_router)
