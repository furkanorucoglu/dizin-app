"""Database engine + session helpers (SQLModel/SQLite by default)."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings


_engine = None


def get_engine():
    global _engine
    if _engine is None:
        url = get_settings().database_url
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=connect_args)
    return _engine


def init_db() -> None:
    # Import models to register them with SQLModel.metadata
    from . import models  # noqa: F401
    SQLModel.metadata.create_all(get_engine())


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    """Use inside background tasks where dependency injection isn't available."""
    with Session(get_engine()) as session:
        yield session
