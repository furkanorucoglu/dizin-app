"""Project CRUD."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import CurrentUser, get_current_user
from ..db import get_session
from ..models import Project
from ..storage import delete_project_files


router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    title: str


class ProjectOut(BaseModel):
    id: str
    title: str
    status: str
    status_detail: str | None
    created_at: datetime
    updated_at: datetime
    en_pdf_path: str | None
    tr_pdf_path: str | None
    index_docx_path: str | None
    en_offset: int | None
    tr_offset: int | None


def _to_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        title=p.title,
        status=p.status,
        status_detail=p.status_detail,
        created_at=p.created_at,
        updated_at=p.updated_at,
        en_pdf_path=p.en_pdf_path,
        tr_pdf_path=p.tr_pdf_path,
        index_docx_path=p.index_docx_path,
        en_offset=p.en_offset,
        tr_offset=p.tr_offset,
    )


def _get_owned(session: Session, project_id: str, user: CurrentUser) -> Project:
    p = session.get(Project, project_id)
    if not p or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProjectOut:
    p = Project(user_id=user.id, title=body.title.strip() or "Untitled")
    session.add(p)
    session.commit()
    session.refresh(p)
    return _to_out(p)


@router.get("", response_model=list[ProjectOut])
def list_projects(
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ProjectOut]:
    rows = session.exec(
        select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc())
    ).all()
    return [_to_out(p) for p in rows]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProjectOut:
    return _to_out(_get_owned(session, project_id, user))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    p = _get_owned(session, project_id, user)
    session.delete(p)
    session.commit()
    delete_project_files(project_id)
    return None
