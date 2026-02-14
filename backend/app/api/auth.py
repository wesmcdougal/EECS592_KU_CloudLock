# backend/app/api/auth.py
"""
Authentication endpoints using the DatabaseService
"""
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from typing import Optional
from app.models.schemas import (
    RegisterRequest, RegisterResponse,
    LoginRequest, LoginResponse
)
from app.services.database import db  # ← Use the shared database service

router = APIRouter()
security = HTTPBearer()

# ============ USER REGISTRATION ============

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest):
    """
    Register a new user
    """
    try:
        # Use db.create_user instead of users_db
        user = db.create_user(
            email=request.email,
            password=request.password,
            auth_image_id=request.auth_image_id
        )
        
        return RegisterResponse(
            message="User registered successfully",
            user_id=user.user_id,
            email=user.email,
            created_at=user.created_at,
            email_verification_required=False
        )
        
    except ValueError as e:
        # Email already exists
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

# ============ USER LOGIN ============

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Authenticate user and return access token
    """
    # Get user from database
    user = db.get_user_by_email(request.email)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check account status
    if user.account_status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.account_status}"
        )
    
    # Verify password (uses bcrypt)
    if not db.verify_password(request.password, user.password_hash):
        # Increment failed attempts
        db.increment_failed_attempts(user.user_id)
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Password correct - reset failed attempts
    db.reset_failed_attempts(user.user_id)
    
    # Update last login
    db.update_last_login(user.user_id)
    
    # Create session token
    access_token = db.create_session(user.user_id)
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=None,
        user_id=user.user_id,
        email=user.email,
        requires_mfa=False
    )

# ============ GET CURRENT USER ============

@router.get("/me")
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Get current authenticated user info
    Requires: Authorization: Bearer <token>
    """
    # Token is automatically extracted from "Bearer <token>"
    token = credentials.credentials
    
    # Get user from token
    user_id = db.get_user_from_token(token)
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    # Get user details
    user = db.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return {
        "user_id": user.user_id,
        "email": user.email,
        "created_at": user.created_at,
        "last_login": user.last_login,
        "account_status": user.account_status
    }
# ============ LOGOUT ============

@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Logout - invalidate session token
    Requires: Authorization: Bearer <token>
    """
    token = credentials.credentials
    db.delete_session(token)
    
    return {"message": "Logged out successfully"}

# ============ ADMIN/DEBUG ENDPOINTS ============

@router.get("/admin/users")
async def list_users():
    """
    List all registered users (for debugging)
    """
    return {
        "total_users": db.get_user_count(),
        "users": db.list_all_users()
    }

@router.get("/debug/database-info")
async def database_info():
    """
    Get database statistics and state
    """
    return {
        "total_users": len(db.users),
        "total_sessions": len(db.sessions),
        "total_vaults": len(db.vaults),
        "user_emails": list(db.email_index.keys()),
        "users_detail": db.list_all_users()
    }