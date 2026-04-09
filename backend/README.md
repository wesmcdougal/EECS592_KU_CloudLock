# Password Manager - Backend

FastAPI backend for the CloudLock zero-knowledge password manager.

## Setup Instructions

### 1. Prerequisites
- Python 3.11+

### 2. Create Virtual Environment
```bash
py -3.11 -m venv .venv
```

Activate it:

```bash
# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Run Locally
```bash
uvicorn app.main:app --reload --port 8000
```

If you want to run without AWS resources locally, set `USE_DYNAMODB=false` in `backend/.env`.

Visit http://localhost:8000/docs for Swagger docs.

## AWS Setup (DynamoDB Device Trust)

CloudLock uses DynamoDB to store trusted device fingerprints and authentication audit logs. This enables device recognition across login sessions.

### DynamoDB Table Requirements

Ensure your `PasswordManager-Users` table has:
- **Table name**: `PasswordManager-Users`
- **Partition key**: `user_id` (String)
- **Status**: Active
- **Region**: Same as your AWS credentials

This table stores user records including device trust contexts (`trusted_contexts` field for remembering authenticated devices).

### Configure Credentials

Set your AWS credentials before running the backend:

```bash
# Option 1: Environment variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key

# Option 2: AWS CLI config (~/.aws/credentials)
aws configure

# Option 3: IAM role (if running on EC2/Lambda)
# Credentials automatically provided by AWS
```

### Switching Between DynamoDB and In-Memory Storage

**Development (in-memory, data lost on restart):**
```bash
echo "USE_DYNAMODB=false" > backend/.env
```

**Production (persistent DynamoDB):**
```bash
echo "USE_DYNAMODB=true" > backend/.env
```

## API Surface (Current)

### Core
- `GET /health`
- `GET /`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/login/mfa/verify`
- `POST /api/auth/login/image/verify`
- `GET /api/auth/me`
- `GET /api/auth/devices/trusted` - List all trusted devices (secured, requires auth token)
- `DELETE /api/auth/devices/trusted/{device_fingerprint}` - Revoke a specific trusted device (secured, requires auth token)
- `POST /api/auth/logout`
- `POST /api/auth/delete-account`
- `GET /api/auth/admin/users`
- `GET /api/auth/debug/database-info`

### Vault
- `POST /api/vault/save`
- `GET /api/vault/retrieve`

### MFA / WebAuthn
- `GET /api/mfa/status`
- `PUT /api/mfa/preferences`
- `POST /api/mfa/totp/setup/start`
- `POST /api/mfa/totp/setup/verify`
- `POST /api/mfa/devices/biometric`
- `DELETE /api/mfa/devices/biometric/{device_id}`
- `POST /api/mfa/webauthn/registration-challenge`
- `POST /api/mfa/webauthn/registration`
- `POST /api/mfa/webauthn/mfa-challenge`
- `POST /api/mfa/webauthn/mfa-verify`

## Important Payload Contract Changes

The backend now expects client-derived identifiers/verifiers (zero-knowledge flow), not plaintext email/password.

- Register uses `email_lookup`, optional `username_lookup`, and `auth_verifier`.
- Login uses `email_lookup` or `username_lookup` plus `auth_verifier`.
- `GET /api/auth/me` returns `email_lookup` (hashed lookup), not plaintext email.

## Quick API Testing Guide

Use Swagger at http://localhost:8000/docs.

### 1. Health Check
`GET /health`

Expected:
```json
{
  "status": "healthy",
  "service": "cloudlock-api",
  "version": "1.0.0"
}
```

### 2. Register User (Zero-Knowledge Contract)
`POST /api/auth/register`

Example request:
```json
{
  "email_lookup": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "username_lookup": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  "auth_verifier": "bXktY2xpZW50LWRlcml2ZWQtdmVyaWZpZXI=",
  "auth_image_id": "img_001",
  "mfa_enrollment": {
    "enable_biometric": false,
    "enable_totp": false
  }
}
```

