# backend/app/api/vault.py
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.models.schemas import SaveVaultRequest, SaveVaultResponse, VaultResponse
from app.services.database import db
import time

router = APIRouter()
security = HTTPBearer()

@router.post("/save", response_model=SaveVaultResponse)
async def save_vault(
    request: SaveVaultRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Save encrypted vault for authenticated user
    Requires: Authorization: Bearer <token>
    """
    # Extract token from credentials
    token = credentials.credentials
    
    # Get user from token
    user_id = db.get_user_from_token(token)
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    # Save vault
    db.save_vault(user_id, request.encrypted_vault)
    
    return SaveVaultResponse(
        status="saved",
        timestamp=int(time.time())
    )

@router.get("/retrieve", response_model=VaultResponse)
async def retrieve_vault(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Retrieve encrypted vault for authenticated user
    Requires: Authorization: Bearer <token>
    """
    # Extract token
    token = credentials.credentials
    
    # Get user from token
    user_id = db.get_user_from_token(token)
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    # Get vault
    vault = db.get_vault(user_id)
    
    if not vault:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault not found. Please save a vault first."
        )
    
    return VaultResponse(
        encrypted_vault=vault['encrypted_vault'],
        last_modified=vault['last_modified']
    )