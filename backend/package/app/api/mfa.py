"""
MFA API Router (mfa.py)

Serves MFA management and WebAuthn endpoints. Responsibilities include:
- MFA status retrieval and method preference updates
- Biometric device registration and revocation
- WebAuthn registration challenge generation and credential submission
- WebAuthn MFA assertion challenge generation and verification

Revision History:
- Wesley McDougal - 29MAR2026 - Added MFA management and WebAuthn API routes
"""

import base64
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from webauthn import (
    base64url_to_bytes,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)

from app.config import settings
from app.models.schemas import (
    MfaStatusResponse,
    RegisterBiometricDeviceRequest,
    TotpSetupStartRequest,
    TotpSetupStartResponse,
    TotpSetupVerifyRequest,
    TotpSetupVerifyResponse,
    UpdateMfaPreferencesRequest,
    WebAuthnRegistrationChallenge,
    WebAuthnRegistrationResponse,
    WebAuthnMfaChallengeResponse,
    WebAuthnMfaAssertionRequest,
)
from app.services.database import db
from app.services.totp import (
    TOTP_ISSUER,
    build_totp_uri,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_totp_secret,
    verify_totp_code,
)

router = APIRouter()
security = HTTPBearer()


class UserIdRequest(BaseModel):
    user_id: str


class WebAuthnMfaChallengeRequest(BaseModel):
    mfa_challenge_token: str


def _get_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    token = credentials.credentials
    user_id = db.get_user_from_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user_id


