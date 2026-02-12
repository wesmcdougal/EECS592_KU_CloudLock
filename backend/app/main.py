# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from app.config import settings
from app.models.schemas import HealthResponse

# Import routers
from app.api import auth, vault

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Secure zero-knowledge password manager API",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc"  # ReDoc
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(vault.router, prefix="/api/vault", tags=["Vault"])

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        service="password-manager-api",
        version="1.0.0"
    )

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Password Manager API",
        "docs": "/docs",
        "health": "/health"
    }

# Lambda handler (for AWS deployment)
handler = Mangum(app)