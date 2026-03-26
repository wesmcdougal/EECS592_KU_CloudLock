# app/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    # App
    app_name: str = "Password Manager API"
    debug: bool = False
    
    # AWS
    aws_region: str = "us-east-1"
    cognito_user_pool_id: Optional[str] = None
    cognito_client_id: Optional[str] = None
    kms_key_id: Optional[str] = None
    use_dynamodb: bool = True
    
    # DynamoDB Tables
    users_table: str = "PasswordManager-Users"
    devices_table: str = "PasswordManager-Devices-dev"
    audit_table: str = "PasswordManager-AuditLogs-dev"

    # Auth
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    
    # CORS
    allowed_origins: list = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://d1019akyob5adq.cloudfront.net",
    ]
    
    class Config:
        env_file = ".env"
        case_sensitive = False

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()