# backend/app/services/database.py
"""
Database service selection for local development and AWS deployment.

Zero-knowledge design: InMemoryDatabaseService mirrors DynamoDatabaseService
— both store only SHA-256 lookup hashes and a bcrypt hash of the auth verifier.
No plaintext email, username, or password is stored anywhere.
"""
from typing import Dict, Optional
import time
import uuid

from passlib.context import CryptContext

from app.config import settings
from app.models.schemas import UserInDB
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
    ) -> UserInDB:
        if email_lookup in self.email_lookup_index:
            raise ValueError("An account with this email already exists")
        if username_lookup and username_lookup in self.username_lookup_index:
            raise ValueError("An account with this username already exists")

        user = UserInDB(
            user_id=str(uuid.uuid4()),
            email_lookup=email_lookup,
            username_lookup=username_lookup,
            verifier_hash=verifier_context.hash(auth_verifier),
            auth_image_id=auth_image_id,
            created_at=int(time.time()),
            account_status="active",
            failed_login_attempts=0,
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


db = DynamoDatabaseService() if settings.use_dynamodb else InMemoryDatabaseService()