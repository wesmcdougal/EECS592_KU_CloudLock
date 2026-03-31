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

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.models.schemas import (
    MfaStatusResponse,
    RegisterBiometricDeviceRequest,
    UpdateMfaPreferencesRequest,
    WebAuthnRegistrationChallenge,
    WebAuthnRegistrationResponse,
    WebAuthnMfaChallengeResponse,
    WebAuthnMfaAssertionRequest,
)
from app.services.database import db

router = APIRouter()
security = HTTPBearer()


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

@router.post("/webauthn/registration-challenge")
async def get_webauthn_registration_challenge(user_id: str):
    """Get challenge for WebAuthn credential registration during signup."""
    try:
        challenge = db.create_webauthn_registration_challenge(user_id)
        return WebAuthnRegistrationChallenge(
            challenge=challenge,
            user_id=user_id,
            user_name=user_id,  # Use user_id as username for now
            rp_id="127.0.0.1",  # Relying Party ID - should match domain
            rp_name="CloudLock",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate challenge: {str(exc)}",
        )


@router.post("/webauthn/registration")
async def register_webauthn_credential(
    request: WebAuthnRegistrationResponse,
    user_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Submit WebAuthn attestation during signup."""
    user_id = _get_user_id(credentials)
    
    try:
        # In production, parse and verify attestation object
        # For now, accept if structure looks valid
        if not request.client_data_json or not request.attestation_object:
            raise ValueError("Missing attestation data")

        # Generate a credential ID from the attestation
        import base64
        import hashlib
        cred_id = base64.urlsafe_b64encode(
            hashlib.sha256(request.attestation_object.encode()).digest()
        ).decode().rstrip('=')

        # Verify and store credential
        verified = db.verify_webauthn_registration(user_id, cred_id, request.attestation_object, 0)
        if not verified:
            raise ValueError("Attestation verification failed")

        device = db.store_webauthn_credential(
            user_id=user_id,
            device_label=request.device_label,
            credential_id=cred_id,
            public_key=request.attestation_object,
            counter=0,
        )

        if not device:
            raise ValueError("Failed to store credential")

        return {
            "status": "registered",
            "device_id": device.device_id,
            "label": device.label,
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(exc)}",
        )


@router.post("/webauthn/mfa-challenge")
async def get_webauthn_mfa_challenge(user_id: str):
    """Get challenge for WebAuthn assertion during MFA login."""
    try:
        challenge = db.create_webauthn_assertion_challenge(user_id)
        # Create MFA challenge token
        mfa_token = db.create_mfa_challenge(user_id, ["biometric"])
        
        return WebAuthnMfaChallengeResponse(
            challenge=challenge,
            mfa_challenge_token=mfa_token,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate challenge: {str(exc)}",
        )


@router.post("/webauthn/mfa-verify")
async def verify_webauthn_mfa_assertion(request: WebAuthnMfaAssertionRequest):
    """Verify WebAuthn assertion during MFA login."""
    try:
        # Verify MFA challenge token
        challenge_data = db.verify_mfa_challenge(request.mfa_challenge_token)
        if not challenge_data:
            raise ValueError("Invalid or expired MFA challenge")

        user_id = challenge_data.get("user_id")

        # In production, parse and verify assertion object
        # For now, extract credential ID from client data
        import base64
        import hashlib
        
        cred_id = base64.urlsafe_b64encode(
            hashlib.sha256(request.authenticator_data.encode()).digest()
        ).decode().rstrip('=')

        # Extract counter from authenticator data (bytes 33-36)
        try:
            counter_bytes = base64.urlsafe_b64decode(request.authenticator_data + '==')
            counter = int.from_bytes(counter_bytes[33:37], byteorder='big')
        except:
            counter = 0

        # Verify assertion and check counter
        device = db.verify_webauthn_assertion(user_id, cred_id, counter)
        if not device:
            raise ValueError("Assertion verification failed or counter mismatch")

        # Issue access token
        access_token = db.create_access_token(user_id)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": user_id,
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assertion verification failed: {str(exc)}",
        )
