# CP Coach — Backend

Graph-Augmented Knowledge Tracing for Personalized Competitive Programming Training.

## Quick Start

### 1. Local Development

```bash
cd backend
python -m venv venv
source venv/bin/activate        # macOS/Linux
pip install -r requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install torch-geometric

# Copy env template
cp .env.example .env

# Run server
uvicorn main:app --reload --port 8000
```

API docs auto-generated at: **http://localhost:8000/docs**

### 2. Docker (recommended)

From repo root:

```bash
docker-compose up --build
```

Services:
| Service | URL | Purpose |
|---------|-----|---------|
| Backend | http://localhost:8000 | FastAPI server |
| Adminer | http://localhost:8080 | Database GUI |
| Postgres | localhost:5432 | Database |

### 3. Training

```bash
cd backend
python -m training.train_dkt --help

# Example: train Graph-DKT on your data
python -m training.train_dkt \
  --data path/to/training.csv \
  --model graph_dkt \
  --epochs 50 \
  --batch 32 \
  --out weights/graph_dkt.pt
```

CSV format: `user_id, topic, solved, difficulty, timestamp_delta`

### 4. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/analyze/{handle}?platform=cf&mode=quick` | Analyze user |
| GET | `/api/recommend/{handle}?platforms=cf&top_k=20` | Recommendations |
| GET | `/api/progress/{handle}` | Weekly progress |
| GET | `/api/graph` | Topic prerequisite graph |

### Environment Variables

See `.env.example` for all required variables.