Expected shape:
```json
{
  "message": "User registered successfully",
  "user_id": "<uuid>",
  "created_at": 1707953191,
  "email_verification_required": false
}
```

### 3. Login User (Branching Response)
`POST /api/auth/login`

Example request:
```json
{
  "email_lookup": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "auth_verifier": "bXktY2xpZW50LWRlcml2ZWQtdmVyaWZpZXI=",
  "device_fingerprint": "my_laptop_123"
}
```

Possible responses:

1. Direct success (trusted context, no MFA):
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user_id": "<uuid>",
  "requires_mfa": false,
  "mfa_types": []
}
```

2. MFA required:
```json
{
  "access_token": null,
  "token_type": "bearer",
  "user_id": "<uuid>",
  "requires_mfa": true,
  "mfa_types": ["totp"],
  "mfa_challenge_token": "<jwt>"
}
```

3. Image authentication required:
```json
{
  "access_token": null,
  "token_type": "bearer",
  "user_id": "<uuid>",
  "requires_mfa": false,
  "mfa_types": [],
  "requires_image_auth": true,
  "image_challenge_token": "<jwt>"
}
```

### 4. MFA Verify (if required)
`POST /api/auth/login/mfa/verify`

TOTP example:
```json
{
  "mfa_challenge_token": "<from-login>",
  "method": "totp",
  "totp_code": "123456"
}
```

Biometric example:
```json
{
  "mfa_challenge_token": "<from-login>",
  "method": "biometric",
  "device_id": "device_01"
}
```

### 5. Image Verify (if required)
`POST /api/auth/login/image/verify`

```json
{
  "image_challenge_token": "<from-login-or-mfa>",
  "auth_image_hash": "<sha256-hex>"
}
```

### 6. Get Current User
`GET /api/auth/me` with Bearer token

Expected fields now include lookup hash:
```json
{
  "user_id": "<uuid>",
  "email_lookup": "<sha256-hex>",
  "created_at": 1707953191,
  "last_login": 1707953250,
  "account_status": "active"
}
```

### 7. List Trusted Devices
`GET /api/auth/devices/trusted` with Bearer token

Returns all devices marked as trusted by the user's account:
```json
{
  "user_id": "<uuid>",
  "total_trusted_devices": 2,
  "devices": [
    {
      "device_fingerprint": "a1b2c3d4e5f6",
      "enrolled_at": 1707953191,
      "expires_at": 1708557991,
      "days_until_expiry": 7
    },
    {
      "device_fingerprint": "x9y8z7w6v5u4",
      "enrolled_at": 1707949000,
      "expires_at": 1708553000,
      "days_until_expiry": 6
    }
  ]
}
```

### 8. Revoke a Trusted Device
`DELETE /api/auth/devices/trusted/{device_fingerprint}` with Bearer token

Example request:
```bash
curl -X DELETE http://localhost:8000/api/auth/devices/trusted/a1b2c3d4e5f6 \
  -H "Authorization: Bearer <access_token>"
