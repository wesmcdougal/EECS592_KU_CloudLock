from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.schemas import (
    CompleteRecoveryRequest,
    CreateRecoveryRequest,
    RecoveryResponse,
)
from app.services.database import InMemoryDatabaseService
from app.services.dynamo import DynamoDatabaseService

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


# Simple service selection matching the project's storage mode.
# If your app already exposes a shared db service instance elsewhere,
# switch this to import that instead.
db = DynamoDatabaseService() if settings.use_dynamodb else InMemoryDatabaseService()


@router.post("")
async def create_recovery_record(payload: CreateRecoveryRequest):
    if payload.version != 1:
        raise HTTPException(status_code=400, detail="Unsupported recovery version")

    try:
        db.save_recovery(
            user_id=str(payload.userId),
            recovery_id=str(payload.recoveryId),
            recovery_salt=payload.recoverySalt,
            encrypted_blob=payload.encryptedRecoveryBlob.model_dump(),
            version=payload.version,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create recovery record") from exc

    return {"ok": True}


@router.get("/{user_id}", response_model=RecoveryResponse)
async def get_recovery_record(user_id: UUID):
    try:
        record = db.get_recovery(str(user_id))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load recovery record") from exc

    if not record:
        raise HTTPException(status_code=404, detail="Recovery record not available")

    return record


@router.post("/complete")
async def complete_recovery(payload: CompleteRecoveryRequest):
    if payload.version != 1:
        raise HTTPException(status_code=400, detail="Unsupported recovery version")

    try:
        db.rotate_recovery(
            user_id=str(payload.userId),
            old_recovery_id=str(payload.oldRecoveryId),
            new_recovery_id=str(payload.newRecoveryId),
            new_salt=payload.newRecoverySalt,
            new_blob=payload.newEncryptedRecoveryBlob.model_dump(),
            version=payload.version,
        )
    except ValueError as exc:
        message = str(exc)

        if "not found" in message.lower():
            raise HTTPException(status_code=404, detail=message) from exc

        raise HTTPException(status_code=409, detail=message) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to rotate recovery record") from exc

    return {"ok": True, "mustGenerateNewQr": True}