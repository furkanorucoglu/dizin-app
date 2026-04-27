"""WebSocket progress stream."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import Session

from ..db import get_engine
from ..models import Project
from ..ws import get_broker


router = APIRouter()


@router.websocket("/api/projects/{project_id}/progress")
async def progress_ws(websocket: WebSocket, project_id: str):
    await websocket.accept()

    # Existence check (no auth for WS in dev — TODO: token query param in prod)
    with Session(get_engine()) as s:
        proj = s.get(Project, project_id)
        if not proj:
            await websocket.send_json({"error": "Project not found"})
            await websocket.close()
            return

    broker = get_broker()
    queue = await broker.subscribe(project_id)
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
            if event.get("phase") in ("done", "error"):
                # Keep socket alive — client decides when to close.
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await broker.unsubscribe(project_id, queue)
