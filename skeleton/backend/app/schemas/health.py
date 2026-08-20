"""Health-check response schemas."""

from pydantic import BaseModel


class DbHealth(BaseModel):
    db: str
    table: str
    rows: int
