FROM python:3.11-slim
WORKDIR /app
# Install torch CPU-only first (smaller, faster to install)
# Install torch + torch-geometric in a single layer to save ~2 GB image size
RUN pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu && \
    pip install torch-geometric==2.5.3
COPY requirements.txt .
# Requirements should not re-install torch (remove from requirements.txt)
RUN pip install -r requirements.txt
# Install psql client for startup.sh schema init
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
COPY . .
# Run as non-root for security
RUN useradd -m appuser
USER appuser
EXPOSE 8000
CMD ["/bin/bash", "/app/startup.sh"]
