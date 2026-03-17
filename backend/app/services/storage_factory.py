from app.core.config import settings
from app.services.storage_base import StorageProvider
from app.services.storage_local import LocalStorageProvider
from app.services.storage_s3 import S3StorageProvider


def get_storage_provider() -> StorageProvider:
    if settings.storage_provider.lower() == "s3":
        return S3StorageProvider()
    return LocalStorageProvider(settings.local_storage_dir)
