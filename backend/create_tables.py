from app.db.session import Base, engine
from app.models import *  # noqa: F401,F403


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Database tables created from metadata")
