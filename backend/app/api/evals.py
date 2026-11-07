import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.evals.runner import run_evals
from app.models.workspace import Workspace

router = APIRouter(tags=["evals"])


@router.post("/workspaces/{workspace_id}/evals/run")
async def run_workspace_evals(workspace_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return await run_evals(db, workspace_id)
