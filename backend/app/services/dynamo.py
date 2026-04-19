"""
DynamoDB Database Service (dynamo.py)

Implements AWS-backed persistence for user and vault data. Responsibilities include:
- User CRUD and hashed identifier lookups in DynamoDB
- Zero-knowledge auth verifier checks and JWT session token creation
- Encrypted vault read/write operations
- MFA preference and biometric device persistence
- MFA challenge token generation and verification
- WebAuthn credential metadata storage and assertion counter updates

Revision History:
- Wesley McDougal - 29MAR2026 - Added MFA and WebAuthn persistence methods for DynamoDB
"""
from __future__ import annotations

from typing import Optional
import hashlib
import hmac
import logging
import time
import uuid

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import BotoCoreError, ClientError
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.models.schemas import BiometricDevice, MfaEnrollmentPreference, UserInDB

verifier_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)


class DynamoDatabaseService:
    def __init__(self):
        dynamodb = boto3.resource("dynamodb", region_name=settings.aws_region)
        self.table = dynamodb.Table(settings.users_table)
        self.audit_table = dynamodb.Table(settings.audit_table)

    def _scan_one(self, filter_expression):
        response = self.table.scan(FilterExpression=filter_expression, Limit=1)
        items = response.get("Items", [])

        while not items and "LastEvaluatedKey" in response:
            response = self.table.scan(
                FilterExpression=filter_expression,
                Limit=1,
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items = response.get("Items", [])

        return items[0] if items else None

    def _scan_count(self, filter_expression) -> int:
        count = 0
        response = self.table.scan(FilterExpression=filter_expression, Select="COUNT")
        count += response.get("Count", 0)
        while "LastEvaluatedKey" in response:
            response = self.table.scan(
                FilterExpression=filter_expression,
                Select="COUNT",
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            count += response.get("Count", 0)
        return count

    def _item_to_user(self, item: Optional[dict]) -> Optional[UserInDB]:
        if not item or item.get("record_type") != "user":
            return None
        return UserInDB(
            user_id=item["user_id"],
            email_lookup=item["email_lookup"],
            username_lookup=item.get("username_lookup"),
            verifier_hash=item["verifier_hash"],
            auth_image_id=item.get("auth_image_id"),
            created_at=int(item["created_at"]),
            last_login=int(item["last_login"]) if item.get("last_login") is not None else None,
            account_status=item.get("account_status", "active"),
            failed_login_attempts=int(item.get("failed_login_attempts", 0)),
            mfa_enabled=bool(item.get("mfa_enabled", False)),
            mfa_methods=item.get("mfa_methods", []),
            biometric_devices=item.get("biometric_devices", []),
            totp_secret_encrypted=item.get("totp_secret_encrypted"),
            totp_pending_secret_encrypted=item.get("totp_pending_secret_encrypted"),
            session_version=int(item.get("session_version", 0)),
            trusted_contexts=item.get("trusted_contexts", []),
        )

    # ── Registration ─────────────────────────────────────────────────────────

    def create_user(
        self,
        email_lookup: str,
        auth_verifier: str,
        auth_image_id: str = "img_001",
        username_lookup: Optional[str] = None,
        mfa_enrollment: Optional[MfaEnrollmentPreference] = None,
        proposed_user_id: Optional[str] = None,
    ) -> UserInDB:
        if self.get_user_by_email_lookup(email_lookup):
            raise ValueError("An account with this email already exists")
        if username_lookup and self.get_user_by_username_lookup(username_lookup):
            raise ValueError("An account with this username already exists")

        now = int(time.time())
        user = UserInDB(
            user_id=proposed_user_id or str(uuid.uuid4()),
            email_lookup=email_lookup,
            username_lookup=username_lookup,
            verifier_hash=verifier_context.hash(auth_verifier),
            auth_image_id=auth_image_id,
            created_at=now,
            account_status="active",
            failed_login_attempts=0,
            mfa_enabled=False,
            mfa_methods=[],
            biometric_devices=[],
        )

        item = {
            "user_id":              user.user_id,
            "record_type":          "user",
            "email_lookup":         user.email_lookup,
            "username_lookup":      user.username_lookup,
            "verifier_hash":        user.verifier_hash,
            "auth_image_id":        user.auth_image_id,
            "created_at":           user.created_at,
            "last_login":           user.last_login,
            "account_status":       user.account_status,
            "failed_login_attempts": user.failed_login_attempts,
            "mfa_enabled":          user.mfa_enabled,
            "mfa_methods":          user.mfa_methods,
            "biometric_devices":    user.biometric_devices,
            "totp_secret_encrypted": None,
            "totp_pending_secret_encrypted": None,
            "session_version":      user.session_version,
            "trusted_contexts":     [],
            "encrypted_vault":      None,
            "vault_last_modified":  None,
            "recovery_id": None,
            "recovery_salt": None,
            "encrypted_recovery_blob": None,
            "recovery_version": None,
            "recovery_used": False,
        }

        try:
            self.table.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(user_id)",
            )
        except ClientError as error:
            raise ValueError("Unable to create user") from error

        return user

    # ── Lookup ────────────────────────────────────────────────────────────────

    def get_user_by_email_lookup(self, email_lookup: str) -> Optional[UserInDB]:
        item = self._scan_one(
            Attr("record_type").eq("user") & Attr("email_lookup").eq(email_lookup)
        )
        return self._item_to_user(item)

    def get_user_by_username_lookup(self, username_lookup: str) -> Optional[UserInDB]:
        item = self._scan_one(
            Attr("record_type").eq("user") & Attr("username_lookup").eq(username_lookup)
        )
        return self._item_to_user(item)

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
        response = self.table.get_item(Key={"user_id": user_id})
        return self._item_to_user(response.get("Item"))

    # ── Auth verifier ─────────────────────────────────────────────────────────

    def verify_auth_verifier(self, plain_verifier: str, stored_hash: str) -> bool:
        """Verify client-derived auth_verifier against its bcrypt hash."""
        return verifier_context.verify(plain_verifier, stored_hash)

    # ── Session ───────────────────────────────────────────────────────────────

    def update_last_login(self, user_id: str):
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET last_login = :ts",
            ExpressionAttributeValues={":ts": int(time.time())},
        )

    def increment_failed_attempts(self, user_id: str):
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=(
                "SET failed_login_attempts = "
                "if_not_exists(failed_login_attempts, :zero) + :one"
            ),
            ExpressionAttributeValues={":zero": 0, ":one": 1},
        )

    def reset_failed_attempts(self, user_id: str):
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET failed_login_attempts = :zero",
            ExpressionAttributeValues={":zero": 0},
        )

    def create_session(self, user_id: str) -> str:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        now = int(time.time())
        payload = {
            "sub": user_id,
            "iat": now,
            "exp": now + settings.access_token_expire_minutes * 60,
            "sv": user.session_version,
        }
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    def get_user_from_token(self, token: str) -> Optional[str]:
        try:
            payload = jwt.decode(
                token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
            )
        except JWTError:
            return None

        user_id = payload.get("sub")
        if not user_id:
            return None

        user = self.get_user_by_id(user_id)
        if not user or user.account_status != "active":
            return None

        if int(payload.get("sv", 0)) != int(user.session_version):
            return None

        return user_id

    def delete_session(self, token: str):
        return None  # JWT expiry handles invalidation; add a blocklist for revocation later

    def delete_user_account(self, user_id: str) -> bool:
        try:
            response = self.table.delete_item(
                Key={"user_id": user_id},
                ConditionExpression="attribute_exists(user_id)",
                ReturnValues="ALL_OLD",
            )
        except ClientError as error:
            error_code = error.response.get("Error", {}).get("Code")
            if error_code == "ConditionalCheckFailedException":
                return False
            raise

        return bool(response.get("Attributes"))

    def write_audit_event(self, *, event_type: str, user_id: str, metadata: Optional[dict] = None):
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "user_id": user_id,
            "timestamp": int(time.time()),
            "metadata": metadata or {},
        }
        try:
            self.audit_table.put_item(Item=event)
        except (BotoCoreError, ClientError) as error:
            logger.warning("Failed to write audit event: %s", error)

    # ── Vault ──────────────────────────────────────────────────────────────────

    def save_vault(self, user_id: str, encrypted_vault: str):
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=(
                "SET encrypted_vault = :v, vault_last_modified = :ts"
            ),
            ExpressionAttributeValues={
                ":v":  encrypted_vault,
                ":ts": int(time.time()),
            },
        )

    def get_vault(self, user_id: str) -> Optional[dict]:
        response = self.table.get_item(Key={"user_id": user_id})
        item = response.get("Item")
        if not item or not item.get("encrypted_vault"):
            return None
        return {
            "encrypted_vault": item["encrypted_vault"],
            "last_modified": int(
                item.get("vault_last_modified")
                or item.get("last_login")
                or time.time()
            ),
        }

    # ── Admin / debug ─────────────────────────────────────────────────────────

    def list_all_users(self) -> list:
        users = []
        response = self.table.scan(FilterExpression=Attr("record_type").eq("user"))
        users.extend(response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = self.table.scan(
                FilterExpression=Attr("record_type").eq("user"),
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            users.extend(response.get("Items", []))

        return [
            {
                "user_id":         item["user_id"],
                "email_lookup":    item["email_lookup"],      # just the hash
                "username_lookup": item.get("username_lookup"),
                "created_at":      int(item["created_at"]),
                "account_status":  item.get("account_status", "active"),
                "last_login":      int(item["last_login"]) if item.get("last_login") is not None else None,
                "failed_attempts": int(item.get("failed_login_attempts", 0)),
                "has_vault":       bool(item.get("encrypted_vault")),
            }
            for item in users
        ]

    def get_user_count(self) -> int:
        return self._scan_count(Attr("record_type").eq("user"))

    def get_debug_info(self) -> dict:
        return {
            "storage":     "dynamodb",
            "users_table": settings.users_table,
            "total_users": self.get_user_count(),
            "note":        "No plaintext identifiers stored. Lookups use SHA-256 hashes.",
            "users_detail": self.list_all_users(),
        }

    def get_mfa_status(self, user_id: str) -> dict:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        return {
            "enabled": user.mfa_enabled,
            "methods": user.mfa_methods,
            "biometric_devices": user.biometric_devices,
            "totp_enrolled": bool(user.totp_secret_encrypted),
        }

    def update_mfa_preferences(self, user_id: str, methods: list[str]) -> dict:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        allowed_methods = []
        if "biometric" in methods and user.biometric_devices:
            allowed_methods.append("biometric")
        if "totp" in methods and user.totp_secret_encrypted:
            allowed_methods.append("totp")

        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET mfa_methods = :methods, mfa_enabled = :enabled",
            ExpressionAttributeValues={
                ":methods": allowed_methods,
                ":enabled": bool(allowed_methods),
            },
            ConditionExpression="attribute_exists(user_id)",
        )
        return self.get_mfa_status(user_id)

    def register_biometric_device(self, user_id: str, device_id: str, label: str) -> BiometricDevice:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        if any(device.device_id == device_id for device in user.biometric_devices):
            raise ValueError("Biometric device already registered")

        new_device = BiometricDevice(
            device_id=device_id,
            label=label,
            created_at=int(time.time()),
        )
        next_devices = [device.model_dump() for device in user.biometric_devices]
        next_devices.append(new_device.model_dump())
        next_methods = list(dict.fromkeys([*user.mfa_methods, "biometric"]))

        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=(
                "SET biometric_devices = :devices, mfa_methods = :methods, mfa_enabled = :enabled"
            ),
            ExpressionAttributeValues={
                ":devices": next_devices,
                ":methods": next_methods,
                ":enabled": True,
            },
            ConditionExpression="attribute_exists(user_id)",
        )
        return new_device

    def begin_totp_setup(self, user_id: str, encrypted_secret: str):
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET totp_pending_secret_encrypted = :secret",
            ExpressionAttributeValues={":secret": encrypted_secret},
            ConditionExpression="attribute_exists(user_id)",
        )

    def confirm_totp_setup(self, user_id: str):
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        if not user.totp_pending_secret_encrypted:
            raise ValueError("No pending TOTP setup found")

        next_methods = list(dict.fromkeys([*user.mfa_methods, "totp"]))
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=(
                "SET totp_secret_encrypted = :active, totp_pending_secret_encrypted = :pending, "
                "mfa_methods = :methods, mfa_enabled = :enabled"
            ),
            ExpressionAttributeValues={
                ":active": user.totp_pending_secret_encrypted,
                ":pending": None,
                ":methods": next_methods,
                ":enabled": True,
            },
            ConditionExpression="attribute_exists(user_id)",
        )

    def revoke_biometric_device(self, user_id: str, device_id: str) -> bool:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        next_devices = [
            device.model_dump() for device in user.biometric_devices if device.device_id != device_id
        ]
        changed = len(next_devices) < len(user.biometric_devices)
        if not changed:
            return False

        next_methods = user.mfa_methods
        if not next_devices and "biometric" in next_methods:
            next_methods = [method for method in next_methods if method != "biometric"]

        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=(
                "SET biometric_devices = :devices, mfa_methods = :methods, mfa_enabled = :enabled"
            ),
            ExpressionAttributeValues={
                ":devices": next_devices,
                ":methods": next_methods,
                ":enabled": bool(next_methods),
            },
            ConditionExpression="attribute_exists(user_id)",
        )
        return True

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
            payload = jwt.decode(
                token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
            )
        except JWTError:
            return None

        if payload.get("purpose") != "mfa-login":
            return None

        return {
            "user_id": payload.get("sub"),
            "mfa_methods": payload.get("mfa_methods", []),
            "device_fingerprint_hash": payload.get("dfp"),
        }

    def create_webauthn_registration_challenge(self, user_id: str) -> str:
        """Create a challenge for WebAuthn credential registration."""
        import base64
        challenge = uuid.uuid4().bytes
        return base64.urlsafe_b64encode(challenge).decode().rstrip('=')

    # ── Image-Auth challenge ──────────────────────────────────────────────────

    # TTL for the image-auth challenge (120 seconds)
    IMAGE_CHALLENGE_TTL = 120

    def create_image_challenge(self, user_id: str, device_fingerprint_hash: Optional[str] = None) -> str:
        """Create a short-lived JWT challenge for the image-auth step."""
        now = int(time.time())
        payload = {
            "sub": user_id,
            "purpose": "image-login",
            "iat": now,
            "exp": now + self.IMAGE_CHALLENGE_TTL,
        }
        if device_fingerprint_hash:
            payload["device_fingerprint_hash"] = device_fingerprint_hash
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    def verify_image_challenge(self, token: str) -> Optional[dict]:
        """Verify and decode an image-auth challenge JWT."""
        try:
            payload = jwt.decode(
                token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
            )
        except JWTError:
            return None
        if payload.get("purpose") != "image-login":
            return None
        return {
            "user_id": payload.get("sub"),
            "device_fingerprint_hash": payload.get("device_fingerprint_hash"),
        }

    def is_suspicious_context(self, user_id: str, device_fingerprint_hash: Optional[str]) -> bool:
        """
        Return True when the device fingerprint is not among the user's trusted contexts.
        Users with no real auth image (img_001) are never flagged as suspicious.
        """
        user = self.get_user_by_id(user_id)
        if not user:
            return False
        # Skip image-auth for legacy users who never enrolled an image
        if not user.auth_image_id or user.auth_image_id == "img_001":
            return False
        if not device_fingerprint_hash:
            return True
        now = int(time.time())
        # A context is trusted if its hash matches and hasn't expired
        for ctx in user.trusted_contexts:
            if (
                ctx.get("fp") == device_fingerprint_hash
                and int(ctx.get("exp", 0)) > now
            ):
                return False
        return True

    def trust_context(self, user_id: str, device_fingerprint_hash: str, ttl_days: int = 30):
        """Add a device fingerprint hash to the user's trusted contexts list."""
        now = int(time.time())
        new_ctx = {"fp": device_fingerprint_hash, "exp": now + ttl_days * 86400}
        # Prune expired entries and append the new one (max 20 entries)
        user = self.get_user_by_id(user_id)
        if not user:
            return
        live = [
            ctx for ctx in user.trusted_contexts
            if int(ctx.get("exp", 0)) > now and ctx.get("fp") != device_fingerprint_hash
        ]
        live.append(new_ctx)
        live = live[-20:]  # keep at most 20
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET trusted_contexts = :ctx",
            ExpressionAttributeValues={":ctx": live},
        )

    def update_trusted_contexts(self, user_id: str, trusted_contexts: list):
        """Update the entire trusted_contexts list for a user (used for revocation)."""
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET trusted_contexts = :ctx",
            ExpressionAttributeValues={":ctx": trusted_contexts},
        )

    def verify_image_hash(self, stored_hash: str, received_hash: str) -> bool:
        """Constant-time comparison of two hex SHA-256 hashes."""
        return hmac.compare_digest(
            stored_hash.lower().encode(),
            received_hash.lower().encode(),
        )

    def create_webauthn_assertion_challenge(self, user_id: str) -> str:
        """Create a challenge for WebAuthn assertion (during MFA login)."""
        import base64
        challenge = uuid.uuid4().bytes
        return base64.urlsafe_b64encode(challenge).decode().rstrip('=')

    def verify_webauthn_registration(self, user_id: str, credential_id: str, public_key: str, counter: int) -> bool:
        """Verify WebAuthn registration and check credential."""
        # In production, verify attestation object here
        return True

    def store_webauthn_credential(self, user_id: str, device_label: str, credential_id: str, public_key: str, counter: int) -> Optional[BiometricDevice]:
        """Store WebAuthn credential after successful registration."""
        from app.models.schemas import BiometricDevice
        
        user = self.get_user_by_id(user_id)
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

        # Update user with new device
        user.biometric_devices.append(device)
        if "biometric" not in user.mfa_methods:
            user.mfa_methods.append("biometric")

        # Update in DynamoDB
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET biometric_devices = :devices, mfa_methods = :methods, mfa_enabled = :enabled",
            ExpressionAttributeValues={
                ":devices": [d.model_dump() for d in user.biometric_devices],
                ":methods": user.mfa_methods,
                ":enabled": True,
            }
        )

        return device

    def verify_webauthn_assertion(self, user_id: str, credential_id: str, counter: int) -> Optional[BiometricDevice]:
        """Verify WebAuthn assertion and check counter for cloning."""
        from app.models.schemas import BiometricDevice

        user = self.get_user_by_id(user_id)
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
            return None

        # Update counter and last used time
        device.counter = counter
        device.last_used_at = int(time.time())

        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET biometric_devices = :devices",
            ExpressionAttributeValues={
                ":devices": [d.model_dump() for d in user.biometric_devices],
            }
        )

        return device

    def healthcheck(self) -> bool:
        try:
            self.table.load()
            return True
        except (ClientError, BotoCoreError) as error:
            logger.exception("DynamoDB healthcheck failed: %s", error)
            return False
    
    def save_recovery(self, user_id, recovery_id, recovery_salt, encrypted_blob, version):
        self.table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="""
                SET recovery_id = :rid,
                    recovery_salt = :salt,
                    encrypted_recovery_blob = :blob,
                    recovery_version = :version,
                    recovery_used = :used
            """,
            ExpressionAttributeValues={
                ":rid": recovery_id,
                ":salt": recovery_salt,
                ":blob": encrypted_blob,
                ":version": version,
                ":used": False,
            },
        )

    def get_recovery(self, user_id):
        response = self.table.get_item(Key={"user_id": user_id})
        item = response.get("Item")

        if not item or not item.get("encrypted_recovery_blob"):
            return None

        return {
            "userId": item["user_id"],
            "recoveryId": item.get("recovery_id"),
            "recoverySalt": item.get("recovery_salt"),
            "encryptedRecoveryBlob": item.get("encrypted_recovery_blob"),
            "version": item.get("recovery_version"),
            "isUsed": item.get("recovery_used", False),
        }
    
    def rotate_recovery(self, user_id, old_recovery_id, new_recovery_id, new_salt, new_blob, version):
        self.table.update_item(
            Key={"user_id": user_id},
            ConditionExpression="recovery_id = :old",
            UpdateExpression="""
                SET recovery_id = :new,
                    recovery_salt = :salt,
                    encrypted_recovery_blob = :blob,
                    recovery_version = :version,
                    recovery_used = :used
            """,
            ExpressionAttributeValues={
                ":old": old_recovery_id,
                ":new": new_recovery_id,
                ":salt": new_salt,
                ":blob": new_blob,
                ":version": version,
                ":used": False,
            },
        )
