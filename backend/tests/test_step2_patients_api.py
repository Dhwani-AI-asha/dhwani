"""
Unit and integration tests for Step 2: Patient Registration, Retrieval, and Search APIs.
All tests use an isolated in-memory SQLite database and fictional patient data.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    """Provides a TestClient with an isolated in-memory SQLite database for each test."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def test_register_patient_success(client):
    """Verify successful patient registration and auto-generated patient ID format."""
    payload = {
        "name": "Kavitha Sharma",
        "age": 29,
        "gender": "Female",
        "contact_number": "9876543210",
        "address": "Village Rampur, Ward 2"
    }
    response = client.post("/api/v1/patients/", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["name"] == "Kavitha Sharma"
    assert data["age"] == 29
    assert data["gender"] == "Female"
    assert data["contact_number"] == "9876543210"
    assert data["address"] == "Village Rampur, Ward 2"
    # Verify patient_id format PAT-YYYY-0001
    assert data["patient_id"].startswith("PAT-")
    assert len(data["patient_id"].split("-")) == 3
    # Verify internal database primary key integer 'id' is NOT exposed
    assert "id" not in data


def test_register_multiple_patients_sequential_ids(client):
    """Verify consecutive patient registrations produce unique sequential IDs."""
    p1 = client.post("/api/v1/patients/", json={"name": "Patient Alpha", "age": 22}).json()
    p2 = client.post("/api/v1/patients/", json={"name": "Patient Beta", "age": 45}).json()

    assert p1["patient_id"] != p2["patient_id"]
    seq1 = int(p1["patient_id"].split("-")[-1])
    seq2 = int(p2["patient_id"].split("-")[-1])
    assert seq2 == seq1 + 1


def test_register_patient_validation_errors(client):
    """Verify input validation: empty name or negative age rejected with 422."""
    # Empty name
    res1 = client.post("/api/v1/patients/", json={"name": "   ", "age": 30})
    assert res1.status_code == 422

    # Negative age
    res2 = client.post("/api/v1/patients/", json={"name": "Valid Name", "age": -5})
    assert res2.status_code == 422

    # Age above 130
    res3 = client.post("/api/v1/patients/", json={"name": "Valid Name", "age": 140})
    assert res3.status_code == 422


def test_get_patient_by_id(client):
    """Verify retrieving a patient by their unique patient ID."""
    created = client.post("/api/v1/patients/", json={
        "name": "Lakshmi Bai",
        "age": 32,
        "contact_number": "9123456780"
    }).json()

    patient_id = created["patient_id"]
    response = client.get(f"/api/v1/patients/{patient_id}")
    assert response.status_code == 200

    retrieved = response.json()
    assert retrieved["patient_id"] == patient_id
    assert retrieved["name"] == "Lakshmi Bai"
    assert retrieved["age"] == 32
    assert retrieved["contact_number"] == "9123456780"


def test_get_nonexistent_patient_returns_404(client):
    """Verify looking up a nonexistent patient returns 404."""
    response = client.get("/api/v1/patients/PAT-2026-9999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_search_patients_by_name(client):
    """Verify searching patients by name keyword."""
    client.post("/api/v1/patients/", json={"name": "Anita Kumari", "age": 27})
    client.post("/api/v1/patients/", json={"name": "Sunita Rao", "age": 35})
    client.post("/api/v1/patients/", json={"name": "Rajesh Kumar", "age": 40})

    # Search for 'Anita'
    res = client.get("/api/v1/patients/?search=Anita")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["patients"][0]["name"] == "Anita Kumari"

    # Search case-insensitive 'nita' matches 'Anita' and 'Sunita'
    res2 = client.get("/api/v1/patients/?search=nita")
    assert res2.status_code == 200
    assert res2.json()["total"] == 2


def test_search_patients_by_contact_number(client):
    """Verify searching patients by phone number."""
    client.post("/api/v1/patients/", json={"name": "Person A", "age": 30, "contact_number": "9876511111"})
    client.post("/api/v1/patients/", json={"name": "Person B", "age": 40, "contact_number": "9876522222"})

    res = client.get("/api/v1/patients/?search=9876511111")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["patients"][0]["name"] == "Person A"


def test_search_no_results(client):
    """Verify searching with no matching records returns total 0 and empty list."""
    res = client.get("/api/v1/patients/?search=NonExistentTerm")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["patients"] == []


def test_update_patient_details(client):
    """Verify updating fields of an existing patient."""
    created = client.post("/api/v1/patients/", json={
        "name": "Rupa Devi",
        "age": 24,
        "address": "Old Ward 1"
    }).json()

    patient_id = created["patient_id"]

    # Update address and contact_number
    update_res = client.patch(f"/api/v1/patients/{patient_id}", json={
        "address": "New Ward 5, Block B",
        "contact_number": "9998887776"
    })
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["address"] == "New Ward 5, Block B"
    assert updated["contact_number"] == "9998887776"
    assert updated["name"] == "Rupa Devi"  # Unchanged
    assert updated["age"] == 24            # Unchanged


def test_update_nonexistent_patient_returns_404(client):
    """Verify updating a nonexistent patient returns 404."""
    res = client.patch("/api/v1/patients/PAT-2026-9999", json={"address": "Nowhere"})
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_patch_explicit_null_name_returns_422(client):
    """Verify explicitly passing 'name': null in PATCH returns HTTP 422."""
    created = client.post("/api/v1/patients/", json={"name": "Initial Name", "age": 30}).json()
    patient_id = created["patient_id"]

    res = client.patch(f"/api/v1/patients/{patient_id}", json={"name": None})
    assert res.status_code == 422
    errors = res.json()["detail"]
    assert any("name" in str(err["loc"]) for err in errors)


def test_patch_explicit_null_age_returns_422(client):
    """Verify explicitly passing 'age': null in PATCH returns HTTP 422."""
    created = client.post("/api/v1/patients/", json={"name": "Initial Name", "age": 30}).json()
    patient_id = created["patient_id"]

    res = client.patch(f"/api/v1/patients/{patient_id}", json={"age": None})
    assert res.status_code == 422
    errors = res.json()["detail"]
    assert any("age" in str(err["loc"]) for err in errors)


def test_patch_explicit_null_optional_fields_succeeds(client):
    """Verify optional fields (gender, contact_number, address) accept explicit null to clear values."""
    created = client.post("/api/v1/patients/", json={
        "name": "Geeta Rani",
        "age": 26,
        "gender": "Female",
        "contact_number": "9876543210",
        "address": "Village Shanti Nagar"
    }).json()
    patient_id = created["patient_id"]

    # Explicitly clear contact_number and address to null
    patch_res = client.patch(f"/api/v1/patients/{patient_id}", json={
        "contact_number": None,
        "address": None
    })
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["contact_number"] is None
    assert updated["address"] is None
    assert updated["name"] == "Geeta Rani"    # Required field untouched
    assert updated["age"] == 26                # Required field untouched
    assert updated["gender"] == "Female"       # Omitted optional field untouched


def test_patch_omitted_fields_remain_unchanged(client):
    """Verify omitted fields remain completely untouched on partial updates."""
    created = client.post("/api/v1/patients/", json={
        "name": "Original Name",
        "age": 40,
        "gender": "Male",
        "contact_number": "9000000000",
        "address": "Original Address"
    }).json()
    patient_id = created["patient_id"]

    # Update only age
    patch_res = client.patch(f"/api/v1/patients/{patient_id}", json={"age": 41})
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["age"] == 41
    assert updated["name"] == "Original Name"
    assert updated["gender"] == "Male"
    assert updated["contact_number"] == "9000000000"
    assert updated["address"] == "Original Address"