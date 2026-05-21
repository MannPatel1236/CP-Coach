FROM python:3.11-slim
WORKDIR /app
# Install torch CPU-only first (smaller, faster to install)
RUN pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu
RUN pip install torch-geometric==2.5.3
COPY requirements.txt .
RUN pip install -r requirements.txt
# Install psql client for startup.sh schema init
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
COPY . .
EXPOSE 8000
CMD ["/bin/bash", "/app/startup.sh"]
