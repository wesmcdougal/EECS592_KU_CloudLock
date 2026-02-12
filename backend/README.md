# Password Manager - Backend

FastAPI backend for zero-knowledge password manager.

## Setup Instructions

### 1. Prerequisites
- Python 3.11+
- AWS CLI configured
- Git

### 3. Create Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# OR
venv\Scripts\activate     # Windows
```

### 4. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Configure Environment Variables
```bash
# Copy example file
cp .env.example .env

# Edit .env with your AWS credentials
# Ask team lead for dev environment values
nano .env
```

### 6. Run Locally
```bash
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/docs for API documentation.

### 7. Run Tests
```bash
pytest
```

## Deployment
```bash
# Deploy to dev environment
sam build
sam deploy --config-env dev

# Deploy to production
sam deploy --config-env prod
```