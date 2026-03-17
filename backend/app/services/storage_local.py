from pathlib import Path

from app.services.storage_base import StorageProvider


class LocalStorageProvider(StorageProvider):
    def __init__(self, base_dir: str):
        self.base_path = Path(base_dir).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save_file(self, file_name: str, content: bytes) -> str:
        target = self.base_path / file_name
        target.write_bytes(content)
        return str(target)
