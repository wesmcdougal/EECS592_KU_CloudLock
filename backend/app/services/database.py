# backend/app/services/database.py
"""
Database service - In-memory storage for development
Will be replaced with DynamoDB in production
"""
from typing import Dict, Optional
import uuid
import time
from passlib.context import CryptContext
from app.models.schemas import UserInDB

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class DatabaseService:
    """
    In-memory database for development/testing
    All data is lost when server restarts
    """
    def __init__(self):
        # In-memory storage
        self.users: Dict[str, UserInDB] = {}  # user_id -> UserInDB
        self.email_index: Dict[str, str] = {}  # email -> user_id
        self.sessions: Dict[str, str] = {}  # token -> user_id
        self.vaults: Dict[str, dict] = {}  # user_id -> vault data
    
    # ============ USER OPERATIONS ============
    
    def create_user(self, email: str, password: str, auth_image_id: str) -> UserInDB:
        """
        Create a new user in the database
        """
        # Check if email already exists (case-insensitive)
        if email.lower() in self.email_index:
            raise ValueError("User with this email already exists")
        
        # Generate user ID
        user_id = str(uuid.uuid4())
        
        # Hash password
        password_hash = pwd_context.hash(password)
        
        # Create user object
        user = UserInDB(
            user_id=user_id,
            email=email.lower(),
            password_hash=password_hash,
            auth_image_id=auth_image_id,
            created_at=int(time.time()),
            account_status="active",
            failed_login_attempts=0
        )
        
        # Save to database
        self.users[user_id] = user
        self.email_index[email.lower()] = user_id
        
        # Debug logging
        print(f"✅ User created: {email} (ID: {user_id})")
        print(f"📊 Total users: {len(self.users)}")
        
        return user
    
    def get_user_by_email(self, email: str) -> Optional[UserInDB]:
        """
        Retrieve user by email (case-insensitive)
        """
        user_id = self.email_index.get(email.lower())
        if not user_id:
            return None
        return self.users.get(user_id)
    
    def get_user_by_id(self, user_id: str) -> Optional[UserInDB]:
        """
        Retrieve user by ID
        """
        return self.users.get(user_id)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """
        Verify password against hash
        """
        return pwd_context.verify(plain_password, hashed_password)
    
    def update_last_login(self, user_id: str):
        """
        Update user's last login timestamp
        """
        if user_id in self.users:
            self.users[user_id].last_login = int(time.time())
    
    def increment_failed_attempts(self, user_id: str):
        """
        Increment failed login attempts
        """
        if user_id in self.users:
            self.users[user_id].failed_login_attempts += 1
    
    def reset_failed_attempts(self, user_id: str):
        """
        Reset failed login attempts to 0
        """
        if user_id in self.users:
            self.users[user_id].failed_login_attempts = 0
    
    # ============ SESSION OPERATIONS ============
    
    def create_session(self, user_id: str) -> str:
        """
        Create a session token for user
        """
        token = f"token_{uuid.uuid4()}"
        self.sessions[token] = user_id
        print(f"🔑 Session created for user: {user_id}")
        return token
    
    def get_user_from_token(self, token: str) -> Optional[str]:
        """
        Get user_id from session token
        """
        return self.sessions.get(token)
    
    def delete_session(self, token: str):
        """
        Logout - delete session token
        """
        if token in self.sessions:
            del self.sessions[token]
            print(f"🚪 Session deleted")
    
    # ============ VAULT OPERATIONS ============
    
    def save_vault(self, user_id: str, encrypted_vault: str):
        """
        Save encrypted vault for user
        """
        self.vaults[user_id] = {
            "encrypted_vault": encrypted_vault,
            "last_modified": int(time.time())
        }
        print(f"💾 Vault saved for user: {user_id}")
    
    def get_vault(self, user_id: str) -> Optional[dict]:
        """
        Retrieve encrypted vault for user
        """
        return self.vaults.get(user_id)
    
    # ============ ADMIN/DEBUG OPERATIONS ============
    
    def list_all_users(self) -> list:
        """
        List all users (for debugging/admin)
        """
        return [
            {
                "user_id": user.user_id,
                "email": user.email,
                "created_at": user.created_at,
                "account_status": user.account_status,
                "last_login": user.last_login,
                "failed_attempts": user.failed_login_attempts
            }
            for user in self.users.values()
        ]
    
    def get_user_count(self) -> int:
        """
        Get total number of registered users
        """
        return len(self.users)
    
    def clear_all_data(self):
        """
        Clear all data (for testing)
        """
        self.users.clear()
        self.email_index.clear()
        self.sessions.clear()
        self.vaults.clear()
        print("🗑️ All data cleared")

# Global instance (singleton pattern)
# This is imported and used by API endpoints
db = DatabaseService()