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
import time

from jose import JWTError, jwt

from app.models.schemas import (
    LoginRequest,
    LoginResponse,
    DeleteAccountRequest,
    DeleteAccountResponse,
    ImageVerifyRequest,
    ImageVerifyResponse,
    MfaImageChallengeRequest,
    MfaImageChallengeResponse,
    MfaLoginVerifyRequest,
    MfaLoginVerifyResponse,
    RegisterRequest,
    RegisterResponse,
)
from app.config import settings
from app.services.database import db
from app.services.totp import decrypt_totp_secret, verify_totp_code

router = APIRouter()
security = HTTPBearer()


def _decode_token_subject(token: str):
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None
    return payload.get("sub")

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
            proposed_user_id=request.proposed_user_id or None,
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
        challenge_token = db.create_mfa_challenge(
            user.user_id,
            user.mfa_methods,
            device_fingerprint_hash=request.device_fingerprint,
        )
        return LoginResponse(
            access_token=None,
            token_type="bearer",
            user_id=user.user_id,
            requires_mfa=True,
            mfa_types=user.mfa_methods,
            mfa_challenge_token=challenge_token,
        )

    # Non-MFA path: check for suspicious context before issuing a session
    if db.is_suspicious_context(user.user_id, request.device_fingerprint):
        image_challenge_token = db.create_image_challenge(
            user.user_id,
            device_fingerprint_hash=request.device_fingerprint,
        )
        return LoginResponse(
            access_token=None,
            token_type="bearer",
            user_id=user.user_id,
            requires_mfa=False,
            mfa_types=[],
            requires_image_auth=True,
            image_challenge_token=image_challenge_token,
        )

    access_token = db.create_session(user.user_id)

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.user_id,
        requires_mfa=False,
        mfa_types=[],
    )


@router.post("/mfa/image-challenge", response_model=MfaImageChallengeResponse)
async def request_image_challenge_from_mfa(request: MfaImageChallengeRequest):
    """
    Exchange a valid MFA challenge token for an image challenge token.
    Allows users to choose image authentication as an alternative MFA path.
    """
    challenge = db.verify_mfa_challenge(request.mfa_challenge_token)
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA challenge invalid or expired",
        )

    user_id = challenge.get("user_id")
    user = db.get_user_by_id(user_id)
    if not user or user.account_status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    image_challenge_token = db.create_image_challenge(
        user_id,
        device_fingerprint_hash=challenge.get("device_fingerprint_hash"),
    )
    return MfaImageChallengeResponse(image_challenge_token=image_challenge_token)


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

        user = db.get_user_by_id(user_id)
        if not user or not user.totp_secret_encrypted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TOTP is not configured for this account",
            )

        secret = decrypt_totp_secret(user.totp_secret_encrypted)
        if not verify_totp_code(secret, request.totp_code):
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

    # Check whether this login context is suspicious (unrecognised device)
    suspicious = db.is_suspicious_context(user_id, challenge.get("device_fingerprint_hash"))
    if suspicious:
        image_challenge_token = db.create_image_challenge(
            user_id,
            device_fingerprint_hash=challenge.get("device_fingerprint_hash"),
        )
        return MfaLoginVerifyResponse(
            access_token=None,
            token_type="bearer",
            user_id=user_id,
            requires_image_auth=True,
            image_challenge_token=image_challenge_token,
        )

    return MfaLoginVerifyResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user_id,
    )

# ============ GET CURRENT USER ============


@router.post("/login/image/verify", response_model=ImageVerifyResponse)
async def verify_login_image(request: ImageVerifyRequest):
    """
    Final authentication step for suspicious logins.
    Verifies the SHA-256 hash of the secret embedded in the user's registered image.
    On success, issues a full session JWT and marks the context as trusted.
    """
    challenge = db.verify_image_challenge(request.image_challenge_token)
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Image challenge invalid or expired",
        )

    user_id = challenge.get("user_id")
    user = db.get_user_by_id(user_id)
    if not user or user.account_status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    stored_hash = user.auth_image_id or ""
    if not stored_hash or stored_hash == "img_001":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Image authentication is not configured for this account",
        )

    if not db.verify_image_hash(stored_hash, request.auth_image_hash):
        db.write_audit_event(
            event_type="image_auth_failed",
            user_id=user_id,
            metadata={"reason": "hash_mismatch"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Image authentication failed",
        )

    access_token = db.create_session(user_id)
    
    # Mark device as trusted for 30 days to avoid repeated image auth
    device_fingerprint_hash = challenge.get("device_fingerprint_hash")
    if device_fingerprint_hash:
        db.trust_context(user_id, device_fingerprint_hash, ttl_days=30)
    
    db.write_audit_event(
        event_type="image_auth_success",
        user_id=user_id,
        metadata={"device_fingerprint_hash": device_fingerprint_hash},
    )
    return ImageVerifyResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user_id,
    )


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


