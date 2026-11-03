FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
ENV PIP_DEFAULT_TIMEOUT=100 \
    PIP_RETRIES=5 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN mkdir -p app && touch app/__init__.py \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -e .

COPY . .
