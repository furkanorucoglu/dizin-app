"""SQLModel database models for the dizinapp API.

Mirrors PROJE_PLANI §6.2.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, JSON, Text
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


# ──────────────────────────────────────────────────────────────
# Project
# ──────────────────────────────────────────────────────────────


class Project(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    user_id: str = Field(index=True)
    title: str
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    en_pdf_path: Optional[str] = None
    tr_pdf_path: Optional[str] = None
    index_docx_path: Optional[str] = None

    en_offset: Optional[int] = None
    tr_offset: Optional[int] = None

    # draft | analyzing | ready | processing | done | error
    status: str = Field(default="draft", index=True)
    status_detail: Optional[str] = Field(default=None, sa_column=Column(Text))


class Anchor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True, foreign_key="project.id")
    en_page: int
    tr_page: int
    auto_detected: bool = True
    confirmed: bool = False
    order_index: int = 0


class IndexEntry(SQLModel, table=True):
    """A processed index paragraph."""
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True, foreign_key="project.id")
    paragraph_index: int
    headword: str
    aliases: list = Field(default_factory=list, sa_column=Column(JSON))
    is_proper_noun: bool = False

    # JSON arrays of {start, end, italic}
    original_pages: list = Field(default_factory=list, sa_column=Column(JSON))
    translated_pages: list = Field(default_factory=list, sa_column=Column(JSON))

    confidence: str = "medium"  # high | medium | low
    manually_edited: bool = False
    raw_text: Optional[str] = Field(default=None, sa_column=Column(Text))


class ProgressEvent(SQLModel, table=True):
    """Persisted progress events (also broadcast via WebSocket)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True, foreign_key="project.id")
    created_at: datetime = Field(default_factory=_utcnow)
    phase: str  # analyze | process | done | error
    progress: float = 0.0  # 0.0 to 1.0
    message: Optional[str] = None
