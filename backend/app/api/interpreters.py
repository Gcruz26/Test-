from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.client import Client
from app.models.enums import InterpreterStatus, PaymentFrequency
from app.models.interpreter import Interpreter
from app.models.user import User
from app.schemas.interpreter import (
    InterpreterCreate,
    InterpreterListItem,
    InterpreterMetaResponse,
    InterpreterUpdate,
)

router = APIRouter(prefix="/interpreters", tags=["Interpreters"])


def _normalize(value: str) -> str:
    return value.strip()


def _build_list_item(interpreter: Interpreter, client_name: str) -> InterpreterListItem:
    return InterpreterListItem(
        id=interpreter.id,
        employee_id=interpreter.employee_id,
        full_name=interpreter.full_name,
        email=interpreter.email,
        language=interpreter.language,
        location=interpreter.location,
        country=interpreter.country,
        associated_client_id=interpreter.client_id or 0,
        associated_client_name=client_name,
        payment_frequency=interpreter.payment_frequency,
        rate=interpreter.rate,
        status=interpreter.status,
        propio_interpreter_id=interpreter.propio_interpreter_id or "",
        big_interpreter_id=interpreter.big_interpreter_id or "",
        equiti_voyce_id=interpreter.equiti_voyce_id or "",
        equiti_martti_id=interpreter.equiti_martti_id or "",
        mercury_recipient_id=interpreter.mercury_recipient_id or "",
        zoho_contact_id=interpreter.zoho_contact_id,
        last_synced_at=interpreter.last_synced_at,
        sync_status=interpreter.sync_status,
        sync_error_message=interpreter.sync_error_message,
        created_at=interpreter.created_at,
    )


def _validate_client(db: Session, client_id: int) -> Client:
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Associated client is invalid")
    return client


def _apply_payload(interpreter: Interpreter, payload: InterpreterCreate | InterpreterUpdate) -> None:
    interpreter.employee_id = _normalize(payload.employee_id)
    interpreter.full_name = _normalize(payload.full_name)
    interpreter.email = _normalize(payload.email)
    interpreter.language = _normalize(payload.language)
    interpreter.location = _normalize(payload.location)
    interpreter.country = _normalize(payload.country)
    interpreter.client_id = payload.client_id
    interpreter.payment_frequency = payload.payment_frequency
    interpreter.rate = payload.rate
    interpreter.status = payload.status
    interpreter.propio_interpreter_id = _normalize(payload.propio_interpreter_id)
    interpreter.big_interpreter_id = _normalize(payload.big_interpreter_id)
    interpreter.equiti_voyce_id = _normalize(payload.equiti_voyce_id)
    interpreter.equiti_martti_id = _normalize(payload.equiti_martti_id)
    interpreter.mercury_recipient_id = _normalize(payload.mercury_recipient_id)


@router.get("", response_model=list[InterpreterListItem])
def list_interpreters(
    full_name: str | None = Query(default=None),
    employee_id: str | None = Query(default=None),
    language: str | None = Query(default=None),
    location: str | None = Query(default=None),
    country: str | None = Query(default=None),
    client_id: int | None = Query(default=None, gt=0),
    payment_frequency: PaymentFrequency | None = Query(default=None),
    status_value: InterpreterStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Operations", "Finance", "Viewer"})),
):
    query = db.query(Interpreter, Client.name).join(Client, Client.id == Interpreter.client_id)

    if full_name:
        query = query.filter(Interpreter.full_name.ilike(f"%{full_name.strip()}%"))
    if employee_id:
        query = query.filter(Interpreter.employee_id.ilike(f"%{employee_id.strip()}%"))
    if language:
        query = query.filter(Interpreter.language.ilike(f"%{language.strip()}%"))
    if location:
        query = query.filter(Interpreter.location.ilike(f"%{location.strip()}%"))
    if country:
        query = query.filter(Interpreter.country.ilike(f"%{country.strip()}%"))
    if client_id:
        query = query.filter(Interpreter.client_id == client_id)
    if payment_frequency:
        query = query.filter(Interpreter.payment_frequency == payment_frequency)
    if status_value:
        query = query.filter(Interpreter.status == status_value)

    rows = query.order_by(func.lower(Interpreter.full_name).asc()).all()
    return [_build_list_item(interpreter, client_name) for interpreter, client_name in rows]


@router.get("/meta", response_model=InterpreterMetaResponse)
def interpreter_meta(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Operations", "Finance", "Viewer"})),
):
    clients = db.query(Client).order_by(func.lower(Client.name).asc()).all()
    return InterpreterMetaResponse(
        clients=clients,
        payment_frequency_options=list(PaymentFrequency),
        status_options=list(InterpreterStatus),
    )


@router.post("", response_model=InterpreterListItem, status_code=status.HTTP_201_CREATED)
def create_interpreter(
    payload: InterpreterCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Operations"})),
):
    client = _validate_client(db, payload.client_id)
    interpreter = Interpreter()
    _apply_payload(interpreter, payload)
    interpreter.sync_status = "manual"
    db.add(interpreter)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee ID must be unique")

    db.refresh(interpreter)
    return _build_list_item(interpreter, client.name)


@router.put("/{interpreter_id}", response_model=InterpreterListItem)
def update_interpreter(
    interpreter_id: int,
    payload: InterpreterUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Operations"})),
):
    interpreter = db.query(Interpreter).filter(Interpreter.id == interpreter_id).first()
    if not interpreter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interpreter not found")
    if interpreter.zoho_contact_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Zoho-synced interpreters are read-only in the platform. Update the Contact in Zoho CRM instead.",
        )

    client = _validate_client(db, payload.client_id)
    _apply_payload(interpreter, payload)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee ID must be unique")

    db.refresh(interpreter)
    return _build_list_item(interpreter, client.name)
