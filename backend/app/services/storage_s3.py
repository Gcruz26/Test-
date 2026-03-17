from app.services.storage_base import StorageProvider


class S3StorageProvider(StorageProvider):
    def save_file(self, file_name: str, content: bytes) -> str:
        raise NotImplementedError("S3 provider is planned but not implemented yet.")
