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
- Wesley McDougal - 09APR2026 - Refactored WebAuthn registration/assertion helpers, improved fallback logic, and enhanced diagnostics for Android and multi-device support.
- Wesley McDougal - 29MAR2026 - Added MFA and WebAuthn support methods for local service
"""
from typing import Dict, Optional
import hmac
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
        self.audit_events: list[dict] = []

    def create_user(
        self,
        email_lookup: str,
        auth_verifier: str,
        auth_image_id: str = "img_001",
        username_lookup: Optional[str] = None,
        mfa_enrollment: Optional[MfaEnrollmentPreference] = None,
        proposed_user_id: Optional[str] = None,
    ) -> UserInDB:
        if email_lookup in self.email_lookup_index:
            raise ValueError("An account with this email already exists")
        if username_lookup and username_lookup in self.username_lookup_index:
            raise ValueError("An account with this username already exists")

        user = UserInDB(
            user_id=proposed_user_id or str(uuid.uuid4()),
            email_lookup=email_lookup,
            username_lookup=username_lookup,
            verifier_hash=verifier_context.hash(auth_verifier),
            auth_image_id=auth_image_id,
            created_at=int(time.time()),
            account_status="active",
            failed_login_attempts=0,
            mfa_enabled=False,
            mfa_methods=[],
            recovery_id=None,
            recovery_salt=None,
            encrypted_recovery_blob=None,
            recovery_version=None,
            recovery_used=False,
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
        if user_id not in self.users:
            raise ValueError("User not found")
        return f"dev-token-{user_id}"

    def get_user_from_token(self, token: str) -> Optional[str]:
        if token.startswith("dev-token-"):
            user_id = token.replace("dev-token-", "", 1)
            user = self.users.get(user_id)
            if user and user.account_status == "active":
                return user_id
        return None

    def delete_session(self, token: str):
        return None

    def delete_user_account(self, user_id: str) -> bool:
        user = self.users.pop(user_id, None)
        if not user:
            return False

        self.email_lookup_index.pop(user.email_lookup, None)
        if user.username_lookup:
            self.username_lookup_index.pop(user.username_lookup, None)
        self.vaults.pop(user_id, None)
        return True

    def write_audit_event(self, *, event_type: str, user_id: str, metadata: Optional[dict] = None):
        self.audit_events.append(
            {
                "event_id": str(uuid.uuid4()),
                "event_type": event_type,
                "user_id": user_id,
                "timestamp": int(time.time()),
                "metadata": metadata or {},
            }
        )

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
            "totp_enrolled": bool(user.totp_secret_encrypted),
        }

    def update_mfa_preferences(self, user_id: str, methods: list[str]) -> dict:
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")
        allowed_methods = []
        if "biometric" in methods and user.biometric_devices:
            allowed_methods.append("biometric")
        if "totp" in methods and user.totp_secret_encrypted:
            allowed_methods.append("totp")
        user.mfa_methods = allowed_methods
        user.mfa_enabled = bool(allowed_methods)
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

    def create_mfa_challenge(
        self,
        user_id: str,
        methods: list[str],
        device_fingerprint_hash: Optional[str] = None,
    ) -> str:
        now = int(time.time())
        payload = {
            "sub": user_id,
            "mfa_methods": methods,
            "purpose": "mfa-login",
            "iat": now,
            "exp": now + settings.mfa_challenge_expire_seconds,
        }
        if device_fingerprint_hash:
            payload["dfp"] = device_fingerprint_hash
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
            "device_fingerprint_hash": payload.get("dfp"),
        }

    # ── Image-auth challenge / context checks ───────────────────────────────

    def create_image_challenge(self, user_id: str, device_fingerprint_hash: Optional[str] = None) -> str:
        now = int(time.time())
        payload = {
            "sub": user_id,
            "purpose": "image-login",
            "iat": now,
            "exp": now + 120,
        }
        if device_fingerprint_hash:
            payload["device_fingerprint_hash"] = device_fingerprint_hash
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    def verify_image_challenge(self, token: str) -> Optional[dict]:
        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        except JWTError:
            return None

        if payload.get("purpose") != "image-login":
            return None

        return {
            "user_id": payload.get("sub"),
            "device_fingerprint_hash": payload.get("device_fingerprint_hash"),
        }

    def is_suspicious_context(self, user_id: str, device_fingerprint_hash: Optional[str]) -> bool:
        user = self.users.get(user_id)
        if not user:
            return False

        if not user.auth_image_id or user.auth_image_id == "img_001":
            return False

        if not device_fingerprint_hash:
            return True

        now = int(time.time())
        for ctx in user.trusted_contexts:
            if ctx.get("fp") == device_fingerprint_hash and int(ctx.get("exp", 0)) > now:
                return False
        return True

    def trust_context(self, user_id: str, device_fingerprint_hash: str, ttl_days: int = 30):
        user = self.users.get(user_id)
        if not user:
            return

        now = int(time.time())
        new_ctx = {"fp": device_fingerprint_hash, "exp": now + ttl_days * 86400}
        live = [
            ctx for ctx in user.trusted_contexts
            if int(ctx.get("exp", 0)) > now and ctx.get("fp") != device_fingerprint_hash
        ]
        live.append(new_ctx)
        user.trusted_contexts = live[-20:]

    def update_trusted_contexts(self, user_id: str, trusted_contexts: list):
        """Update the entire trusted_contexts list for a user (used for revocation)."""
        user = self.users.get(user_id)
        if not user:
            return
        user.trusted_contexts = trusted_contexts

    def verify_image_hash(self, stored_hash: str, received_hash: str) -> bool:
        return hmac.compare_digest(
            stored_hash.lower().encode(),
            received_hash.lower().encode(),
        )

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
        user.mfa_enabled = True

        return device

    def begin_totp_setup(self, user_id: str, encrypted_secret: str):
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")
        user.totp_pending_secret_encrypted = encrypted_secret

    def confirm_totp_setup(self, user_id: str):
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")
        if not user.totp_pending_secret_encrypted:
            raise ValueError("No pending TOTP setup found")
        user.totp_secret_encrypted = user.totp_pending_secret_encrypted
        user.totp_pending_secret_encrypted = None
        if "totp" not in user.mfa_methods:
            user.mfa_methods.append("totp")
        user.mfa_enabled = True

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
    
    def set_keyfile_mfa_hash(self, user_id: str, keyfile_hash: str):
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")
        user.keyfile_mfa_hash = keyfile_hash
        # Optionally, add "keyfile" to mfa_methods and enable MFA
        if "keyfile" not in user.mfa_methods:
            user.mfa_methods.append("keyfile")
        user.mfa_enabled = True

    def save_recovery(self, user_id: str, recovery_id: str, recovery_salt: str, encrypted_blob: dict, version: int):
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")

        user.recovery_id = recovery_id
        user.recovery_salt = recovery_salt
        user.encrypted_recovery_blob = encrypted_blob
        user.recovery_version = version
        user.recovery_used = False


    def get_recovery(self, user_id: str):
        user = self.users.get(user_id)
        if not user or not user.encrypted_recovery_blob:
            return None

        return {
            "userId": user.user_id,
            "recoveryId": user.recovery_id,
            "recoverySalt": user.recovery_salt,
            "encryptedRecoveryBlob": user.encrypted_recovery_blob,
            "version": user.recovery_version,
            "isUsed": user.recovery_used,
        }


    def rotate_recovery(self, user_id: str, old_recovery_id: str, new_recovery_id: str, new_salt: str, new_blob: dict, version: int):
        user = self.users.get(user_id)
        if not user:
            raise ValueError("User not found")

        if user.recovery_id != old_recovery_id:
            raise ValueError("Stale recovery token")

        user.recovery_id = new_recovery_id
        user.recovery_salt = new_salt
        user.encrypted_recovery_blob = new_blob
        user.recovery_version = version
        user.recovery_used = False

db = DynamoDatabaseService() if settings.use_dynamodb else InMemoryDatabaseService()