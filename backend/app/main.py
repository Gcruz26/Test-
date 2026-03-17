from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, exports, interpreters, operations, reports, validation_queue, zoho_crm
from app.core.config import settings

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(interpreters.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(validation_queue.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(zoho_crm.router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "backend"}