```

Expected response:
```json
{
  "status": "revoked",
  "device_fingerprint": "a1b2c3d4e5f6",
  "remaining_trusted_devices": 1
}
```

**Use case:** User logs into account and wants to revoke an old/compromised device from their trusted list. Next login from that device will require image auth again.

### 9. Save and Retrieve Vault
Use Bearer token.

Save: `POST /api/vault/save`
```json
{
  "encrypted_vault": "dGVzdGVuY3J5cHRlZGRhdGE="
}
```

Retrieve: `GET /api/vault/retrieve`

### 10. MFA Management
Use Bearer token.

- `GET /api/mfa/status`
- `PUT /api/mfa/preferences`
- `POST /api/mfa/totp/setup/start`
- `POST /api/mfa/totp/setup/verify`
- `POST /api/mfa/devices/biometric`
- `DELETE /api/mfa/devices/biometric/{device_id}`

### 11. Authenticator App Enrollment

CloudLock now supports standard TOTP apps such as Google Authenticator, Microsoft Authenticator, Authy, 1Password, and other RFC 6238-compatible apps.

Start setup immediately after signup:
`POST /api/mfa/totp/setup/start`

Example request:
```json
{
  "user_id": "<signup-user-id>",
  "account_name": "user@example.com"
}
```

Expected response shape:
```json
{
  "setup_token": "<jwt>",
  "manual_entry_key": "<base32-secret>",
  "otpauth_uri": "otpauth://totp/CloudLock:user@example.com?...",
  "issuer": "CloudLock"
}
```

Verify setup by submitting the 6-digit code from the authenticator app:
`POST /api/mfa/totp/setup/verify`

Example request:
```json
{
  "setup_token": "<from-setup-start>",
  "totp_code": "123456"
}
```

Successful response:
```json
{
  "status": "enabled",
  "methods": ["totp"],
  "enabled": true
}
```

### 12. Logout
`POST /api/auth/logout` with Bearer token

### 13. Debug Endpoints
- `GET /api/auth/admin/users`
- `GET /api/auth/debug/database-info`

## Common Error Cases

- Invalid login credentials:
```json
{
  "detail": "Invalid credentials"
}
```

- Invalid or expired token on protected endpoints:
```json
{
  "detail": "Invalid or expired token"
}
```

## Testing WebAuthn & Biometrics on Android Phone

WebAuthn requires a secure context (HTTPS or localhost). To test the biometric authentication flow on your Android phone while developing locally, use ngrok to create a public HTTPS tunnel.

### Prerequisites
- Android phone connected to same network as your PC
- [ngrok account and CLI](https://ngrok.com/) installed on your PC
- Phone has biometric capability (fingerprint, face recognition, or passkey support)

### Setup Steps

1. **Start the backend server:**
   ```bash
   cd backend
   .venv\Scripts\activate  # Windows
   uvicorn app.main:app --reload --port 8000
   ```

2. **In a new terminal, tunnel the backend with ngrok:**
   ```bash
   ngrok http 8000
   ```
   Ngrok will display a public HTTPS URL like `https://abc123.ngrok.io`. Copy this URL.

3. **In another terminal, start the frontend:**
   ```bash
   cd ui_framework/cloudlock_ui
   npm run dev
   ```
   Vite will run on `http://localhost:5173`.

4. **In a new terminal, tunnel the frontend with ngrok:**
   ```bash
   ngrok http 5173
   ```
   Note the frontend HTTPS URL (e.g., `https://def456.ngrok.io`).

5. **Update backend environment variables:**
   ```bash
   # In backend/.env, set:
   WEBAUTHN_RP_ID=abc123.ngrok.io
   WEBAUTHN_EXPECTED_ORIGINS=https://abc123.ngrok.io,https://def456.ngrok.io
   ```
   Stop and restart the backend to pick up the changes.

6. **On your Android phone:**
   - Open browser and navigate to `https://def456.ngrok.io` (the ngrok frontend URL)
   - Bypass any certificate warnings (ngrok uses valid HTTPS certs)
   - Navigate to **Sign Up**
   - Enable **Biometric MFA** in the MFA setup modal
   - Complete signup

7. **Enroll biometric credential:**
   - After signup, the browser will prompt: "Use your fingerprint, face, or passkey?"
   - Follow the on-screen biometric prompt
   - System will confirm enrollment once complete

8. **Test biometric login:**
   - Log out
   - Log back in with your credentials
   - When prompted for MFA, select **Biometric**
   - Authenticate with your fingerprint, face, or pattern
   - Verify you receive a session token (or image final authentication step if triggered)

### Troubleshooting

- **"Credential error" during enrollment:** Ensure WEBAUTHN_RP_ID matches your ngrok frontend domain exactly
- **Certificate warning on phone:** This is normal for self-hosted testing; tap "Advanced" and continue
- **Biometric prompt doesn't appear:** Phone may not have WebAuthn support; check Android version (8+) and device capabilities
- **Cross-device passkey issues:** ngrok tunnel URL counts as a different origin; credential must be enrolled on the same domain being accessed