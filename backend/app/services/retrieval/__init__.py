from app.services.retrieval.types import ChunkHit

__all__ = ["ChunkHit", "hybrid_retrieve"]


def __getattr__(name: str):
    if name == "hybrid_retrieve":
        from app.services.retrieval.hybrid import hybrid_retrieve

        return hybrid_retrieve
    raise AttributeError(name)
