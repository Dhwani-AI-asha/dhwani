"""
Database connection, session management and Base declarative class for Dhwani Backend.
"""

import sqlite3
from pathlib import Path
from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.config import settings

# Enforce SQLite foreign key constraints for all SQLite connections across app and test engines
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()


# Ensure parent directory exists for persistent-disk SQLite paths (e.g. sqlite:////var/data/db.sqlite3)
if settings.DATABASE_URL.startswith("sqlite:///") and ":memory:" not in settings.DATABASE_URL:
    _db_file = Path(settings.DATABASE_URL[len("sqlite:///"):])
    try:
        _db_file.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

# SQLite requires check_same_thread: False when accessed across multiple FastAPI worker threads
connect_args = (
    {"check_same_thread": False}
    if settings.DATABASE_URL.startswith("sqlite")
    else {}
)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a SQLAlchemy session.
    Guarantees the session is properly closed after each request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_nullable_patient_age_sqlite() -> None:
    """Safely relax legacy NOT NULL constraint on patients.age in existing SQLite DBs."""
    if not str(engine.url).startswith("sqlite"):
        return
    needs_migration = False
    with engine.connect() as conn:
        cols = conn.exec_driver_sql("PRAGMA table_info(patients);").fetchall()
        age_col = next((c for c in cols if len(c) >= 4 and c[1] == "age"), None)
        if age_col and age_col[3] != 0:
            needs_migration = True
    if not needs_migration:
        return

    # Rebuild table after closing the inspection connection cleanly (prevents SQLite write lock)
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("PRAGMA foreign_keys=OFF;")
        cur.execute("BEGIN TRANSACTION;")
        cur.execute(
            """
            CREATE TABLE patients_migrated (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id VARCHAR(32) NOT NULL UNIQUE,
                name VARCHAR(120) NOT NULL,
                age INTEGER NULL,
                gender VARCHAR(20),
                contact_number VARCHAR(20),
                address VARCHAR(255),
                registration_date DATE NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            );
            """
        )
        cur.execute(
            """
            INSERT INTO patients_migrated (
                id, patient_id, name, age, gender, contact_number, address,
                registration_date, created_at, updated_at
            )
            SELECT
                id, patient_id, name, age, gender, contact_number, address,
                registration_date, created_at, updated_at
            FROM patients;
            """
        )
        cur.execute("DROP TABLE patients;")
        cur.execute("ALTER TABLE patients_migrated RENAME TO patients;")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_patients_id ON patients (id);")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_patients_patient_id ON patients (patient_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_patients_name ON patients (name);")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_patients_contact_number ON patients (contact_number);")
        raw.commit()
        cur.execute("PRAGMA foreign_keys=ON;")
        cur.close()
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()


def init_db() -> None:
    """Creates all database tables defined by models extending Base and seeds synthetic beneficiaries idempotently."""
    Base.metadata.create_all(bind=engine)
    _ensure_nullable_patient_age_sqlite()
    from app.services.seed_service import seed_synthetic_beneficiaries

    db = SessionLocal()
    try:
        seed_synthetic_beneficiaries(db)
    finally:
        db.close()
