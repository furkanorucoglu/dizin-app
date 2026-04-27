"""Per-page PDF rendering with optional term highlighting (PyMuPDF)."""
from __future__ import annotations

import io
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session

from ..auth import CurrentUser, get_current_user
from ..db import get_session
from ..models import Project


router = APIRouter(prefix="/api/projects", tags=["pages"])


class HighlightRect(BaseModel):
    x: float
    y: float
    w: float
    h: float


class HighlightResponse(BaseModel):
    page_w: float
    page_h: float
    highlights: list[HighlightRect]


def _resolve_pdf(proj: Project, lang: str) -> tuple[str, int]:
    if lang == "en":
        if not proj.en_pdf_path:
            raise HTTPException(status_code=404, detail="EN PDF not uploaded")
        return proj.en_pdf_path, proj.en_offset or 0
    if lang == "tr":
        if not proj.tr_pdf_path:
            raise HTTPException(status_code=404, detail="TR PDF not uploaded")
        return proj.tr_pdf_path, proj.tr_offset or 0
    raise HTTPException(status_code=400, detail="lang must be 'en' or 'tr'")


def _open_page(pdf_path: str, printed_page: int, offset: int):
    import fitz  # PyMuPDF
    physical = printed_page + offset
    doc = fitz.open(pdf_path)
    if physical < 1 or physical > doc.page_count:
        doc.close()
        raise HTTPException(status_code=404, detail=f"Printed page {printed_page} out of range")
    return doc, doc[physical - 1]


def _get_owned(session: Session, project_id: str, user: CurrentUser) -> Project:
    p = session.get(Project, project_id)
    if not p or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("/{project_id}/pages/{lang}/{page_num}")
def render_page(
    project_id: str,
    lang: Literal["en", "tr"],
    page_num: int,
    dpi: int = Query(120, ge=72, le=300),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    proj = _get_owned(session, project_id, user)
    pdf_path, offset = _resolve_pdf(proj, lang)
    doc, page = _open_page(pdf_path, page_num, offset)
    try:
        pix = page.get_pixmap(dpi=dpi)
        png = pix.tobytes("png")
    finally:
        doc.close()
    return Response(content=png, media_type="image/png")


@router.get("/{project_id}/pages/{lang}/{page_num}/highlight", response_model=HighlightResponse)
def highlight_term(
    project_id: str,
    lang: Literal["en", "tr"],
    page_num: int,
    term: str = Query(..., min_length=1),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> HighlightResponse:
    """Return rectangles where `term` appears on the page (PDF coords).

    The frontend can overlay these as SVG rects on top of the rendered PNG.
    """
    proj = _get_owned(session, project_id, user)
    pdf_path, offset = _resolve_pdf(proj, lang)
    doc, page = _open_page(pdf_path, page_num, offset)
    try:
        rects = page.search_for(term)
        page_rect = page.rect
        highlights = [
            HighlightRect(x=r.x0, y=r.y0, w=r.width, h=r.height)
            for r in rects
        ]
        return HighlightResponse(
            page_w=page_rect.width,
            page_h=page_rect.height,
            highlights=highlights,
        )
    finally:
        doc.close()
