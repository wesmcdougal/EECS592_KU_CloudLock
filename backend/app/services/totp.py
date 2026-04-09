import base64
import hashlib
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
import pyotp

from app.config import settings

TOTP_ISSUER = "CloudLock"


def _encryption_key() -> bytes:
    return hashlib.sha256(settings.jwt_secret_key.encode("utf-8")).digest()


def encrypt_totp_secret(secret: str) -> str:
    cipher = AES.new(_encryption_key(), AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(secret.encode("utf-8"))
    payload = cipher.nonce + tag + ciphertext
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decrypt_totp_secret(encrypted_secret: str) -> str:
    payload = base64.urlsafe_b64decode(encrypted_secret.encode("ascii"))
    nonce = payload[:16]
    tag = payload[16:32]
    ciphertext = payload[32:]
    cipher = AES.new(_encryption_key(), AES.MODE_GCM, nonce=nonce)
    return cipher.decrypt_and_verify(ciphertext, tag).decode("utf-8")


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def build_totp_uri(secret: str, account_name: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=TOTP_ISSUER)


def verify_totp_code(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)
