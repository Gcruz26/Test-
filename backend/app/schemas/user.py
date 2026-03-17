from pydantic import BaseModel

from app.models.enums import UserRole


class UserBase(BaseModel):
    email: str
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int

    class Config:
        from_attributes = True
