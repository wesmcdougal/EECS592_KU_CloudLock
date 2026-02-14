# Password Manager - Backend

FastAPI backend for zero-knowledge password manager.

## Setup Instructions

### 1. Prerequisites
- Python 3.11+

### 3. Create Virtual Environment
```bash
py -3.11 -m venv .venv
source venv/bin/activate  # macOS/Linux
# OR
venv\Scripts\activate     # Windows
```

### 4. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Run Locally
```bash
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/docs for API documentation.

## 6. API Testing Guide

### Test 1: Health Check
**Endpoint:** `GET /health`

1. Find GET /health
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "cloudlock-api",
  "version": "1.0.0"
}
```

---

### Test 2: Register User
**Endpoint:** `POST /api/auth/register`

1. Find POST /api/auth/register
2. Click "Try it out"
3. Copy and paste the following into Request body:
```json
{
  "email": "alice@example.com",
  "password": "AlicePass123!",
  "auth_image_id": "img_001"
}
```
4. Click "Execute"

**Expected Response (201 Created):**
```json
{
  "message": "User registered successfully",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "alice@example.com",
  "created_at": 1707953191,
  "email_verification_required": false
}
```

---

### Test 3: List All Users
**Endpoint:** `GET /api/auth/admin/users`

1. Find GET /api/auth/admin/users
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "total_users": 1,
  "users": [
    {
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "alice@example.com",
      "created_at": 1707953191,
      "account_status": "active",
      "last_login": null,
      "failed_attempts": 0
    }
  ]
}
```

---

### Test 4: Login User
**Endpoint:** `POST /api/auth/login`

1. Find POST /api/auth/login
2. Click "Try it out"
3. Copy and paste the following into Request body:
```json
{
  "email": "alice@example.com",
  "password": "AlicePass123!",
  "device_fingerprint": "my_laptop_123"
}
```
4. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "access_token": "token_abc123-def456-xyz789-ghijkl",
  "refresh_token": null,
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "alice@example.com",
  "requires_mfa": false
}
```

**⚠️ IMPORTANT:** Save the `access_token` for the following tests!

---

### Test 5: Get Current User Info
**Endpoint:** `GET /api/auth/me`

1. Click the **Authorize** button (top right)
2. Enter the token from Test 4 (without "Bearer" prefix)
3. Click "Authorize" and then "Close"
4. Find GET /api/auth/me
5. Click "Try it out"
6. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "alice@example.com",
  "created_at": 1707953191,
  "last_login": 1707953250,
  "account_status": "active"
}
```

---

### Test 6: Save Encrypted Vault
**Endpoint:** `POST /api/vault/save`

**⚠️ Ensure you're authorized (see Test 5)**

1. Find POST /api/vault/save
2. Click "Try it out"
3. Copy and paste the following into Request body:
```json
{
  "encrypted_vault": "dGVzdGVuY3J5cHRlZGRhdGE="
}
```
4. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "status": "saved",
  "timestamp": 1707953400
}
```

---

### Test 7: Retrieve Vault
**Endpoint:** `GET /api/vault/retrieve`

**⚠️ Ensure you're authorized (see Test 5)**

1. Find GET /api/vault/retrieve
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "encrypted_vault": "dGVzdGVuY3J5cHRlZGRhdGE=",
  "last_modified": 1707953400
}
```

---

### Test 8: Wrong Password (Error Case)
**Endpoint:** `POST /api/auth/login`

1. Find POST /api/auth/login
2. Click "Try it out"
3. Copy and paste the following into Request body:
```json
{
  "email": "alice@example.com",
  "password": "WrongPassword123!",
  "device_fingerprint": "test_device"
}
```
4. Click "Execute"

**Expected Response (401 Unauthorized):**
```json
{
  "detail": "Invalid email or password"
}
```

---

### Test 9: Duplicate Email (Error Case)
**Endpoint:** `POST /api/auth/register`

1. Find POST /api/auth/register
2. Click "Try it out"
3. Copy and paste the following into Request body:
```json
{
  "email": "alice@example.com",
  "password": "AnotherPass123!",
  "auth_image_id": "img_999"
}
```
4. Click "Execute"

**Expected Response (409 Conflict):**
```json
{
  "detail": "User with this email already exists"
}
```

---

### Test 10: Logout
**Endpoint:** `POST /api/auth/logout`

**⚠️ Ensure you're authorized (see Test 5)**

1. Find POST /api/auth/logout
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

---

### Test 11: Database Debug Info
**Endpoint:** `GET /api/auth/debug/database-info`

1. Find GET /api/auth/debug/database-info
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200 OK):**
```json
{
  "total_users": 1,
  "total_sessions": 0,
  "total_vaults": 1,
  "user_emails": [
    "alice@example.com"
  ],
  "users_detail": [
    {
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "alice@example.com",
      "created_at": 1707953191,
      "account_status": "active",
      "last_login": 1707953250,
      "failed_attempts": 1
    }
  ]
}
```    
            

