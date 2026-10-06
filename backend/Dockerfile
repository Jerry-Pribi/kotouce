# ---- Základní Python image ----
FROM python:3.11-slim

WORKDIR /app

# Nainstaluj systémové závislosti (pro PyMySQL nejsou potřeba kompilátory)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Nejdřív nainstaluj závislosti (cache vrstva)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Zkopíruj kód aplikace
COPY . .

# Nastav oprávnění pro entrypoint
RUN chmod +x entrypoint.sh

# Exponuj port pro FastAPI
EXPOSE 8000

# Spustitelný skript: migrace → seed (pokud prázdná DB) → uvicorn
ENTRYPOINT ["sh", "entrypoint.sh"]
