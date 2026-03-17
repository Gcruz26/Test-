import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.client import Client
from app.models.client_mapping_config import ClientMappingConfig
from app.models.enums import InterpreterStatus, PaymentFrequency, UserRole
from app.models.interpreter import Interpreter
from app.models.interpreter_client_id import InterpreterClientID
from app.models.legal_entity import LegalEntity
from app.models.routing_rule import RoutingRule
from app.models.user import User


def seed():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@alfa.local").first()
        if not admin:
            admin = User(
                email="admin@alfa.local",
                full_name="Platform Admin",
                hashed_password=hash_password("admin123"),
                role=UserRole.ADMIN,
            )
            db.add(admin)
            db.flush()
            print("Seeded admin user: admin@alfa.local / admin123")

        legal_entities = {
            "Alfa Systems LLC": "United States",
            "Alfa Systems Cabo Verde": "Cape Verde",
            "Inocore Senegal": "Senegal",
        }
        for name, country in legal_entities.items():
            existing = db.query(LegalEntity).filter(LegalEntity.name == name).first()
            if not existing:
                db.add(LegalEntity(name=name, country=country))
        db.flush()

        clients_data = [
            ("Mercury Health Network", "MERCURY"),
            ("NorthBridge Legal", "NBRIDGE"),
            ("Sunrise Community Care", "SUNRISE"),
        ]
        for name, code in clients_data:
            existing = db.query(Client).filter(Client.name == name).first()
            if not existing:
                db.add(Client(name=name, code=code))
        db.flush()

        entity_lookup = {entity.name: entity for entity in db.query(LegalEntity).all()}
        client_lookup = {client.code: client for client in db.query(Client).all()}
        interpreter_data = [
            {
                "employee_id": "EMP-1001",
                "full_name": "Maria Silva",
                "first_name": "Maria",
                "last_name": "Silva",
                "email": "maria.silva@alfa.example.com",
                "language": "Portuguese, English",
                "location": "Praia",
                "country": "Cape Verde",
                "client_code": "MERCURY",
                "payment_frequency": PaymentFrequency.WEEKLY,
                "rate": 28.50,
                "status": InterpreterStatus.ACTIVE,
                "entity_name": "Alfa Systems Cabo Verde",
            },
            {
                "employee_id": "EMP-1002",
                "full_name": "James Carter",
                "first_name": "James",
                "last_name": "Carter",
                "email": "james.carter@alfa.example.com",
                "language": "English, Spanish",
                "location": "Boston",
                "country": "United States",
                "client_code": "NBRIDGE",
                "payment_frequency": PaymentFrequency.BIWEEKLY,
                "rate": 34.00,
                "status": InterpreterStatus.ACTIVE,
                "entity_name": "Alfa Systems LLC",
            },
            {
                "employee_id": "EMP-1003",
                "full_name": "Awa Ndiaye",
                "first_name": "Awa",
                "last_name": "Ndiaye",
                "email": "awa.ndiaye@inocore.example.com",
                "language": "French, Wolof, English",
                "location": "Dakar",
                "country": "Senegal",
                "client_code": "SUNRISE",
                "payment_frequency": PaymentFrequency.MONTHLY,
                "rate": 22.75,
                "status": InterpreterStatus.ON_HOLD,
                "entity_name": "Inocore Senegal",
            },
        ]

        for item in interpreter_data:
            existing = (
                db.query(Interpreter)
                .filter((Interpreter.employee_id == item["employee_id"]) | (Interpreter.email == item["email"]))
                .first()
            )
            if not existing:
                db.add(
                    Interpreter(
                        employee_id=item["employee_id"],
                        full_name=item["full_name"],
                        first_name=item["first_name"],
                        last_name=item["last_name"],
                        email=item["email"],
                        language=item["language"],
                        location=item["location"],
                        country=item["country"],
                        client_id=client_lookup[item["client_code"]].id,
                        payment_frequency=item["payment_frequency"],
                        rate=item["rate"],
                        status=item["status"],
                        legal_entity_id=entity_lookup[item["entity_name"]].id,
                    )
                )
            else:
                existing.employee_id = item["employee_id"]
                existing.full_name = item["full_name"]
                existing.first_name = item["first_name"]
                existing.last_name = item["last_name"]
                existing.email = item["email"]
                existing.language = item["language"]
                existing.location = item["location"]
                existing.country = item["country"]
                existing.client_id = client_lookup[item["client_code"]].id
                existing.payment_frequency = item["payment_frequency"]
                existing.rate = item["rate"]
                existing.status = item["status"]
                existing.legal_entity_id = entity_lookup[item["entity_name"]].id
        db.flush()

        interpreter_lookup = {interpreter.email: interpreter for interpreter in db.query(Interpreter).all()}
        client_id_map = [
            ("maria.silva@alfa.example.com", "MERCURY", "CV-INT-1001"),
            ("james.carter@alfa.example.com", "NBRIDGE", "US-INT-2044"),
            ("awa.ndiaye@inocore.example.com", "SUNRISE", "SN-INT-3155"),
        ]

        for interpreter_email, client_code, external_id in client_id_map:
            interpreter = interpreter_lookup[interpreter_email]
            client = client_lookup[client_code]
            existing = (
                db.query(InterpreterClientID)
                .filter(
                    InterpreterClientID.interpreter_id == interpreter.id,
                    InterpreterClientID.client_id == client.id,
                )
                .first()
            )
            if not existing:
                db.add(
                    InterpreterClientID(
                        interpreter_id=interpreter.id,
                        client_id=client.id,
                        external_id=external_id,
                    )
                )

        mapping_seeds = [
            {
                "client_code": "MERCURY",
                "source_platform": "Mercury",
                "report_type": "Monthly Billing",
                "field_aliases": {
                    "service_date": ["DOS", "Date of Service", "service_date"],
                    "interpreter_name": ["Interpreter", "Provider Name"],
                    "external_interpreter_id": ["Interpreter ID", "provider_id"],
                    "minutes": ["Minutes", "Duration Minutes"],
                    "hours": ["Hours"],
                    "rate": ["Rate", "Hourly Rate"],
                    "amount": ["Total", "Amount"],
                    "location": ["Location", "Department"],
                    "currency": ["Currency", "Currency Code"],
                },
            },
            {
                "client_code": "NBRIDGE",
                "source_platform": "NorthBridge",
                "report_type": "Interpreter Payroll",
                "field_aliases": {
                    "service_date": ["service date", "date"],
                    "interpreter_name": ["name", "interpreter_name"],
                    "external_interpreter_id": ["external id", "interpreter id"],
                    "minutes": ["mins", "minutes"],
                    "hours": ["hours", "duration_hours"],
                    "rate": ["unit_rate", "rate"],
                    "amount": ["line_total", "amount"],
                    "location": ["site", "location"],
                    "currency": ["curr", "currency"],
                },
            },
        ]

        for config in mapping_seeds:
            client = client_lookup[config["client_code"]]
            existing = (
                db.query(ClientMappingConfig)
                .filter(
                    ClientMappingConfig.client_id == client.id,
                    ClientMappingConfig.source_platform == config["source_platform"],
                    ClientMappingConfig.report_type == config["report_type"],
                )
                .first()
            )
            if not existing:
                db.add(
                    ClientMappingConfig(
                        client_id=client.id,
                        source_platform=config["source_platform"],
                        report_type=config["report_type"],
                        field_aliases=config["field_aliases"],
                        is_active=True,
                    )
                )

        routing_seeds = [
            ("MERCURY", "Cabo Verde to Alfa CV", "location = Cabo Verde", "Alfa Systems Cabo Verde", None),
            ("MERCURY", "Senegal to Inocore", "location = Senegal", "Inocore Senegal", None),
            ("MERCURY", "Fallback to Alfa US", None, "Alfa Systems LLC", None),
            ("NBRIDGE", "Cabo Verde to Alfa CV", "location = Cabo Verde", "Alfa Systems Cabo Verde", "Invoice"),
            ("NBRIDGE", "Senegal to Inocore", "location = Senegal", "Inocore Senegal", "Invoice"),
            ("NBRIDGE", "Fallback to Alfa US", None, "Alfa Systems LLC", "Invoice"),
            ("SUNRISE", "Cabo Verde to Alfa CV", "location = Cabo Verde", "Alfa Systems Cabo Verde", "Bill"),
            ("SUNRISE", "Senegal to Inocore", "location = Senegal", "Inocore Senegal", "Bill"),
            ("SUNRISE", "Fallback to Alfa US", None, "Alfa Systems LLC", "Bill"),
        ]

        for client_code, rule_name, conditions, entity_name, destination in routing_seeds:
            client = client_lookup[client_code]
            legal_entity = entity_lookup[entity_name]
            existing = (
                db.query(RoutingRule)
                .filter(
                    RoutingRule.client_id == client.id,
                    RoutingRule.rule_name == rule_name,
                )
                .first()
            )
            if not existing:
                db.add(
                    RoutingRule(
                        client_id=client.id,
                        legal_entity_id=legal_entity.id,
                        rule_name=rule_name,
                        conditions=conditions,
                        destination=destination,
                        is_active=True,
                    )
                )

        db.commit()
        print("Seeded legal_entities, clients, interpreters, interpreter_client_ids, mapping configs, and routing rules")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
