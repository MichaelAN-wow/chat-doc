from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://ragkb:ragkb_dev@localhost:5432/ragkb"
    DATABASE_URL_SYNC: str = "postgresql+psycopg2://ragkb:ragkb_dev@localhost:5432/ragkb"

    REDIS_URL: str = "redis://localhost:6379/0"

    EMBEDDING_PROVIDER: str = "local"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    CHUNK_SIZE: int = 800
    CHUNK_OVERLAP: int = 120

    DENSE_TOP_K: int = 20
    SPARSE_TOP_K: int = 20
    FINAL_TOP_K: int = 8
    CANDIDATE_POOL: int = 30
    NEIGHBOR_WINDOW: int = 1
    RRF_K: int = 60
    RETRIEVAL_THRESHOLD: float = 0.18
    DENSE_MIN_SCORE: float = 0.22
    DUAL_QUERY_RETRIEVE: bool = True
    REWRITE_ENABLED: bool = True

    LLM_PROVIDER: str = "nvidia"
    LLM_MODEL: str = "nvidia_nim/nvidia/nemotron-3.5-bolt-e4b"
    NVIDIA_API_KEY: str = ""
    NVIDIA_API_BASE: str = "https://integrate.api.nvidia.com/v1"
    DEEPSEEK_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OLLAMA_API_BASE: str = "http://ollama:11434"
    OPENAI_API_KEY: str = ""
    OPENAI_API_BASE: str = ""

    UPLOAD_DIR: str = "/app/uploads"
    UPLOAD_MAX_MB: int = 20

    RATE_LIMIT_REQUESTS: int = 20
    RATE_LIMIT_WINDOW: int = 60

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
