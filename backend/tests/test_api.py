"""End-to-end API tests using FastAPI's TestClient.

Walks the full lifecycle: create → upload → analyze → process → list → export.
Uses dev-mode auth (X-Dev-User header).
"""
from __future__ import annotations

import os
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def api_client(tmp_path_factory):
    """Spin up the FastAPI app pointed at a temporary SQLite + storage dir."""
    workdir = tmp_path_factory.mktemp("apidata")
    os.environ["DIZINAPP_STORAGE_DIR"] = str(workdir / "storage")
    os.environ["DIZINAPP_DATABASE_URL"] = f"sqlite:///{workdir / 'test.db'}"
    os.environ["DIZINAPP_DEV_MODE"] = "true"

    # Reset cached settings/engine since prior tests may have set them.
    from api import config, db
    config._settings = None
    db._engine = None

    from api.main import create_app
    app = create_app()
    with TestClient(app) as client:
        yield client


HEADERS = {"X-Dev-User": "user-1"}


def _wait_for(client, project_id: str, target_status: str, *, timeout: float = 20.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get(f"/api/projects/{project_id}", headers=HEADERS)
        last = r.json()
        if last["status"] == target_status:
            return last
        if last["status"] == "error":
            raise AssertionError(f"Project errored: {last.get('status_detail')}")
        time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for {target_status}; last={last}")


class TestHealthAndAuth:
    def test_health(self, api_client):
        r = api_client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_unauthenticated_blocked(self, api_client):
        r = api_client.post("/api/projects", json={"title": "x"})
        assert r.status_code == 401


class TestProjectLifecycle:
    def test_full_pipeline(self, api_client, en_pdf_path, tr_pdf_path, index_docx_path):
        # 1. Create
        r = api_client.post("/api/projects", json={"title": "My Book"}, headers=HEADERS)
        assert r.status_code == 201, r.text
        project = r.json()
        pid = project["id"]
        assert project["status"] == "draft"

        # 2. Upload all three files
        for ftype, path in [
            ("en_pdf", en_pdf_path),
            ("tr_pdf", tr_pdf_path),
            ("index_docx", index_docx_path),
        ]:
            with open(path, "rb") as fh:
                r = api_client.post(
                    f"/api/projects/{pid}/upload",
                    headers=HEADERS,
                    data={"file_type": ftype},
                    files={"file": (Path(path).name, fh)},
                )
            assert r.status_code == 200, r.text

        # 3. Analyze
        r = api_client.post(f"/api/projects/{pid}/analyze", headers=HEADERS)
        assert r.status_code == 202

        proj = _wait_for(api_client, pid, "ready")
        assert proj["en_offset"] is not None
        assert proj["tr_offset"] is not None

        r = api_client.get(f"/api/projects/{pid}/analysis", headers=HEADERS)
        assert r.status_code == 200
        analysis = r.json()
        assert len(analysis["anchors"]) >= 1

        # 4. Confirm anchors (no-op replacement using detected ones)
        anchors_in = [{"en_page": a["en_page"], "tr_page": a["tr_page"]} for a in analysis["anchors"]]
        r = api_client.post(f"/api/projects/{pid}/anchors", headers=HEADERS, json=anchors_in)
        assert r.status_code == 200

        # 5. Process
        r = api_client.post(f"/api/projects/{pid}/process", headers=HEADERS)
        assert r.status_code == 202
        _wait_for(api_client, pid, "done")

        # 6. List entries
        r = api_client.get(f"/api/projects/{pid}/entries", headers=HEADERS)
        assert r.status_code == 200
        page = r.json()
        assert page["total"] >= 1
        assert len(page["items"]) == page["total"] or len(page["items"]) == page["limit"]
        first = page["items"][0]
        assert first["headword"]
        assert first["translated_pages"]

        # 7. Manual override an entry
        new_pages = [{"start": 99, "end": 99, "italic": False, "raw": "99"}]
        r = api_client.patch(
            f"/api/projects/{pid}/entries/{first['id']}",
            headers=HEADERS,
            json={"translated_pages": new_pages},
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["manually_edited"] is True
        assert updated["translated_pages"][0]["start"] == 99

        # 8. Export
        r = api_client.get(f"/api/projects/{pid}/export.docx", headers=HEADERS)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument"
        )
        # Body is a valid zip
        from io import BytesIO
        with zipfile.ZipFile(BytesIO(r.content)) as z:
            assert "word/document.xml" in z.namelist()

        # 9. Status endpoint reflects last progress
        r = api_client.get(f"/api/projects/{pid}/status", headers=HEADERS)
        assert r.status_code == 200
        st = r.json()
        assert st["status"] == "done"
        assert st["last_phase"] in ("done", "process")


class TestUploadValidation:
    def test_rejects_non_pdf(self, api_client):
        r = api_client.post("/api/projects", json={"title": "Bad"}, headers=HEADERS)
        pid = r.json()["id"]
        r = api_client.post(
            f"/api/projects/{pid}/upload",
            headers=HEADERS,
            data={"file_type": "en_pdf"},
            files={"file": ("fake.pdf", b"not a real pdf")},
        )
        assert r.status_code == 400
        assert "PDF" in r.json()["detail"]

    def test_rejects_unknown_file_type(self, api_client):
        r = api_client.post("/api/projects", json={"title": "Bad2"}, headers=HEADERS)
        pid = r.json()["id"]
        r = api_client.post(
            f"/api/projects/{pid}/upload",
            headers=HEADERS,
            data={"file_type": "garbage"},
            files={"file": ("x.pdf", b"%PDF-1.4")},
        )
        assert r.status_code == 400


class TestAccessControl:
    def test_other_user_cannot_see_project(self, api_client):
        r = api_client.post("/api/projects", json={"title": "Mine"}, headers=HEADERS)
        pid = r.json()["id"]
        r = api_client.get(f"/api/projects/{pid}", headers={"X-Dev-User": "intruder"})
        assert r.status_code == 404
