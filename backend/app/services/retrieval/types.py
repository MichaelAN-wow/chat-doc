import uuid
from dataclasses import dataclass, field


@dataclass
class ChunkHit:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    content: str
    score: float
    metadata: dict = field(default_factory=dict)
    dense_rank: int | None = None
    sparse_rank: int | None = None
    dense_score: float | None = None
    sparse_score: float | None = None
