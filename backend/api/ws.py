"""In-memory pub/sub for per-project progress events (WebSocket fanout)."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any


class ProgressBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, project_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._subscribers[project_id].add(q)
        return q

    async def unsubscribe(self, project_id: str, q: asyncio.Queue) -> None:
        async with self._lock:
            self._subscribers[project_id].discard(q)

    def publish_threadsafe(self, project_id: str, event: dict[str, Any]) -> None:
        """Publish from a non-async context (background tasks)."""
        loop = asyncio.get_event_loop()
        loop.call_soon_threadsafe(self._dispatch, project_id, event)

    async def publish(self, project_id: str, event: dict[str, Any]) -> None:
        async with self._lock:
            queues = list(self._subscribers.get(project_id, ()))
        for q in queues:
            await q.put(event)

    def _dispatch(self, project_id: str, event: dict[str, Any]) -> None:
        for q in list(self._subscribers.get(project_id, ())):
            q.put_nowait(event)


_broker: ProgressBroker | None = None


def get_broker() -> ProgressBroker:
    global _broker
    if _broker is None:
        _broker = ProgressBroker()
    return _broker
