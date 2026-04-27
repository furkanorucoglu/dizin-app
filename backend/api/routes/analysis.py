"""Analysis lifecycle endpoints: analyze, anchors, process, status."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import CurrentUser, get_current_user
from ..db import get_session
from ..models import Anchor, Project, ProgressEvent
from ..tasks import run_analyze, run_process


router = APIRouter(prefix="/api/projects", tags=["analysis"])


class AnchorIn(BaseModel):
    en_page: int
    tr_page: int


class AnchorOut(BaseModel):
    en_page: int
    tr_page: int
    auto_detected: bool
    confirmed: bool


class AnalysisOut(BaseModel):
    status: str
    en_offset: int | None
    tr_offset: int | None
    anchors: list[AnchorOut]


class StatusOut(BaseModel):
    status: str
    status_detail: str | None
    last_phase: str | None
    last_progress: float | None
    last_message: str | None


def _get_owned(session: Session, project_id: str, user: CurrentUser) -> Project:
    p = session.get(Project, project_id)
    if not p or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.post("/{project_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
def trigger_analyze(
    project_id: str,
    background: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    proj = _get_owned(session, project_id, user)
    if not (proj.en_pdf_path and proj.tr_pdf_path):
        raise HTTPException(status_code=400, detail="EN and TR PDFs must be uploaded first")
    proj.status = "analyzing"
    proj.updated_at = datetime.now(timezone.utc)
    session.add(proj)
    session.commit()
    background.add_task(run_analyze, project_id)
    return {"status": "queued"}


@router.get("/{project_id}/analysis", response_model=AnalysisOut)
def get_analysis(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AnalysisOut:
    proj = _get_owned(session, project_id, user)
    anchor_rows = session.exec(
        select(Anchor).where(Anchor.project_id == project_id).order_by(Anchor.order_index)
    ).all()
    return AnalysisOut(
        status=proj.status,
        en_offset=proj.en_offset,
        tr_offset=proj.tr_offset,
        anchors=[
            AnchorOut(
                en_page=a.en_page, tr_page=a.tr_page,
                auto_detected=a.auto_detected, confirmed=a.confirmed,
            )
            for a in anchor_rows
        ],
    )


@router.post("/{project_id}/anchors", response_model=AnalysisOut)
def set_anchors(
    project_id: str,
    body: list[AnchorIn],
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AnalysisOut:
    proj = _get_owned(session, project_id, user)
    # Replace all existing anchors with the user-confirmed list.
    existing = session.exec(
        select(Anchor).where(Anchor.project_id == project_id)
    ).all()
    for a in existing:
        session.delete(a)
    for i, a in enumerate(body):
        session.add(Anchor(
            project_id=project_id, en_page=a.en_page, tr_page=a.tr_page,
            auto_detected=False, confirmed=True, order_index=i,
        ))
    session.commit()
    return get_analysis(project_id, user, session)


@router.post("/{project_id}/process", status_code=status.HTTP_202_ACCEPTED)
def trigger_process(
    project_id: str,
    background: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    proj = _get_owned(session, project_id, user)
    if not (proj.en_pdf_path and proj.tr_pdf_path and proj.index_docx_path):
        raise HTTPException(status_code=400, detail="All three files (en_pdf, tr_pdf, index_docx) must be uploaded")
    proj.status = "processing"
    proj.updated_at = datetime.now(timezone.utc)
    session.add(proj)
    session.commit()
    background.add_task(run_process, project_id)
    return {"status": "queued"}


@router.get("/{project_id}/status", response_model=StatusOut)
def get_status(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StatusOut:
    proj = _get_owned(session, project_id, user)
    last = session.exec(
        select(ProgressEvent)
        .where(ProgressEvent.project_id == project_id)
        .order_by(ProgressEvent.id.desc())
        .limit(1)
    ).first()
    return StatusOut(
        status=proj.status,
        status_detail=proj.status_detail,
        last_phase=last.phase if last else None,
        last_progress=last.progress if last else None,
        last_message=last.message if last else None,
    )
