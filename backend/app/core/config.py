from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Alfa Processing Platform API"
    environment: str = "development"
    supabase_url: str | None = None
    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/alfa_processing"
    secret_key: str = "change-this-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    storage_provider: str = "local"
    local_storage_dir: str = "../uploads"
    local_export_dir: str = "../exports"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