@router.post("/delete-account", response_model=DeleteAccountResponse)
async def delete_account(
    request: DeleteAccountRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    now = int(time.time())
    token = credentials.credentials

    user_id = db.get_user_from_token(token)
    if not user_id:
        subject = _decode_token_subject(token)
        if subject and not db.get_user_by_id(subject):
            return DeleteAccountResponse(status="already_deleted", deleted_at=now)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.get_user_by_id(user_id)
    if not user:
        return DeleteAccountResponse(status="already_deleted", deleted_at=now)

    if request.email_lookup != user.email_lookup:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Re-authentication failed",
        )

    if not db.verify_auth_verifier(request.auth_verifier, user.verifier_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Re-authentication failed",
        )

    method = request.method.strip().lower()
    if not user.mfa_enabled or method not in user.mfa_methods:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA confirmation is required for account deletion",
        )

    if method == "totp":
        if not request.totp_code or not re.fullmatch(r"\d{6}", request.totp_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid 6-digit TOTP code is required",
            )
        if not user.totp_secret_encrypted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TOTP is not configured for this account",
            )

        secret = decrypt_totp_secret(user.totp_secret_encrypted)
        if not verify_totp_code(secret, request.totp_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MFA code",
            )

    if method == "biometric":
        if not request.device_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="device_id is required for biometric confirmation",
            )

        has_device = any(
            device.device_id == request.device_id for device in user.biometric_devices
        )
        if not has_device:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This device is not registered for biometric MFA",
            )

    deleted = db.delete_user_account(user_id)

    db.write_audit_event(
        event_type="account_deleted",
        user_id=user_id,
        metadata={
            "method": method,
            "deleted": deleted,
        },
    )

    return DeleteAccountResponse(
        status="deleted" if deleted else "already_deleted",
        deleted_at=now,
    )

# ============ TRUSTED DEVICE MANAGEMENT ============

@router.get("/devices/trusted")
async def list_trusted_devices(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    List all trusted devices for the current user.
    Authenticated endpoint — requires Bearer token.
    """
    subject = _decode_token_subject(credentials.credentials)
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.get_user_by_id(subject)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    trusted_contexts = user.trusted_contexts or []
    now = int(time.time())
    
    devices = []
    for ctx in trusted_contexts:
        exp = ctx.get("exp", 0)
        if exp > now:  # Only return non-expired devices
            devices.append({
                "device_fingerprint": ctx.get("fp"),
                "enrolled_at": ctx.get("iat"),
                "expires_at": exp,
                "days_until_expiry": max(0, (exp - now) // 86400),
            })
    
    return {
        "user_id": subject,
        "total_trusted_devices": len(devices),
        "devices": devices,
    }


@router.delete("/devices/trusted/{device_fingerprint}")
async def revoke_trusted_device(
    device_fingerprint: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Revoke a specific trusted device by its fingerprint.
    Removes the device from user's trusted context list.
    Authenticated endpoint — requires Bearer token.
    """
    subject = _decode_token_subject(credentials.credentials)
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.get_user_by_id(subject)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    trusted_contexts = user.trusted_contexts or []
    
    # Filter out the device to revoke
    updated_contexts = [
        ctx for ctx in trusted_contexts
        if ctx.get("fp") != device_fingerprint
    ]
    
    if len(updated_contexts) == len(trusted_contexts):
        # Device not found
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device fingerprint not found in trusted devices",
        )
    
    # Update the user record
    db.update_trusted_contexts(subject, updated_contexts)
    
    db.write_audit_event(
        event_type="device_revoked",
        user_id=subject,
        metadata={
            "device_fingerprint": device_fingerprint,
            "remaining_devices": len(updated_contexts),
        },
    )
    
    return {
        "status": "revoked",
        "device_fingerprint": device_fingerprint,
        "remaining_trusted_devices": len(updated_contexts),
    }

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