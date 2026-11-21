# Dhwani Backend — Member 3: Patient Management & Care Continuity API

> **Project**: Dhwani — Voice-first visit record assistant for ASHA community health workers.
> **Role**: Member 3 — Patient registration, visit ingestion, care continuity tracking, and next-visit briefing.
> **Branch**: `Moulya` · **Stack**: Python 3.14 · FastAPI · SQLAlchemy 2.0 · Pydantic v2 · SQLite · Pytest 9.2

---

## ⚠️ Safety Rules — What This Backend Never Does

This backend is a **record-keeping and information-retrieval system only**. It must **never**:

- Diagnose a patient or suggest a diagnosis.
- Recommend, generate, or modify medication names, dosages, or treatment durations.
- Auto-complete clinical records with AI-generated content.
- Infer that a symptom has been resolved.
- Invent information not supplied by an authorised person.
- Treat AI-generated medication suggestions as an authorised prescription.

Only information explicitly supplied by an authorised healthcare professional may be stored.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Setup & Running](#2-setup--running)
3. [API Reference](#3-api-reference)
   - [Patients](#31-patients-apiv1patients)
   - [Visits](#32-visits-apiv1visits)
   - [Care Promises](#33-care-promises-apiv1care-promises)
   - [Next-Visit Summary](#34-next-visit-summary-apiv1patientsidinext-visit-summary)
   - [Referrals](#35-referrals-apiv1referrals)
   - [Medication Reminders](#36-medication-reminders-apiv1medication-reminders)
4. [Member 2 Integration Contract](#4-member-2-integration-contract)
5. [Member 4 Integration Contract](#5-member-4-integration-contract)
6. [Error Codes Reference](#6-error-codes-reference)
7. [Design Constraints & Notes](#7-design-constraints--notes)

---

## 1. Project Structure

```
backend/
├── requirements.txt
├── app/
│   ├── config.py                    # Settings (PROJECT_NAME, VERSION, DATABASE_URL, CORS_ORIGINS)
│   ├── database.py                  # SQLAlchemy engine, session factory, init_db
│   ├── main.py                      # FastAPI app entry point, CORS, lifespan, router mount
│   ├── api/
│   │   ├── deps.py                  # get_db dependency injection
│   │   └── v1/
│   │       ├── router.py            # Mounts all sub-routers under /api/v1/
│   │       ├── patients.py          # Patient CRUD + nested sub-resources
│   │       ├── visits.py            # Visit ingestion and retrieval
│   │       ├── care_promises.py     # Care promise tracker
│   │       ├── referrals.py         # Referral tracking
│   │       └── medication_reminders.py  # Medication reminder records
│   ├── models/
│   │   ├── patient.py               # Patient ORM model
│   │   ├── visit.py                 # Visit ORM model (stores report as JSON)
│   │   ├── care_promise.py          # CarePromise ORM model
│   │   ├── referral.py              # Referral ORM model
│   │   └── medication_reminder.py   # MedicationReminder ORM model
│   ├── schemas/
│   │   ├── patient.py               # PatientCreate / PatientUpdate / PatientResponse
│   │   ├── visit.py                 # VisitCreate / VisitResponse / StructuredReport
│   │   ├── care_promise.py          # CarePromiseCreate / CarePromiseUpdate / CarePromiseResponse
│   │   ├── next_visit.py            # NextVisitSummaryResponse and briefing schemas
│   │   ├── referral.py              # ReferralCreate / ReferralUpdate / ReferralResponse
│   │   └── medication_reminder.py   # MedicationReminderCreate / Update / Response
│   └── services/
│       ├── patient_service.py
│       ├── visit_service.py
│       ├── care_promise_service.py
│       ├── next_visit_service.py
│       ├── referral_service.py
│       └── medication_reminder_service.py
└── tests/
    ├── conftest.py
    ├── test_step1_db_patient_model.py        (3 tests)
    ├── test_step2_patients_api.py            (14 tests)
    ├── test_step3_visits_api.py              (15 tests)
    ├── test_step4_care_promises_api.py       (17 tests)
    ├── test_step5_next_visit_summary_api.py  (15 tests)
    ├── test_step6_referrals_api.py           (19 tests)
    ├── test_step7_medication_reminders_api.py (26 tests)
    └── test_step8_integration.py            (6 tests)
```

---

## 2. Setup & Running

### Prerequisites

- Python 3.12+ (project uses 3.14)
- `pip` available on `PATH`

### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Run the Development Server

```bash
cd backend
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

Interactive API docs (Swagger UI): `http://localhost:8000/docs`

ReDoc: `http://localhost:8000/redoc`

### Run Tests

From the repository root:

```bash
python -m pytest backend/tests/ -v
```

Expected output: **115 tests, 115 passed**.

### Database

SQLite database is created automatically at `backend/db.sqlite3` on first startup. All tables are created by `init_db()` during the FastAPI lifespan. Foreign key enforcement (`PRAGMA foreign_keys = ON`) is enabled for every connection.

---

## 3. API Reference

All endpoints are prefixed with `/api/v1/`. Public IDs follow the format `PAT-YYYY-NNNN`, `VIS-YYYY-NNNN`, `CP-YYYY-NNNN`, `REF-YYYY-NNNN`, `MED-YYYY-NNNN`. Internal numeric primary keys are never exposed.

---

### 3.1 Patients `/api/v1/patients`

#### `POST /api/v1/patients/` — Register a patient

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Full name (1–120 chars, whitespace-trimmed) |
| `age` | integer | ✅ | Age in years (0–130) |
| `gender` | string \| null | — | Optional: `Female`, `Male`, `Other` |
| `contact_number` | string \| null | — | Optional phone number (max 20 chars) |
| `address` | string \| null | — | Optional village/ward address (max 255 chars) |
| `registration_date` | date \| null | — | Defaults to today if omitted |

**Response `201`** — `PatientResponse`

```json
{
  "patient_id": "PAT-2026-0001",
  "name": "Priya Sharma",
  "age": 28,
  "gender": "Female",
  "contact_number": "9876543210",
  "address": "Village Rampur, Ward 3",
  "registration_date": "2026-11-21",
  "created_at": "2026-11-21T10:00:00",
  "updated_at": "2026-11-21T10:00:00"
}
```

---

#### `GET /api/v1/patients/` — List / search patients

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `search` | string | Substring match on patient name (case-insensitive) |
| `contact_number` | string | Exact match on contact number |
| `skip` | integer | Pagination offset (default 0) |
| `limit` | integer | Page size (default 20, max 100) |

**Response `200`** — `PatientListResponse`

```json
{ "total": 1, "patients": [ { ... } ] }
```

---

#### `GET /api/v1/patients/{patient_id}` — Get patient

**Response `200`** — `PatientResponse`
**Response `404`** — Patient not found.

---

#### `PATCH /api/v1/patients/{patient_id}` — Update patient

Partial update — omitted fields remain unchanged.

| Field | Null allowed | Notes |
|---|---|---|
| `name` | ❌ | Explicit null or blank string returns 422 |
| `age` | ❌ | Explicit null returns 422 |
| `gender` | ✅ | Explicit null clears the field |
| `contact_number` | ✅ | Explicit null clears the field |
| `address` | ✅ | Explicit null clears the field |

**Response `200`** — Updated `PatientResponse`
**Response `404`** — Patient not found.

---

#### `GET /api/v1/patients/{patient_id}/visits` — Patient's visit history

**Response `200`** — Array of `VisitResponse` objects, ordered newest first.

---

#### `GET /api/v1/patients/{patient_id}/care-promises` — Patient's care promises

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by `Pending` or `Completed` |

**Response `200`** — `CarePromiseListResponse`

---

#### `GET /api/v1/patients/{patient_id}/next-visit-summary` — Next-visit briefing

See [Section 3.4](#34-next-visit-summary-apiv1patientsidinext-visit-summary).

---

#### `GET /api/v1/patients/{patient_id}/referrals` — Patient's referral history

**Response `200`** — `ReferralListResponse`

---

#### `GET /api/v1/patients/{patient_id}/medication-reminders` — Patient's medication reminders

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by `Active` or `Inactive` |

**Response `200`** — `MedicationReminderListResponse`

---

### 3.2 Visits `/api/v1/visits`

Visits are created by **Member 2** (NLP pipeline) after transcribing and structuring a voice note.

#### `POST /api/v1/visits/` — Ingest a structured visit report

See [Section 4 — Member 2 Integration Contract](#4-member-2-integration-contract) for the full request schema and sample.

**Response `201`** — `VisitResponse`
**Response `404`** — Patient not found.
**Response `422`** — Validation error (missing required field, type mismatch).

---

#### `GET /api/v1/visits/` — List visits

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `patient_id` | string | Filter by patient |
| `skip` | integer | Pagination offset |
| `limit` | integer | Page size |

**Response `200`** — Array of `VisitResponse`

---

#### `GET /api/v1/visits/{visit_id}` — Get visit

**Response `200`** — `VisitResponse`
**Response `404`** — Visit not found.

---

### 3.3 Care Promises `/api/v1/care-promises`

Care promises record follow-up commitments made during a visit.

#### `POST /api/v1/care-promises/` — Create a care promise

| Field | Type | Required | Description |
|---|---|---|---|
| `patient_id` | string | ✅ | Registered patient ID |
| `description` | string | ✅ | Actionable commitment (non-blank) |
| `due_date` | date | ✅ | Target completion date |
| `visit_id` | string \| null | — | Optional associated visit |

**Response `201`** — `CarePromiseResponse`

```json
{
  "promise_id": "CP-2026-0001",
  "patient_id": "PAT-2026-0001",
  "visit_id": "VIS-2026-0001",
  "description": "Schedule immunisation for child",
  "due_date": "2026-12-01",
  "status": "Pending",
  "completed_at": null,
  "created_at": "2026-11-21T10:00:00",
  "updated_at": "2026-11-21T10:00:00"
}
```

---

#### `GET /api/v1/care-promises/` — List care promises

**Query parameters**: `patient_id`, `status` (`Pending`/`Completed`), `skip`, `limit`

**Response `200`** — `CarePromiseListResponse`

---

#### `GET /api/v1/care-promises/{promise_id}` — Get care promise

**Response `200`** — `CarePromiseResponse`
**Response `404`** — Promise not found.

---

#### `PATCH /api/v1/care-promises/{promise_id}` — Update care promise

Only `description` and `due_date` may be updated. Unknown or extra fields return 422.

| Field | Null allowed | Notes |
|---|---|---|
| `description` | ❌ | Explicit null or blank returns 422 |
| `due_date` | ❌ | Explicit null returns 422 |
| `status` | — | Not accepted (returns 422 if supplied) |

**Status and `completed_at` are never changed by this endpoint.**

---

#### `PATCH /api/v1/care-promises/{promise_id}/complete` — Complete a promise

Transitions the promise from **Pending → Completed** and records `completed_at`.

- Calling this on an already-completed promise is a no-op (timestamp preserved).
- Only this endpoint may perform the Pending → Completed transition.

**Response `200`** — Updated `CarePromiseResponse`

---

### 3.4 Next-Visit Summary `/api/v1/patients/{patient_id}/next-visit-summary`

#### `GET /api/v1/patients/{patient_id}/next-visit-summary`

Generates a factual, read-only pre-visit briefing for an ASHA worker. **This endpoint never modifies any database record.**

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `as_of_date` | date | Reference date for overdue calculation. Defaults to today. A promise due exactly on `as_of_date` is **not** overdue. |

**Response `200`** — `NextVisitSummaryResponse`

```json
{
  "patient": {
    "patient_id": "PAT-2026-0001",
    "name": "Priya Sharma",
    "age": 28,
    "gender": "Female",
    "contact_number": "9876543210"
  },
  "latest_visit": {
    "visit_id": "VIS-2026-0002",
    "visit_date": "2026-11-15",
    "chief_complaint": "Fever and headache",
    "summary": "Patient presented with fever lasting 3 days.",
    "symptoms": [
      { "name": "Fever", "duration": "3 days", "severity": "Moderate", "body_site": null, "notes": null }
    ],
    "danger_signs": ["High fever > 103 F"],
    "vital_signs_mentioned": { "temperature": "103.5 F" },
    "professional_review_required": true,
    "missing_information": [
      {
        "field_name": "vaccine_status",
        "prompt_question": "Is the patient vaccinated?",
        "reason": null,
        "importance": null
      }
    ],
    "notes": null
  },
  "previous_visits": [
    {
      "visit_id": "VIS-2026-0001",
      "visit_date": "2026-10-20",
      "chief_complaint": "Cough",
      "summary": "Mild cough, no danger signs.",
      "danger_signs": [],
      "professional_review_required": false
    }
  ],
  "pending_promises": [
    {
      "promise_id": "CP-2026-0002",
      "description": "Schedule immunisation",
      "due_date": "2026-12-01",
      "status": "Pending",
      "is_overdue": false
    }
  ],
  "overdue_promises": [
    {
      "promise_id": "CP-2026-0001",
      "description": "Follow up on blood test",
      "due_date": "2026-11-10",
      "status": "Pending",
      "is_overdue": true
    }
  ],
  "attention_items": {
    "danger_signs": ["High fever > 103 F"],
    "professional_review_required": true,
    "missing_information": [
      {
        "field_name": "vaccine_status",
        "prompt_question": "Is the patient vaccinated?",
        "reason": null,
        "importance": null
      }
    ]
  },
  "briefing_text": "Patient Priya Sharma (28F) was last seen on 2026-11-15 ..."
}
```

**Key rules**:
- `latest_visit` is never duplicated in `previous_visits`.
- `previous_visits` are ordered newest first.
- `pending_promises` — due on or after `as_of_date`; Completed promises excluded.
- `overdue_promises` — due strictly before `as_of_date`; Completed promises excluded.
- Danger signs, professional-review flags, and missing-information items are reproduced verbatim from stored records — not inferred or modified.
- Patients with no visits or promises receive valid empty sections (`latest_visit: null`, empty arrays).

---

### 3.5 Referrals `/api/v1/referrals`

#### `POST /api/v1/referrals/` — Record a referral

| Field | Type | Required | Description |
|---|---|---|---|
| `patient_id` | string | ✅ | Registered patient ID |
| `reason` | string | ✅ | Clinical reason (non-blank) |
| `facility_name` | string | ✅ | Target facility or specialist (non-blank) |
| `referral_date` | date \| null | — | Defaults to today |
| `visit_id` | string \| null | — | Must belong to same patient if supplied |
| `referred_by` | string \| null | — | Referring health worker name/ID |
| `status` | string | — | `Pending` (default), `Completed`, or `Cancelled` |
| `notes` | string \| null | — | Optional transport or clinical notes |

**Response `201`** — `ReferralResponse`

```json
{
  "referral_id": "REF-2026-0001",
  "patient_id": "PAT-2026-0001",
  "visit_id": "VIS-2026-0001",
  "reason": "Suspected anaemia",
  "facility_name": "District Hospital Rampur",
  "referred_by": "ASHA Worker Meena",
  "referral_date": "2026-11-21",
  "status": "Pending",
  "notes": null,
  "created_at": "2026-11-21T10:00:00",
  "updated_at": "2026-11-21T10:00:00"
}
```

**Response `404`** — Patient or visit not found.
**Response `422`** — `visit_id` belongs to a different patient.

---

#### `GET /api/v1/referrals/` — List referrals

**Query parameters**: `patient_id`, `status`, `skip`, `limit`

---

#### `GET /api/v1/referrals/{referral_id}` — Get referral

**Response `200`** — `ReferralResponse`
**Response `404`** — Referral not found.

---

#### `PATCH /api/v1/referrals/{referral_id}` — Update referral

Partial update — omitted fields remain unchanged.

| Field | Null allowed | Notes |
|---|---|---|
| `reason` | ❌ | Explicit null or blank returns 422 |
| `facility_name` | ❌ | Explicit null or blank returns 422 |
| `referral_date` | ❌ | Explicit null returns 422 |
| `status` | ❌ | Explicit null returns 422; must be valid enum |
| `referred_by` | ✅ | Explicit null clears the field |
| `notes` | ✅ | Explicit null clears the field |

**Status transition rules**

| From | To | Allowed |
|---|---|---|
| Pending | Completed | ✅ |
| Pending | Cancelled | ✅ |
| Completed | Pending | ✅ |
| Completed | Cancelled | ✅ |
| Cancelled | Pending | ❌ 422 |
| Cancelled | Completed | ❌ 422 |

> Updating `notes` or other details on a Cancelled referral **does not change its status**. No referral is automatically completed or cancelled.

---

### 3.6 Medication Reminders `/api/v1/medication-reminders`

> **Important**: This module is a **record-keeping system only**. All medication details must be copied from an authorised prescription. The backend does not verify prescriptions or professional credentials — `prescribed_by` and `prescription_reference` are stored provenance fields only.

#### `POST /api/v1/medication-reminders/` — Record a medication reminder

| Field | Type | Required | Description |
|---|---|---|---|
| `patient_id` | string | ✅ | Registered patient ID |
| `medication_name` | string | ✅ | Medication name from prescription (non-blank) |
| `dosage_instructions` | string | ✅ | Exact dosage instructions from prescription (non-blank) |
| `prescribed_by` | string | ✅ | Name/designation of authorised prescriber (provenance field) |
| `prescription_reference` | string | ✅ | Prescription reference or slip ID (provenance field) |
| `frequency` | string \| null | — | Prescribed dosage frequency (e.g. `Twice daily after food`) |
| `start_date` | date \| null | — | Medication course start date |
| `end_date` | date \| null | — | Medication course end date (must be ≥ `start_date`) |
| `visit_id` | string \| null | — | Optional associated visit |
| `status` | string | — | `Active` (default) or `Inactive` |
| `notes` | string \| null | — | Administration or interaction notes |

**Response `201`** — `MedicationReminderResponse`

```json
{
  "reminder_id": "MED-2026-0001",
  "patient_id": "PAT-2026-0001",
  "visit_id": "VIS-2026-0001",
  "medication_name": "Ferrous Sulphate 200mg",
  "dosage_instructions": "One tablet twice daily after food",
  "frequency": "Twice daily",
  "start_date": "2026-11-21",
  "end_date": "2026-12-21",
  "prescribed_by": "Dr. A. Kumar (MCI-12345)",
  "prescription_reference": "Rx-20261121-001",
  "status": "Active",
  "notes": "Take with water. Avoid tea.",
  "created_at": "2026-11-21T10:00:00",
  "updated_at": "2026-11-21T10:00:00"
}
```

---

#### `GET /api/v1/medication-reminders/` — List reminders

**Query parameters**: `patient_id`, `status` (`Active`/`Inactive`), `skip`, `limit`

---

#### `GET /api/v1/medication-reminders/{reminder_id}` — Get reminder

**Response `200`** — `MedicationReminderResponse`
**Response `404`** — Reminder not found.

---

#### `PATCH /api/v1/medication-reminders/{reminder_id}` — Update reminder

Partial update — omitted fields remain unchanged.

| Field | Null allowed | Notes |
|---|---|---|
| `medication_name` | ❌ | Explicit null or blank returns 422 |
| `dosage_instructions` | ❌ | Explicit null or blank returns 422 |
| `prescribed_by` | ❌ | Explicit null or blank returns 422 |
| `prescription_reference` | ❌ | Explicit null or blank returns 422 |
| `status` | ❌ | Explicit null returns 422; must be `Active` or `Inactive` |
| `frequency` | ✅ | Explicit null clears the field |
| `start_date` | ✅ | Explicit null clears the field |
| `end_date` | ✅ | Explicit null clears the field |
| `notes` | ✅ | Explicit null clears the field |

If both `start_date` and `end_date` are present in the update, `end_date` must be ≥ `start_date`.

**Status rules**:
- Creating a reminder defaults to `Active`.
- `PATCH` with `{"status": "Inactive"}` deactivates the reminder.
- Editing other fields (notes, prescription details) on an `Inactive` reminder **preserves `Inactive`** — status does not change as a side effect.
- An `Inactive` reminder may be reactivated only by an intentional `{"status": "Active"}` patch.

---

#### `PATCH /api/v1/medication-reminders/{reminder_id}/deactivate` — Deactivate reminder

Sets status to `Inactive`. Idempotent on already-inactive reminders.

**Response `200`** — Updated `MedicationReminderResponse`

---

## 4. Member 2 Integration Contract

Member 2 (NLP/transcription pipeline) sends structured visit reports to this backend via:

```
POST /api/v1/visits/
```

### Full Request Schema

```json
{
  "patient_id": "PAT-2026-0001",
  "visit_date": "2026-11-21",
  "report": {
    "patient_name": null,
    "patient_age": null,
    "patient_gender": null,
    "chief_complaint": "Fever and headache",
    "symptoms": [
      {
        "name": "Fever",
        "duration": "3 days",
        "severity": "Moderate",
        "body_site": null,
        "notes": null
      },
      {
        "name": "Headache",
        "duration": "2 days",
        "severity": "Mild",
        "body_site": "Head",
        "notes": null
      }
    ],
    "danger_signs": ["High fever > 103 F"],
    "vital_signs_mentioned": {
      "temperature": "103.5 F",
      "blood_pressure": null
    },
    "missing_information": [
      {
        "field_name": "vaccine_status",
        "prompt_question": "Is the patient vaccinated?",
        "reason": null,
        "importance": null
      }
    ],
    "professional_review_required": true,
    "summary": "Patient presented with high fever and headache of 3 days duration.",
    "notes": null
  }
}
```

### Schema Notes for Member 2

| Item | Detail |
|---|---|
| `patient_id` | Must be a registered patient ID (`PAT-YYYY-NNNN`). The visit endpoint returns `404` if the patient does not exist. |
| `report.symptoms[].name` | **Required** field inside each symptom object. All other symptom fields are optional. |
| `report.missing_information[].field_name` | **Required** field inside each `MissingInformation` object. All other fields (`reason`, `prompt_question`, `importance`) are optional. |
| `report.professional_review_required` | Boolean. Defaults to `false` if omitted. |
| `report.vital_signs_mentioned` | Accepts a string or key-value object. |
| Extra fields in `report`, `symptoms`, `MissingInformation` | Permitted and preserved (`extra="allow"`). Forward-compatible with future NLP output fields. |
| `visit_date` | ISO 8601 date string (`YYYY-MM-DD`). |

---

## 5. Member 4 Integration Contract

Member 4 (ASHA mobile/web UI) consumes this backend as the primary read source.

### Key Endpoints for ASHA Workflows

#### Patient Lookup

```
GET /api/v1/patients/?search=<name>
GET /api/v1/patients/?contact_number=<phone>
GET /api/v1/patients/{patient_id}
```

#### Pre-Visit Briefing (primary read endpoint)

```
GET /api/v1/patients/{patient_id}/next-visit-summary?as_of_date=2026-11-21
```

Returns the full `NextVisitSummaryResponse` including patient demographics, latest and previous visit details, pending/overdue care promises, and attention items. See [Section 3.4](#34-next-visit-summary-apiv1patientsidinext-visit-summary) for a full sample response.

#### Care Promises

```
GET /api/v1/patients/{patient_id}/care-promises?status=Pending
PATCH /api/v1/care-promises/{promise_id}/complete        # Mark a promise done
```

#### Referrals

```
GET /api/v1/patients/{patient_id}/referrals
PATCH /api/v1/referrals/{referral_id}                   # Update status (Pending→Completed)
```

#### Medication Reminders

```
GET /api/v1/patients/{patient_id}/medication-reminders?status=Active
```

### ID Format Reference

| Entity | Format | Example |
|---|---|---|
| Patient | `PAT-YYYY-NNNN` | `PAT-2026-0001` |
| Visit | `VIS-YYYY-NNNN` | `VIS-2026-0003` |
| Care Promise | `CP-YYYY-NNNN` | `CP-2026-0001` |
| Referral | `REF-YYYY-NNNN` | `REF-2026-0002` |
| Medication Reminder | `MED-YYYY-NNNN` | `MED-2026-0001` |

---

## 6. Error Codes Reference

| HTTP Status | Meaning |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `404` | Patient, visit, promise, referral, or reminder not found |
| `422` | Validation error — see `detail` array for field-level messages |

**Common 422 causes**:
- Missing required field.
- Explicit `null` sent for a non-nullable field (`name`, `age`, `description`, `due_date`, `reason`, `facility_name`, `medication_name`, `dosage_instructions`, `prescribed_by`, `prescription_reference`).
- Blank or whitespace-only string for a required field.
- Unknown/extra field sent to a schema with `extra="forbid"`.
- Invalid enum value for `status`.
- Invalid status transition (e.g. Cancelled → Pending referral).
- `visit_id` belonging to a different patient.
- `end_date` before `start_date` on a medication reminder.

---

## 7. Design Constraints & Notes

### No Authentication

This prototype has **no authentication or authorisation layer**. All endpoints are publicly accessible. The fields `prescribed_by` and `prescription_reference` on medication reminders are stored provenance fields — the backend does not verify professional credentials or validate prescription authenticity.

### CORS

CORS is currently configured for local development origins. It is **not production-ready**. See `app/config.py` for `CORS_ORIGINS`.

### SQLite

The database is a local SQLite file at `backend/db.sqlite3`. Foreign key integrity is enforced at the SQLite level (`PRAGMA foreign_keys = ON`). For production use, replace with PostgreSQL and update `DATABASE_URL` in `app/config.py`.

### Forward Compatibility

The `StructuredReport`, `Symptom`, and `MissingInformation` schemas accept extra fields (`extra="allow"`) so Member 2 can extend the NLP output without breaking this backend.

### Timestamps

All timestamps are stored and returned in UTC without timezone suffix. The `datetime.now(timezone.utc).replace(tzinfo=None)` pattern is used throughout to avoid Python 3.12+ deprecation warnings on `datetime.utcnow()`.

### Prescription Provenance Disclaimer

> `prescribed_by` and `prescription_reference` stored in Medication Reminder records are record-keeping provenance fields entered by an ASHA worker copying from an authorised prescription. This backend stores them as supplied; it performs no independent verification of prescribers or prescription validity.
