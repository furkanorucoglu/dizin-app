"""File storage abstraction (local filesystem or S3)."""
from __future__ import annotations

import shutil
import io
import os
from pathlib import Path
from typing import IO

from .config import get_settings


ALLOWED_TYPES = {"en_pdf": ".pdf", "tr_pdf": ".pdf", "index_docx": ".docx"}


def project_dir(project_id: str) -> Path:
    p = get_settings().storage_dir / project_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_upload(project_id: str, file_type: str, source: IO[bytes], original_name: str) -> str:
    if file_type not in ALLOWED_TYPES:
        raise ValueError(f"Unknown file_type: {file_type}")
    ext = ALLOWED_TYPES[file_type]
    if not original_name.lower().endswith(ext):
        raise ValueError(f"Expected {ext} file, got {original_name}")

    settings = get_settings()
    if settings.s3_bucket:
        # Phase 7: S3 Storage (Implementation skeleton)
        import boto3
        s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
        )
        key = f"{project_id}/{file_type}{ext}"
        s3.upload_fileobj(source, settings.s3_bucket, key)
        return f"s3://{settings.s3_bucket}/{key}"
    else:
        # Local storage
        dest = project_dir(project_id) / f"{file_type}{ext}"
        with dest.open("wb") as f:
            shutil.copyfileobj(source, f)
        return str(dest)


def delete_project_files(project_id: str) -> None:
    settings = get_settings()
    if settings.s3_bucket:
        import boto3
        s3 = boto3.resource("s3")
        bucket = s3.Bucket(settings.s3_bucket)
        bucket.objects.filter(Prefix=f"{project_id}/").delete()
    else:
        pdir = settings.storage_dir / project_id
        if pdir.exists():
            shutil.rmtree(pdir, ignore_errors=True)


def output_path(project_id: str, name: str) -> str:
    settings = get_settings()
    if settings.s3_bucket:
        return f"s3://{settings.s3_bucket}/{project_id}/{name}"
    return str(project_dir(project_id) / name)

def get_file_content(path: str) -> io.BytesIO:
    """Helper to read from local or S3."""
    if path.startswith("s3://"):
        import boto3
        bucket_name, key = path[5:].split("/", 1)
        s3 = boto3.client("s3")
        obj = s3.get_object(Bucket=bucket_name, Key=key)
        return io.BytesIO(obj["Body"].read())
    else:
        with open(path, "rb") as f:
            return io.BytesIO(f.read())
