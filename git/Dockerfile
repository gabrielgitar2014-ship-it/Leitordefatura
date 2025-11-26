# Usa uma imagem leve do Python
FROM python:3.10-slim

# 1. Instala o POPPLER no sistema operacional (O pulo do gato!)
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Define a pasta de trabalho
WORKDIR /app

# Copia os arquivos de requisitos e instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código
COPY . .

# Define a variável de ambiente para o Python não bufferizar logs
ENV PYTHONUNBUFFERED=1

# Comando para iniciar o servidor (Gunicorn em vez de python app.py)
# O Cloud Run injeta a variável $PORT automaticamente
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app