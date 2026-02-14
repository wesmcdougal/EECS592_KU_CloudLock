# app/models/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional

# ============ AUTH MODELS ============

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    auth_image_id: str

class RegisterResponse(BaseModel):
    message: str
    user_id: str
    email: str
    created_at: int
    email_verification_required: bool

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_fingerprint: str

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    user_id: str
    email: str
    requires_mfa: bool
    mfa_types: Optional[list] = None

# ============ VAULT MODELS ============

class SaveVaultRequest(BaseModel):
    encrypted_vault: str  # Base64 encoded

class SaveVaultResponse(BaseModel):
    status: str
    timestamp: int

class VaultResponse(BaseModel):
    encrypted_vault: str
    last_modified: int

# ============ HEALTH CHECK ============

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

class UserInDB(BaseModel):
    user_id: str
    email: EmailStr
    password_hash: str
    auth_image_id: Optional[str] = None
    created_at: int
    last_login: Optional[int] = None
    account_status: str = "active"
    failed_login_attempts: int = 0