# backend/app/api/auth.py
"""
Authentication endpoints — zero-knowledge design.

The server receives only:
  email_lookup    = SHA-256(email_lower)      — never the real email
  username_lookup = SHA-256(username_lower)   — never the real username
  auth_verifier   = PBKDF2(password, email+":auth") as base64
                    — never the plaintext password

The server stores:
  email_lookup, username_lookup (hashes)
  verifier_hash = bcrypt(auth_verifier)

The server NEVER stores or logs plaintext email, username, or password.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.models.schemas import (
    RegisterRequest, RegisterResponse,
    LoginRequest, LoginResponse
)
from app.services.database import db

router = APIRouter()
security = HTTPBearer()

# ============ USER REGISTRATION ============

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest):
    """
    Register a new user.
    Receives pre-hashed identifiers and a derived auth verifier — never plaintext credentials.
    """
    try:
        user = db.create_user(
            email_lookup=request.email_lookup,
            auth_verifier=request.auth_verifier,
            auth_image_id=request.auth_image_id or "img_001",
            username_lookup=request.username_lookup,
        )

        return RegisterResponse(
            message="User registered successfully",
            user_id=user.user_id,
            created_at=user.created_at,
        )

    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {exc}",
        )

# ============ USER LOGIN ============

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Authenticate user and return a JWT.
    Verifies the client-derived auth_verifier against its bcrypt hash.
    """
    user = db.get_user_for_login(
        email_lookup=request.email_lookup,
        username_lookup=request.username_lookup,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.account_status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.account_status}",
        )

    if not db.verify_auth_verifier(request.auth_verifier, user.verifier_hash):
        db.increment_failed_attempts(user.user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    db.reset_failed_attempts(user.user_id)
    db.update_last_login(user.user_id)

    access_token = db.create_session(user.user_id)

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id,
        requires_mfa=False,
    )

# ============ GET CURRENT USER ============

@router.get("/me")
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Return the authenticated user's non-sensitive profile.
    No plaintext email/username is returned — the server doesn't know them.
    """
    token = credentials.credentials
    user_id = db.get_user_from_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "user_id":        user.user_id,
        "email_lookup":   user.email_lookup,
        "created_at":     user.created_at,
        "last_login":     user.last_login,
        "account_status": user.account_status,
    }

# ============ LOGOUT ============

@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    db.delete_session(token)
    return {"message": "Logged out successfully"}

# ============ ADMIN/DEBUG ENDPOINTS ============

@router.get("/admin/users")
async def list_users():
    """List all registered users — returns only lookup hashes, not real identifiers."""
    return {
        "total_users": db.get_user_count(),
        "users": db.list_all_users(),
    }

@router.get("/debug/database-info")
async def database_info():
    return db.get_debug_info()