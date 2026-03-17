from typing import Protocol


class StorageProvider(Protocol):
    def save_file(self, file_name: str, content: bytes) -> str:
        ...
