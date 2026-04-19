from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    CompleteRecoveryRequest,
    CreateRecoveryRequest,
    RecoveryResponse,
    RecoverySessionRequest,
    RecoverySessionResponse,
)
from app.services.database import db

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


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


@router.post("/session", response_model=RecoverySessionResponse)
async def claim_recovery_session(payload: RecoverySessionRequest):
    """
    Issue a session token after successful QR recovery.
    Verifies the newRecoveryId matches the current stored record, proving
    the client possessed the original valid QR and completed rotation.
    """
    user_id = str(payload.userId)
    new_recovery_id = str(payload.newRecoveryId)

    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    record = db.get_recovery(user_id)
    if not record or record.get("recoveryId") != new_recovery_id:
        raise HTTPException(status_code=401, detail="Recovery session claim invalid")

    try:
        access_token = db.create_session(user_id)
        db.update_last_login(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create session") from exc

    return RecoverySessionResponse(access_token=access_token, user_id=user_id)