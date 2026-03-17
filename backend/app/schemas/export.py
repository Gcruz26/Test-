from datetime import datetime

from pydantic import BaseModel


class ExportItem(BaseModel):
    id: int
    legal_entity_id: int
    legal_entity_name: str
    export_type: str
    file_name: str
    status: str
    created_at: datetime


class ExportGenerationResponse(BaseModel):
    message: str
    exports_created: int
    files: list[ExportItem]
