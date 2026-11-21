"""
Service layer for Next-Visit Summary generation.
Combines patient profile, latest visit, previous visits, attention items, and care promises
into a factual, non-hallucinated pre-visit briefing for ASHA workers.
"""

from datetime import date
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.patient import Patient
from app.models.care_promise import PromiseStatus
from app.schemas.visit import Symptom, MissingInformation
from app.schemas.next_visit import (
    PatientBrief,
    LatestVisitBrief,
    PreviousVisitBrief,
    CarePromiseBrief,
    AttentionItems,
    NextVisitSummaryResponse
)
from app.services.patient_service import get_patient_by_id
from app.services.visit_service import get_visits_by_patient_id
from app.services.care_promise_service import get_care_promises


def generate_next_visit_summary(
    db: Session,
    patient_id: str,
    as_of_date: Optional[date] = None
) -> Optional[NextVisitSummaryResponse]:
    """
    Generates a concise, factually grounded pre-visit briefing for an ASHA worker.
    Returns None if the patient does not exist.
    """
    patient = get_patient_by_id(db=db, patient_id=patient_id)
    if not patient:
        return None

    ref_date = as_of_date or date.today()

    # 1. Patient information
    patient_brief = PatientBrief(
        patient_id=patient.patient_id,
        name=patient.name,
        age=patient.age,
        gender=patient.gender,
        contact_number=patient.contact_number
    )

    # 2. Visit history (already sorted newest first)
    all_visits = get_visits_by_patient_id(db=db, patient_id=patient_id)

    latest_visit_brief: Optional[LatestVisitBrief] = None
    previous_visits_briefs: List[PreviousVisitBrief] = []

    if all_visits:
        # Latest visit is the first item
        latest_raw = all_visits[0]
        rep = latest_raw.report or {}

        symptoms_list = [Symptom(**s) for s in rep.get("symptoms", [])]
        missing_info_list = [MissingInformation(**m) for m in rep.get("missing_information", [])]

        latest_visit_brief = LatestVisitBrief(
            visit_id=latest_raw.visit_id,
            visit_date=latest_raw.visit_date,
            chief_complaint=rep.get("chief_complaint"),
            summary=rep.get("summary"),
            symptoms=symptoms_list,
            danger_signs=rep.get("danger_signs", []),
            vital_signs_mentioned=rep.get("vital_signs_mentioned"),
            professional_review_required=rep.get("professional_review_required", False),
            missing_information=missing_info_list,
            notes=rep.get("notes")
        )

        # Previous visits (excluding the latest visit to avoid duplication)
        for prev in all_visits[1:]:
            prev_rep = prev.report or {}
            previous_visits_briefs.append(
                PreviousVisitBrief(
                    visit_id=prev.visit_id,
                    visit_date=prev.visit_date,
                    chief_complaint=prev_rep.get("chief_complaint"),
                    summary=prev_rep.get("summary"),
                    danger_signs=prev_rep.get("danger_signs", []),
                    professional_review_required=prev_rep.get("professional_review_required", False)
                )
            )

    # 3. Care Continuity (Pending & Overdue Promises)
    all_promises, _ = get_care_promises(db=db, patient_id=patient_id)

    pending_promises: List[CarePromiseBrief] = []
    overdue_promises: List[CarePromiseBrief] = []

    for p in all_promises:
        if p.status == PromiseStatus.PENDING.value:
            if p.due_date < ref_date:
                overdue_promises.append(
                    CarePromiseBrief(
                        promise_id=p.promise_id,
                        description=p.description,
                        due_date=p.due_date,
                        status=p.status,
                        is_overdue=True
                    )
                )
            else:
                pending_promises.append(
                    CarePromiseBrief(
                        promise_id=p.promise_id,
                        description=p.description,
                        due_date=p.due_date,
                        status=p.status,
                        is_overdue=False
                    )
                )

    # 4. Attention Items (aggregate danger signs and review requirements across visits)
    seen_danger = set()
    attention_danger_signs: List[str] = []
    if latest_visit_brief:
        for ds in latest_visit_brief.danger_signs:
            if ds not in seen_danger:
                seen_danger.add(ds)
                attention_danger_signs.append(ds)
    for pv in previous_visits_briefs:
        for ds in pv.danger_signs:
            if ds not in seen_danger:
                seen_danger.add(ds)
                attention_danger_signs.append(ds)

    attention_review_required = (
        (latest_visit_brief.professional_review_required if latest_visit_brief else False)
        or any(pv.professional_review_required for pv in previous_visits_briefs)
    )
    attention_missing_info = latest_visit_brief.missing_information if latest_visit_brief else []

    attention_items = AttentionItems(
        danger_signs=attention_danger_signs,
        professional_review_required=attention_review_required,
        missing_information=attention_missing_info
    )

    # 5. Build strictly grounded briefing text (no diagnosis, no hallucination)
    gender_str = patient.gender or "Gender not recorded"
    lines = [
        f"Next-Visit Briefing for {patient.name} (Age {patient.age}, {gender_str}), ID: {patient.patient_id}."
    ]

    if patient.contact_number:
        lines.append(f"Contact: {patient.contact_number}")
    if patient.address:
        lines.append(f"Address: {patient.address}")

    if latest_visit_brief:
        lines.append(f"Latest Visit: {latest_visit_brief.visit_date} (Visit ID: {latest_visit_brief.visit_id})")
        if latest_visit_brief.chief_complaint:
            lines.append(f"Chief Complaint: {latest_visit_brief.chief_complaint}")

        if latest_visit_brief.symptoms:
            sym_items = []
            for s in latest_visit_brief.symptoms:
                parts = [s.name]
                if s.duration:
                    parts.append(f"duration: {s.duration}")
                if s.severity:
                    parts.append(f"severity: {s.severity}")
                if s.body_site:
                    parts.append(f"site: {s.body_site}")
                sym_items.append(" - " + ", ".join(parts))
            lines.append("Reported Symptoms:\n" + "\n".join(sym_items))

        if latest_visit_brief.danger_signs:
            lines.append(f"ATTENTION - Danger Signs Recorded: {', '.join(latest_visit_brief.danger_signs)}")

        if latest_visit_brief.professional_review_required:
            lines.append("ATTENTION - Professional doctor review is flagged as required.")

        if latest_visit_brief.missing_information:
            prompts = [
                f" - {m.field_name}: {m.prompt_question or m.reason}"
                for m in latest_visit_brief.missing_information
            ]
            lines.append("Information to clarify:\n" + "\n".join(prompts))

        if latest_visit_brief.summary:
            lines.append(f"Latest Summary: {latest_visit_brief.summary}")
    else:
        lines.append("No previous visits recorded on file.")

    if overdue_promises:
        lines.append(f"Overdue Follow-Up Tasks ({len(overdue_promises)}):")
        for op in overdue_promises:
            lines.append(f" - [OVERDUE] {op.description} (Due: {op.due_date})")

    if pending_promises:
        lines.append(f"Upcoming Care Promises ({len(pending_promises)}):")
        for pp in pending_promises:
            lines.append(f" - [PENDING] {pp.description} (Due: {pp.due_date})")

    if previous_visits_briefs:
        lines.append(f"Prior Visit History: {len(previous_visits_briefs)} earlier visit(s) recorded.")

    briefing_text = "\n".join(lines)

    return NextVisitSummaryResponse(
        patient=patient_brief,
        latest_visit=latest_visit_brief,
        previous_visits=previous_visits_briefs,
        pending_promises=pending_promises,
        overdue_promises=overdue_promises,
        attention_items=attention_items,
        briefing_text=briefing_text
    )
