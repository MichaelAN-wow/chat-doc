import uuid
from datetime import datetime, timezone

from app.models.document import Document, DocumentStatus
from app.models.workspace import Workspace
from tests.fakes import FakeAsyncSession


def test_fake_session_workspace_crud():
    db = FakeAsyncSession()
    ws = Workspace(id=uuid.uuid4(), name="Demo", description=None)
    db.add(ws)

    assert db.workspaces[ws.id].name == "Demo"


def test_fake_session_document_filter_by_workspace():
    db = FakeAsyncSession()
    ws1 = uuid.uuid4()
    ws2 = uuid.uuid4()
    now = datetime.now(timezone.utc)

    db.add(
        Document(
            id=uuid.uuid4(),
            workspace_id=ws1,
            filename="a.txt",
            file_path="/tmp/a.txt",
            file_type="txt",
            file_size=1,
            status=DocumentStatus.PENDING,
            created_at=now,
            updated_at=now,
        )
    )
    db.add(
        Document(
            id=uuid.uuid4(),
            workspace_id=ws2,
            filename="b.txt",
            file_path="/tmp/b.txt",
            file_type="txt",
            file_size=1,
            status=DocumentStatus.PENDING,
            created_at=now,
            updated_at=now,
        )
    )

    assert len(db.documents) == 2
