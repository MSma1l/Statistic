FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependențe de sistem pentru argon2 / Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8000

# Tabelele sunt create automat la pornire (vezi app/main.py lifespan).
# --proxy-headers + --forwarded-allow-ips=*: în spatele nginx-ului dispecer,
# uvicorn citește IP-ul real din X-Forwarded-For (rate-limiting corect per
# vizitator). Fără proxy (local direct) headerul lipsește, deci nu schimbă nimic.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