@router.get("/status", response_model=MfaStatusResponse)
async def get_mfa_status(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user_id = _get_user_id(credentials)
    try:
        return db.get_mfa_status(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.put("/preferences", response_model=MfaStatusResponse)
async def update_mfa_preferences(
    request: UpdateMfaPreferencesRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user_id = _get_user_id(credentials)
    methods = []
    if request.enable_biometric:
        methods.append("biometric")
    if request.enable_totp:
        methods.append("totp")

    try:
        return db.update_mfa_preferences(user_id, methods)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/devices/biometric")
async def register_biometric_device(
    request: RegisterBiometricDeviceRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user_id = _get_user_id(credentials)
    try:
        device = db.register_biometric_device(
            user_id=user_id,
            device_id=request.device_id,
            label=request.label,
        )
        return {
            "status": "registered",
            "device": device,
        }
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.delete("/devices/biometric/{device_id}")
async def revoke_biometric_device(
    device_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user_id = _get_user_id(credentials)
    try:
        removed = db.revoke_biometric_device(user_id, device_id)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Biometric device not found",
            )
        return {"status": "revoked", "device_id": device_id}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ============ WebAuthn Endpoints ============

WEBAUTHN_CHALLENGE_TTL_SECONDS = 600
TOTP_SETUP_TTL_SECONDS = 600


def _urlsafe_b64encode_no_pad(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _get_expected_origins() -> list[str]:
    return [origin.strip() for origin in settings.webauthn_expected_origins.split(",") if origin.strip()]


def _build_webauthn_challenge_token(*, purpose: str, user_id: str, challenge: str, mfa_challenge_token: str | None = None) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": user_id,
        "purpose": purpose,
        "challenge": challenge,
        "iat": now,
        "exp": now + WEBAUTHN_CHALLENGE_TTL_SECONDS,
    }
    if mfa_challenge_token:
        payload["mfa"] = mfa_challenge_token
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _decode_webauthn_challenge_token(token: str, expected_purpose: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("purpose") != expected_purpose:
        return None
    if not payload.get("sub") or not payload.get("challenge"):
        return None
    return payload


def _build_totp_setup_token(user_id: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "purpose": "totp-setup",
        "iat": now,
        "exp": now + TOTP_SETUP_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _decode_totp_setup_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("purpose") != "totp-setup":
        return None
    if not payload.get("sub"):
        return None
    return payload


@router.post("/totp/setup/start", response_model=TotpSetupStartResponse)
async def start_totp_setup(request: TotpSetupStartRequest):
    user = db.get_user_by_id(request.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    secret = generate_totp_secret()
    db.begin_totp_setup(request.user_id, encrypt_totp_secret(secret))

    account_name = (request.account_name or "").strip() or f"user-{request.user_id[:8]}"
    return TotpSetupStartResponse(
        setup_token=_build_totp_setup_token(request.user_id),
        manual_entry_key=secret,
        otpauth_uri=build_totp_uri(secret, account_name),
        issuer=TOTP_ISSUER,
    )


@router.post("/totp/setup/verify", response_model=TotpSetupVerifyResponse)
async def verify_totp_setup(request: TotpSetupVerifyRequest):
    payload = _decode_totp_setup_token(request.setup_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired setup token")

    if len(request.totp_code.strip()) != 6 or not request.totp_code.strip().isdigit():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A valid 6-digit TOTP code is required")

    user_id = str(payload["sub"])
    user = db.get_user_by_id(user_id)
    if not user or not user.totp_pending_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending TOTP setup found")

    secret = decrypt_totp_secret(user.totp_pending_secret_encrypted)
    if not verify_totp_code(secret, request.totp_code.strip()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code")

    db.confirm_totp_setup(user_id)
    status_snapshot = db.get_mfa_status(user_id)
    return TotpSetupVerifyResponse(
        status="enabled",
        methods=status_snapshot.get("methods", []),
        enabled=status_snapshot.get("enabled", False),
    )


@router.post("/webauthn/registration-challenge")
async def get_webauthn_registration_challenge(request: UserIdRequest):
    """Get challenge for WebAuthn credential registration during signup."""
    challenge = db.create_webauthn_registration_challenge(request.user_id)
    challenge_token = _build_webauthn_challenge_token(
        purpose="webauthn-registration",
        user_id=request.user_id,
        challenge=challenge,
    )

    return WebAuthnRegistrationChallenge(
        challenge=challenge,
        challenge_token=challenge_token,
        user_id=request.user_id,
        user_name=request.user_id,
        rp_id=settings.webauthn_rp_id,
        rp_name="CloudLock",
    )


@router.post("/webauthn/registration")
async def register_webauthn_credential(request: WebAuthnRegistrationResponse):
    """Submit WebAuthn attestation during signup."""
    token_payload = _decode_webauthn_challenge_token(
        request.challenge_token,
        "webauthn-registration",
    )
    if not token_payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired challenge")

    user_id = str(token_payload["sub"])
    expected_challenge = base64url_to_bytes(str(token_payload["challenge"]))

    credential = {
        "id": request.credential_id,
        "rawId": request.raw_id,
        "type": "public-key",
        "response": {
            "clientDataJSON": request.client_data_json,
            "attestationObject": request.attestation_object,
        },
    }

    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=_get_expected_origins(),
            require_user_verification=True,
        )
    except InvalidRegistrationResponse:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credential")

    device = db.store_webauthn_credential(
        user_id=user_id,
        device_label=request.device_label,
        credential_id=_urlsafe_b64encode_no_pad(verification.credential_id),
        public_key=_urlsafe_b64encode_no_pad(verification.credential_public_key),
        counter=verification.sign_count,
    )
    if not device:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to store credential")

    return {
        "status": "registered",
        "device_id": device.device_id,
        "label": device.label,
    }


@router.post("/webauthn/mfa-challenge")
async def get_webauthn_mfa_challenge(request: WebAuthnMfaChallengeRequest):
    """Get challenge for WebAuthn assertion during MFA login."""
    challenge_data = db.verify_mfa_challenge(request.mfa_challenge_token)
    if not challenge_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user_id = challenge_data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    challenge = db.create_webauthn_assertion_challenge(user_id)
    user = db.get_user_by_id(user_id)
    allow_credential_ids = [
        device.credential_id for device in (user.biometric_devices if user else []) if device.credential_id
    ]

    webauthn_challenge_token = _build_webauthn_challenge_token(
        purpose="webauthn-mfa",
        user_id=user_id,
        challenge=challenge,
        mfa_challenge_token=request.mfa_challenge_token,
    )

    return WebAuthnMfaChallengeResponse(
        challenge=challenge,
        webauthn_challenge_token=webauthn_challenge_token,
        rp_id=settings.webauthn_rp_id,
        allow_credential_ids=allow_credential_ids,
    )


@router.post("/webauthn/mfa-verify")
async def verify_webauthn_mfa_assertion(request: WebAuthnMfaAssertionRequest):
    """Verify WebAuthn assertion during MFA login."""
    webauthn_payload = _decode_webauthn_challenge_token(
        request.webauthn_challenge_token,
        "webauthn-mfa",
    )
    if not webauthn_payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    mfa_token = webauthn_payload.get("mfa")
    challenge_data = db.verify_mfa_challenge(mfa_token) if mfa_token else None
    if not challenge_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user_id = str(webauthn_payload["sub"])
    expected_challenge = base64url_to_bytes(str(webauthn_payload["challenge"]))

    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    matching_device = next(
        (device for device in user.biometric_devices if device.credential_id == request.credential_id),
        None,
    )
    if not matching_device or not matching_device.public_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    credential = {
        "id": request.credential_id,
        "rawId": request.raw_id,
        "type": "public-key",
        "response": {
            "clientDataJSON": request.client_data_json,
            "authenticatorData": request.authenticator_data,
            "signature": request.signature,
        },
    }

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=_get_expected_origins(),
            credential_public_key=base64url_to_bytes(matching_device.public_key),
            credential_current_sign_count=matching_device.counter,
            require_user_verification=True,
        )
    except InvalidAuthenticationResponse:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    updated_device = db.verify_webauthn_assertion(
        user_id=user_id,
        credential_id=request.credential_id,
        counter=verification.new_sign_count,
    )
    if not updated_device:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    suspicious = db.is_suspicious_context(
        user_id,
        challenge_data.get("device_fingerprint_hash"),
    )
    if suspicious:
        image_challenge_token = db.create_image_challenge(user_id)
        return {
            "access_token": None,
            "token_type": "bearer",
            "user_id": user_id,
            "requires_image_auth": True,
            "image_challenge_token": image_challenge_token,
        }

    access_token = db.create_session(user_id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user_id,
        "requires_image_auth": False,
        "image_challenge_token": None,
    }
