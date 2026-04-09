"""
Shared Data Models (schemas.py)

Defines request/response and persistence models used across the backend. Responsibilities include:
- Registration/login payload contracts
- MFA and biometric enrollment/verification model definitions
- WebAuthn challenge and assertion structures
- Vault API request/response schema contracts
- Internal user record model used by storage services

Revision History:
- Wesley McDougal - 29MAR2026 - Added MFA and WebAuthn schema models
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional


class MfaEnrollmentPreference(BaseModel):
    enable_biometric: bool = False
    enable_totp: bool = False
    device_label: Optional[str] = None


class BiometricDevice(BaseModel):
    device_id: str
    label: str
    created_at: int
    last_used_at: Optional[int] = None
    credential_id: Optional[str] = None  # base64url WebAuthn credential ID
    public_key: Optional[str] = None     # base64url COSE public key
    counter: int = 0                     # WebAuthn counter for cloning detection

# ============ AUTH MODELS ============

class RegisterRequest(BaseModel):
    """
    Zero-knowledge registration.
    The server never receives plaintext email, username, or password.
    """
    email_lookup:    str           # SHA-256(email_lower)   — used to find the record
    username_lookup: Optional[str] = None  # SHA-256(username_lower)
    auth_verifier:   str           # PBKDF2(password, email+":auth") exported as base64
    auth_image_id:   str = "img_001"
    mfa_enrollment: Optional[MfaEnrollmentPreference] = None
    proposed_user_id: Optional[str] = None  # Client-generated UUID for pre-registration WebAuthn

class RegisterResponse(BaseModel):
    message:  str
    user_id:  str
    created_at: int
    email_verification_required: bool = False

class LoginRequest(BaseModel):
    """
    Zero-knowledge login.
    Server verifies bcrypt(stored_verifier_hash, auth_verifier) without knowing the password.
    """
    email_lookup:    Optional[str] = None
    username_lookup: Optional[str] = None
    auth_verifier:   str
    device_fingerprint: Optional[str] = None

    @model_validator(mode="after")
    def validate_identifier(self):
        if not self.email_lookup and not self.username_lookup:
            raise ValueError("Either email_lookup or username_lookup is required")
        return self

class LoginResponse(BaseModel):
    access_token:  Optional[str] = None
    token_type:    str = "bearer"
    refresh_token: Optional[str] = None
    user_id:       str
    requires_mfa:  bool
    mfa_types:     Optional[list] = None
    mfa_challenge_token: Optional[str] = None
    requires_image_auth: bool = False
    image_challenge_token: Optional[str] = None


class MfaLoginVerifyRequest(BaseModel):
    mfa_challenge_token: str
    method: str
    totp_code: Optional[str] = None
    device_id: Optional[str] = None


class MfaLoginVerifyResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    user_id: str
    requires_image_auth: bool = False
    image_challenge_token: Optional[str] = None


class ImageVerifyRequest(BaseModel):
    image_challenge_token: str
    auth_image_hash: str


class ImageVerifyResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str


class DeleteAccountRequest(BaseModel):
    email_lookup: str
    auth_verifier: str
    method: str
    totp_code: Optional[str] = None
    device_id: Optional[str] = None


class DeleteAccountResponse(BaseModel):
    status: str
    deleted_at: int


class MfaStatusResponse(BaseModel):
    enabled: bool
    methods: list[str] = Field(default_factory=list)
    biometric_devices: list[BiometricDevice] = Field(default_factory=list)
    totp_enrolled: bool = False


class UpdateMfaPreferencesRequest(BaseModel):
    enable_biometric: bool = False
    enable_totp: bool = False


class RegisterBiometricDeviceRequest(BaseModel):
    device_id: str
    label: str


class TotpSetupStartRequest(BaseModel):
    user_id: str
    account_name: Optional[str] = None


class TotpSetupStartResponse(BaseModel):
    setup_token: str
    manual_entry_key: str
    otpauth_uri: str
    issuer: str = "CloudLock"


class TotpSetupVerifyRequest(BaseModel):
    setup_token: str
    totp_code: str


class TotpSetupVerifyResponse(BaseModel):
    status: str
    methods: list[str] = Field(default_factory=list)
    enabled: bool = False

# ============ WEBAUTHN MODELS ============

class WebAuthnCredential(BaseModel):
    """Stores WebAuthn credential public key and metadata."""
    device_id: str
    label: str
    credential_id: str  # base64url encoded
    public_key: str     # base64url encoded COSE public key
    counter: int
    created_at: int
    last_used_at: Optional[int] = None

class WebAuthnRegistrationChallenge(BaseModel):
    """Response with challenge for WebAuthn credential creation."""
    challenge: str      # base64url encoded
    challenge_token: str
    user_id: str
    user_name: str
    rp_id: str
    rp_name: str
    timeout: int = 60000
    attestation: str = "direct"

class WebAuthnRegistrationResponse(BaseModel):
    """Client submits attestation after credential creation."""
    challenge_token: str
    device_label: str
    credential_id: str
    raw_id: str
    client_data_json: str    # base64url
    attestation_object: str  # base64url

class WebAuthnMfaChallengeResponse(BaseModel):
    """Challenge for WebAuthn assertion during MFA login."""
    challenge: str           # base64url
    webauthn_challenge_token: str
    rp_id: str
    allow_credential_ids: list[str] = Field(default_factory=list)
    timeout: int = 60000
    user_verification: str = "preferred"

class WebAuthnMfaAssertionRequest(BaseModel):
    """Client submits assertion after WebAuthn verification during MFA."""
    webauthn_challenge_token: str
    credential_id: str
    raw_id: str
    client_data_json: str    # base64url
    authenticator_data: str  # base64url
    signature: str           # base64url

# ============ VAULT MODELS ============

class SaveVaultRequest(BaseModel):
    encrypted_vault: str  # client-side encrypted blob

class SaveVaultResponse(BaseModel):
    status:    str
    timestamp: int

class VaultResponse(BaseModel):
    encrypted_vault: str
    last_modified:   int

# ============ HEALTH CHECK ============

class HealthResponse(BaseModel):
    status:  str
    service: str
    version: str

class UserInDB(BaseModel):
    """Internal model. All identity is now stored as hashes."""
    user_id:                str
    email_lookup:           str            # SHA-256(email_lower)
    username_lookup:        Optional[str] = None
    verifier_hash:          str            # bcrypt(auth_verifier)
    auth_image_id:          Optional[str] = None
    created_at:             int
    last_login:             Optional[int] = None
    account_status:         str = "active"
    failed_login_attempts:  int = 0
    mfa_enabled:            bool = False
    mfa_methods:            list[str] = Field(default_factory=list)
    biometric_devices:      list[BiometricDevice] = Field(default_factory=list)
    totp_secret_encrypted: Optional[str] = None
    totp_pending_secret_encrypted: Optional[str] = None
    session_version:        int = 0
    trusted_contexts:       list = Field(default_factory=list)