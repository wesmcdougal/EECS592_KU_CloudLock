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
    
    # DynamoDB Tables
    users_table: str = "PasswordManager-Users-dev"
    devices_table: str = "PasswordManager-Devices-dev"
    audit_table: str = "PasswordManager-AuditLogs-dev"
    
    # CORS
    allowed_origins: list = ["http://localhost:3000", "http://localhost:3001"]
    
    class Config:
        env_file = ".env"
        case_sensitive = False

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()