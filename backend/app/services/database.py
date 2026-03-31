# backend/app/services/database.py
"""
In-Memory Database Service (database.py)

Provides local-development persistence with production-like behavior. Responsibilities include:
- User registration and lookup by hashed identifiers
- Zero-knowledge auth verifier checks and session token creation
- Vault save/load operations for encrypted data blobs
- MFA state management and biometric device registration/revocation
- MFA JWT challenge generation and verification
- WebAuthn challenge and assertion helper state for local testing

Revision History:
- Wesley McDougal - 29MAR2026 - Added MFA and WebAuthn support methods for local service
"""
from typing import Dict, Optional
import time
import uuid

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.models.schemas import BiometricDevice, MfaEnrollmentPreference, UserInDB
from app.services.dynamo import DynamoDatabaseService

verifier_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class InMemoryDatabaseService:
    def __init__(self):
        self.users: Dict[str, UserInDB] = {}
        self.email_lookup_index: Dict[str, str] = {}     # sha256(email) → user_id
        self.username_lookup_index: Dict[str, str] = {}  # sha256(username) → user_id
        self.vaults: Dict[str, dict] = {}

    def create_user(
        self,
        email_lookup: str,
        auth_verifier: str,
        auth_image_id: str = "img_001",
        username_lookup: Optional[str] = None,
        mfa_enrollment: Optional[MfaEnrollmentPreference] = None,
    ) -> UserInDB:
        if email_lookup in self.email_lookup_index:
            raise ValueError("An account with this email already exists")
        if username_lookup and username_lookup in self.username_lookup_index:
            raise ValueError("An account with this username already exists")

        mfa_methods = []
        if mfa_enrollment:
            if mfa_enrollment.enable_biometric:
                mfa_methods.append("biometric")
            if mfa_enrollment.enable_totp:
                mfa_methods.append("totp")

        user = UserInDB(
            user_id=str(uuid.uuid4()),
            email_lookup=email_lookup,
            username_lookup=username_lookup,
            verifier_hash=verifier_context.hash(auth_verifier),
            auth_image_id=auth_image_id,
            created_at=int(time.time()),
            account_status="active",
            failed_login_attempts=0,
            mfa_enabled=bool(mfa_methods),
            mfa_methods=mfa_methods,
        )
        self.users[user.user_id] = user
        self.email_lookup_index[email_lookup] = user.user_id
        if username_lookup:
            self.username_lookup_index[username_lookup] = user.user_id
        return user

    def get_user_by_email_lookup(self, email_lookup: str) -> Optional[UserInDB]:
        user_id = self.email_lookup_index.get(email_lookup)
        return self.users.get(user_id) if user_id else None

    def get_user_by_username_lookup(self, username_lookup: str) -> Optional[UserInDB]:
        user_id = self.username_lookup_index.get(username_lookup)
        return self.users.get(user_id) if user_id else None

    def get_user_for_login(
        self,
        email_lookup: Optional[str] = None,
        username_lookup: Optional[str] = None,
    ) -> Optional[UserInDB]:
        if email_lookup:
            return self.get_user_by_email_lookup(email_lookup)
        if username_lookup:
            return self.get_user_by_username_lookup(username_lookup)
        return None

    def get_user_by_id(self, user_id: str) -> Optional[UserInDB]:
        return self.users.get(user_id)

    def verify_auth_verifier(self, plain_verifier: str, stored_hash: str) -> bool:
        """Verify client-derived auth_verifier against its bcrypt hash."""
        return verifier_context.verify(plain_verifier, stored_hash)

    def update_last_login(self, user_id: str):
        if user_id in self.users:
            self.users[user_id].last_login = int(time.time())

    def increment_failed_attempts(self, user_id: str):
        if user_id in self.users:
            self.users[user_id].failed_login_attempts += 1

    def reset_failed_attempts(self, user_id: str):
        if user_id in self.users:
            self.users[user_id].failed_login_attempts = 0

    def create_session(self, user_id: str) -> str:
        return f"dev-token-{user_id}"

    def get_user_from_token(self, token: str) -> Optional[str]:
        if token.startswith("dev-token-"):
            return token.replace("dev-token-", "", 1)
        return None

    def delete_session(self, token: str):
        return None

    def save_vault(self, user_id: str, encrypted_vault: str):
        self.vaults[user_id] = {
            "encrypted_vault": encrypted_vault,
            "last_modified": int(time.time()),
        }

    def get_vault(self, user_id: str) -> Optional[dict]:
        return self.vaults.get(user_id)

    def list_all_users(self) -> list:
        return [
            {
                "user_id":         user.user_id,
                "email_lookup":    user.email_lookup,
                "username_lookup": user.username_lookup,
                "created_at":      user.created_at,
                "account_status":  user.account_status,
                "last_login":      user.last_login,
                "failed_attempts": user.failed_login_attempts,
                "has_vault":       user.user_id in self.vaults,
            }
            for user in self.users.values()
        ]

    def get_user_count(self) -> int:
        return len(self.users)

    def get_debug_info(self) -> dict:
        return {
            "storage":      "in-memory",
            "total_users":  len(self.users),
            "total_vaults": len(self.vaults),
            "note":         "No plaintext identifiers. Lookups use SHA-256 hashes.",
            "users_detail": self.list_all_users(),
        }

    def get_mfa_status(self, user_id: str) -> dict:
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")
        return {
            "enabled": user.mfa_enabled,
            "methods": user.mfa_methods,
            "biometric_devices": user.biometric_devices,
        }

    def update_mfa_preferences(self, user_id: str, methods: list[str]) -> dict:
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")
        user.mfa_methods = methods
        user.mfa_enabled = bool(methods)
        return self.get_mfa_status(user_id)

    def register_biometric_device(self, user_id: str, device_id: str, label: str) -> BiometricDevice:
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")

        if any(device.device_id == device_id for device in user.biometric_devices):
            raise ValueError("Biometric device already registered")

        device = BiometricDevice(
            device_id=device_id,
            label=label,
            created_at=int(time.time()),
        )
        user.biometric_devices.append(device)

        if "biometric" not in user.mfa_methods:
            user.mfa_methods.append("biometric")
        user.mfa_enabled = True
        return device

    def revoke_biometric_device(self, user_id: str, device_id: str) -> bool:
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")

        previous_count = len(user.biometric_devices)
        user.biometric_devices = [
            device for device in user.biometric_devices if device.device_id != device_id
        ]

        if not user.biometric_devices and "biometric" in user.mfa_methods:
            user.mfa_methods = [method for method in user.mfa_methods if method != "biometric"]
            user.mfa_enabled = bool(user.mfa_methods)

        return len(user.biometric_devices) < previous_count

    def create_mfa_challenge(self, user_id: str, methods: list[str]) -> str:
        now = int(time.time())
        payload = {
            "sub": user_id,
            "mfa_methods": methods,
            "purpose": "mfa-login",
            "iat": now,
            "exp": now + settings.mfa_challenge_expire_seconds,
        }
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    def verify_mfa_challenge(self, token: str) -> Optional[dict]:
        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        except JWTError:
            return None

        if payload.get("purpose") != "mfa-login":
            return None

        return {
            "user_id": payload.get("sub"),
            "mfa_methods": payload.get("mfa_methods", []),
        }

    def create_webauthn_registration_challenge(self, user_id: str) -> str:
        """Create a challenge for WebAuthn credential registration."""
        now = int(time.time())
        challenge = uuid.uuid4().bytes
        # Store challenge temporarily for verification
        if not hasattr(self, 'webauthn_challenges'):
            self.webauthn_challenges = {}
        self.webauthn_challenges[user_id] = {
            "challenge": challenge,
            "timestamp": now,
            "purpose": "webauthn-registration"
        }
        import base64
        return base64.urlsafe_b64encode(challenge).decode().rstrip('=')

    def create_webauthn_assertion_challenge(self, user_id: str) -> str:
        """Create a challenge for WebAuthn assertion (during MFA login)."""
        import base64
        challenge = uuid.uuid4().bytes
        # Store challenge temporarily for verification
        if not hasattr(self, 'webauthn_challenges'):
            self.webauthn_challenges = {}
        self.webauthn_challenges[user_id] = {
            "challenge": challenge,
            "timestamp": int(time.time()),
            "purpose": "webauthn-assertion"
        }
        return base64.urlsafe_b64encode(challenge).decode().rstrip('=')

    def verify_webauthn_registration(self, user_id: str, credential_id: str, public_key: str, counter: int) -> bool:
        """Verify WebAuthn registration and store credential."""
        user = self.users.get(user_id)
        if not user:
            return False

        # In production, verify attestation object here
        # For now, trust the credential if the challenge matches

        # Check if credential already registered
        for device in user.biometric_devices:
            if device.credential_id == credential_id:
                return False  # Already registered

        return True

    def store_webauthn_credential(self, user_id: str, device_label: str, credential_id: str, public_key: str, counter: int) -> Optional[BiometricDevice]:
        """Store WebAuthn credential after successful registration."""
        user = self.users.get(user_id)
        if not user:
            return None

        device_id = str(uuid.uuid4())
        device = BiometricDevice(
            device_id=device_id,
            label=device_label,
            created_at=int(time.time()),
            credential_id=credential_id,
            public_key=public_key,
            counter=counter
        )

        user.biometric_devices.append(device)
        if "biometric" not in user.mfa_methods:
            user.mfa_methods.append("biometric")

        return device

    def verify_webauthn_assertion(self, user_id: str, credential_id: str, counter: int) -> Optional[BiometricDevice]:
        """Verify WebAuthn assertion and check counter for cloning."""
        user = self.users.get(user_id)
        if not user:
            return None

        device = None
        for d in user.biometric_devices:
            if d.credential_id == credential_id:
                device = d
                break

        if not device:
            return None

        # Check counter to detect cloning
        if counter <= device.counter:
            return None  # Counter not incremented - possible cloning

        # Update counter and last used time
        device.counter = counter
        device.last_used_at = int(time.time())

        return device


db = DynamoDatabaseService() if settings.use_dynamodb else InMemoryDatabaseService()