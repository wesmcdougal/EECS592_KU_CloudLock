# supports saving and retrieving an encrypted vault; it expects client-side encrypted data (good for zero-knowledge).
from fastapi import APIRouter, HTTPException, status, Header
from app.models.schemas import SaveVaultRequest, SaveVaultResponse, VaultResponse
import time
from typing import Optional, Dict

router = APIRouter()

# In-memory storage for demo
vaults_db: Dict[str, dict] = {}

# Helper: Get user_id from token (simplified)
def get_user_from_token(authorization: str) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header"
        )
    
    token = authorization.replace("Bearer ", "")
    
    # Import from auth module
    from app.api.auth import sessions_db
    user_id = sessions_db.get(token)
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    return user_id

@router.post("/save", response_model=SaveVaultResponse)
async def save_vault(
    request: SaveVaultRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Save encrypted vault for authenticated user
    """
    user_id = get_user_from_token(authorization)
    
    timestamp = int(time.time())
    
    # Save vault
    vaults_db[user_id] = {
        "encrypted_vault": request.encrypted_vault,
        "last_modified": timestamp
    }
    
    return SaveVaultResponse(
        status="saved",
        timestamp=timestamp
    )

@router.get("/retrieve", response_model=VaultResponse)
async def retrieve_vault(authorization: Optional[str] = Header(None)):
    """
    Retrieve encrypted vault for authenticated user
    """
    user_id = get_user_from_token(authorization)
    
    vault = vaults_db.get(user_id)
    
    if not vault:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault not found. Please save a vault first."
        )
    
    return VaultResponse(
        encrypted_vault=vault['encrypted_vault'],
        last_modified=vault['last_modified']
    )