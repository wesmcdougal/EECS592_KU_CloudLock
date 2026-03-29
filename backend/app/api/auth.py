# backend/app/api/auth.py
"""
Authentication API Router (auth.py)

Serves as the primary auth entry point for account access. Responsibilities include:
- Zero-knowledge registration and login validation
- Session token issuance and logout handling
- MFA gate behavior for login (challenge-first flow)
- MFA verification for TOTP and biometric methods
- Current-user token verification endpoint

Revision History:
- Wesley McDougal - 29MAR2026 - Added MFA challenge verification and login gate flow
"""
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import re

from app.models.schemas import (
    LoginRequest,
    LoginResponse,
    MfaLoginVerifyRequest,
    MfaLoginVerifyResponse,
    RegisterRequest,
    RegisterResponse,
)
from app.config import settings
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
            mfa_enrollment=request.mfa_enrollment,
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

    if user.mfa_enabled:
        challenge_token = db.create_mfa_challenge(user.user_id, user.mfa_methods)
        return LoginResponse(
            access_token=None,
            token_type="bearer",
            user_id=user.user_id,
            requires_mfa=True,
            mfa_types=user.mfa_methods,
            mfa_challenge_token=challenge_token,
        )

    access_token = db.create_session(user.user_id)

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id,
        requires_mfa=False,
        mfa_types=[],
    )


@router.post("/login/mfa/verify", response_model=MfaLoginVerifyResponse)
async def verify_login_mfa(request: MfaLoginVerifyRequest):
    challenge = db.verify_mfa_challenge(request.mfa_challenge_token)
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA challenge invalid or expired",
        )

    user_id = challenge.get("user_id")
    allowed_methods = challenge.get("mfa_methods", [])
    method = request.method.strip().lower()

    if method not in allowed_methods:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA method is not enabled for this account",
        )

    if method == "totp":
        if not request.totp_code or not re.fullmatch(r"\d{6}", request.totp_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid 6-digit TOTP code is required",
            )

        # TODO: Replace this with Cognito VerifySoftwareToken / RespondToAuthChallenge.
        if request.totp_code != settings.mfa_dev_totp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MFA code",
            )

    if method == "biometric":
        if not request.device_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="device_id is required for biometric verification",
            )

        status_snapshot = db.get_mfa_status(user_id)
        has_device = any(
            device.device_id == request.device_id
            for device in status_snapshot.get("biometric_devices", [])
        )
        if not has_device:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This device is not registered for biometric MFA",
            )

    access_token = db.create_session(user_id)
    return MfaLoginVerifyResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user_id,
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