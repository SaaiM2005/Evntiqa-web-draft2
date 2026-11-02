from typing import Generic, TypeVar
from pydantic import BaseModel

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
