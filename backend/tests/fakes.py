from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.models.document import Document
from app.models.workspace import Workspace


def _now() -> datetime:
    return datetime.now(timezone.utc)


class _ScalarResult:
    def __init__(self, rows: list):
        self._rows = rows

    def all(self) -> list:
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class _Result:
    def __init__(self, rows: list):
        self._rows = rows

    def scalars(self) -> _ScalarResult:
        return _ScalarResult(self._rows)


class FakeAsyncSession:
    def __init__(self) -> None:
        self.workspaces: dict[uuid.UUID, Workspace] = {}
        self.documents: dict[uuid.UUID, Document] = {}

    def add(self, obj) -> None:
        if isinstance(obj, Workspace):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.created_at is None:
                obj.created_at = _now()
            if obj.updated_at is None:
                obj.updated_at = obj.created_at
            self.workspaces[obj.id] = obj
            return

        if isinstance(obj, Document):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.created_at is None:
                obj.created_at = _now()
            if obj.updated_at is None:
                obj.updated_at = obj.created_at
            if obj.chunk_count is None:
                obj.chunk_count = 0
            if obj.error_message is None:
                obj.error_message = None
            self.documents[obj.id] = obj
            return

        raise TypeError(f"Unsupported model type: {type(obj)!r}")

    async def commit(self) -> None:
        return None

    async def refresh(self, obj) -> None:
        return None

    async def get(self, model, ident):
        if model is Workspace:
            return self.workspaces.get(ident)
        if model is Document:
            return self.documents.get(ident)
        return None

    async def delete(self, obj) -> None:
        if isinstance(obj, Workspace):
            self.workspaces.pop(obj.id, None)
            for doc_id, doc in list(self.documents.items()):
                if doc.workspace_id == obj.id:
                    self.documents.pop(doc_id, None)
            return
        if isinstance(obj, Document):
            self.documents.pop(obj.id, None)
            return
        raise TypeError(f"Unsupported model type: {type(obj)!r}")

    async def execute(self, statement):
        entity = statement.column_descriptions[0]["entity"]

        if entity is Workspace:
            rows = sorted(
                self.workspaces.values(),
                key=lambda item: item.created_at or _now(),
                reverse=True,
            )
            return _Result(rows)

        if entity is Document:
            rows = list(self.documents.values())
            workspace_id = _extract_workspace_id(statement)
            if workspace_id is not None:
                rows = [doc for doc in rows if doc.workspace_id == workspace_id]
            rows = sorted(
                rows,
                key=lambda item: item.created_at or _now(),
                reverse=True,
            )
            return _Result(rows)

        return _Result([])


def _extract_workspace_id(statement):
    try:
        where = statement.whereclause
    except Exception:
        return None
    if where is None:
        return None

    stack = [where]
    while stack:
        node = stack.pop()
        left = getattr(node, "left", None)
        right = getattr(node, "right", None)
        if left is not None and right is not None:
            left_name = getattr(left, "key", None) or getattr(left, "name", None)
            if left_name == "workspace_id":
                return getattr(right, "value", right)
        for child in getattr(node, "clauses", []) or []:
            stack.append(child)
        if hasattr(node, "element"):
            stack.append(node.element)
    return None
