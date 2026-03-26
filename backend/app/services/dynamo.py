"""
DynamoDB-backed persistence — zero-knowledge design.

What is stored in DynamoDB:
  user_id          — opaque UUID, partition key
  record_type      — "user" (allows future record types in same table)
  email_lookup     — SHA-256(email_lower), used only for lookup, never the real email
  username_lookup  — SHA-256(username_lower) if provided
  verifier_hash    — bcrypt(auth_verifier) where auth_verifier = PBKDF2(password, email+":auth")
                     Server NEVER receives or stores the plaintext password.
  auth_image_id    — non-sensitive UI preference
  encrypted_vault  — client-side encrypted blob; server cannot decrypt it
  vault_last_modified, created_at, last_login, account_status, failed_login_attempts

What is NOT stored:
  plaintext email, plaintext username, plaintext password
"""
from __future__ import annotations

from typing import Optional
import logging
import time
import uuid

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import BotoCoreError, ClientError
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.models.schemas import UserInDB

verifier_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)


class DynamoDatabaseService:
    def __init__(self):
        dynamodb = boto3.resource("dynamodb", region_name=settings.aws_region)
        self.table = dynamodb.Table(settings.users_table)

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
        )

    # ── Registration ─────────────────────────────────────────────────────────

    def create_user(
        self,
        email_lookup: str,
        auth_verifier: str,
        auth_image_id: str = "img_001",
        username_lookup: Optional[str] = None,
    ) -> UserInDB:
        if self.get_user_by_email_lookup(email_lookup):
            raise ValueError("An account with this email already exists")
        if username_lookup and self.get_user_by_username_lookup(username_lookup):
            raise ValueError("An account with this username already exists")

        now = int(time.time())
        user = UserInDB(
            user_id=str(uuid.uuid4()),
            email_lookup=email_lookup,
            username_lookup=username_lookup,
            verifier_hash=verifier_context.hash(auth_verifier),
            auth_image_id=auth_image_id,
            created_at=now,
            account_status="active",
            failed_login_attempts=0,
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
            "encrypted_vault":      None,
            "vault_last_modified":  None,
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
        now = int(time.time())
        payload = {
            "sub": user_id,
            "iat": now,
            "exp": now + settings.access_token_expire_minutes * 60,
        }
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    def get_user_from_token(self, token: str) -> Optional[str]:
        try:
            payload = jwt.decode(
                token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
            )
        except JWTError:
            return None
        return payload.get("sub")

    def delete_session(self, token: str):
        return None  # JWT expiry handles invalidation; add a blocklist for revocation later

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

    def healthcheck(self) -> bool:
        try:
            self.table.load()
            return True
        except (ClientError, BotoCoreError) as error:
            logger.exception("DynamoDB healthcheck failed: %s", error)
            return False
