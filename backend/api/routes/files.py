"""File upload endpoint."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlmodel import Session

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..db import get_session
from ..models import Project
from ..storage import save_upload, ALLOWED_TYPES


router = APIRouter(prefix="/api/projects", tags=["files"])


class UploadResponse(BaseModel):
    file_type: str
    path: str


# Magic-byte sniffing: PDF starts with "%PDF", docx (zip) with "PK\x03\x04".
PDF_MAGIC = b"%PDF"
ZIP_MAGIC = b"PK\x03\x04"


def _verify_magic(file_type: str, head: bytes) -> None:
    if file_type in ("en_pdf", "tr_pdf"):
        if not head.startswith(PDF_MAGIC):
            raise HTTPException(status_code=400, detail="Not a valid PDF (missing %PDF magic)")
    elif file_type == "index_docx":
        if not head.startswith(ZIP_MAGIC):
            raise HTTPException(status_code=400, detail="Not a valid DOCX (missing zip magic)")


@router.post("/{project_id}/upload", response_model=UploadResponse)
async def upload_file(
    project_id: str,
    file_type: str = Form(...),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UploadResponse:
    if file_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"file_type must be one of {sorted(ALLOWED_TYPES)}")

    proj = session.get(Project, project_id)
    if not proj or proj.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024

    # Read into a temp file in chunks so we can enforce size + check magic
    # without buffering everything in memory.
    head = await file.read(8)
    _verify_magic(file_type, head)
    await file.seek(0)

    # Stream-size guard
    total = 0
    chunks: list[bytes] = []
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb} MB")
        chunks.append(chunk)

    import io
    buf = io.BytesIO(b"".join(chunks))
    try:
        dest = save_upload(project_id, file_type, buf, file.filename or "upload")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if file_type == "en_pdf":
        proj.en_pdf_path = str(dest)
    elif file_type == "tr_pdf":
        proj.tr_pdf_path = str(dest)
    elif file_type == "index_docx":
        proj.index_docx_path = str(dest)
    proj.updated_at = datetime.now(timezone.utc)
    session.add(proj)
    session.commit()

    return UploadResponse(file_type=file_type, path=str(dest))
