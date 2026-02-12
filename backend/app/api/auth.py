# supports register, login, and a simple me token lookup.
from fastapi import APIRouter, HTTPException, status
from app.models.schemas import (
    RegisterRequest, RegisterResponse,
    LoginRequest, LoginResponse
)
import uuid
import time
from typing import Dict

router = APIRouter()

# In-memory storage for demo (replace with DynamoDB in production)
users_db: Dict[str, dict] = {}
sessions_db: Dict[str, str] = {}  # token -> user_id

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest):
    """
    Register a new user
    """
    # Check if user already exists
    if any(user['email'] == request.email for user in users_db.values()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists"
        )
    
    # Create user
    user_id = str(uuid.uuid4())
    users_db[user_id] = {
        "user_id": user_id,
        "email": request.email,
        "password": request.password,  # In production: hash with bcrypt
        "auth_image_id": request.auth_image_id,
        "created_at": int(time.time())
    }
    
    return RegisterResponse(
        message="User registered successfully",
        user_id=user_id,
        email_verification_required=False  # Simplified for demo
    )

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Authenticate user and return JWT token
    """
    # Find user by email
    user = next(
        (u for u in users_db.values() if u['email'] == request.email),
        None
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Verify password (simplified - use bcrypt in production)
    if user['password'] != request.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Generate token (simplified - use JWT in production)
    access_token = f"token_{uuid.uuid4()}"
    sessions_db[access_token] = user['user_id']
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=None,
        user_id=user['user_id'],
        requires_mfa=False,  # Simplified for demo
        mfa_types=None
    )

@router.get("/me")
async def get_current_user(token: str):
    """
    Get current user from token (for testing)
    """
    user_id = sessions_db.get(token)
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user = users_db.get(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return {
        "user_id": user['user_id'],
        "email": user['email']
    }