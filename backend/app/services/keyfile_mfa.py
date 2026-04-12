"""
Key File MFA Service (keyfile_mfa.py)

Handles generation and verification of key files for MFA.
"""
import os
import hashlib

KEYFILE_SIZE = 32  # 256 bits


def generate_keyfile() -> bytes:
    """Generate a random key file."""
    return os.urandom(KEYFILE_SIZE)


def hash_keyfile(keyfile_bytes: bytes) -> str:
    """Return the SHA-256 hash (hex) of the key file."""
    return hashlib.sha256(keyfile_bytes).hexdigest()


def verify_keyfile(uploaded_bytes: bytes, stored_hash: str) -> bool:
    """Verify uploaded key file matches stored hash."""
    uploaded_hash = hash_keyfile(uploaded_bytes)
    return hmac_compare(uploaded_hash, stored_hash)


def hmac_compare(a: str, b: str) -> bool:
    """Constant-time comparison to prevent timing attacks."""
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a.encode(), b.encode()):
        result |= x ^ y
    return result == 0
