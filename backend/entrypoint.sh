#!/bin/sh
set -e

echo "=== Kotouč Manager Backend startup ==="
echo "1/3 Spouštím Alembic migrace..."
alembic upgrade head

echo "2/3 Inicializuji databázi (seed pokud prázdná)..."
python -u -m app.init_db

echo "3/3 Spouštím FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
