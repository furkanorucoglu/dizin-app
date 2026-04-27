FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY dizinapp ./dizinapp
COPY api ./api

RUN pip install --upgrade pip && pip install -e ".[api]"

ENV DIZINAPP_STORAGE_DIR=/data/storage \
    DIZINAPP_DATABASE_URL=sqlite:////data/dizinapp.db

VOLUME ["/data"]
EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
