# app/models/schemas.py
from pydantic import BaseModel, model_validator
from typing import Optional

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
    access_token:  str
    token_type:    str = "bearer"
    refresh_token: Optional[str] = None
    user_id:       str
    requires_mfa:  bool
    mfa_types:     Optional[list] = None

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