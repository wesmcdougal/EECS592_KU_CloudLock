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

### 6. Run Tests on the localhost:8000
    #### Test 1: Health Check (ENDPOINT: Get /health)
        ##### 1. Find GET /health
        ##### 2. Click "Try it out"
        ##### 3. Click Execute
        Expected Response (200 OK)
        ```bash
        {
        "status": "healthy",
        "service": "cloudlock-api",
        "version": "1.0.0"
        }
        ```

    #### Test 2: Register User (ENDPOINT: POST /api/auth/register)
        ##### 1. Find POST /api/auth/register
        ##### 2. Click "Try it out"
        ##### 3. Copy and paste the following into Request body:
        ```bash
        {
        "email": "alice@example.com",
        "password": "AlicePass123!",
        "auth_image_id": "img_001"
        }
        ```
        ##### 4. Click Execute
        Expected Response (201 Created)
        ```bash
        {
        "message": "User registered successfully",
        "user_id": "123e4567-e89b-12d3-a456-426614174000",   <== Randomized
        "email": "alice@example.com",
        "created_at": 1707953191 <== example time
        }
        ```

    #### Test 3: Check User in Domain (ENDPOINT: GET /api/auth/admin/users)
        ##### 1. Find GET /api/auth/admin/users
        ##### 2. Click "Try it out"
        ##### 3. Click Execute
        Expected Response (200 OK)
        ```bash
        {
        "total_users": 1,
        "users": [
            {
            "user_id": "123e4567-e89b-12d3-a456-426614174000",     <== Randomized
            "email": "alice@example.com",
            "created_at": 1707953191,    <== example time
            "account_status": "active",
            "last_login": null,
            "failed_attempts": 0
            }
        ]
        }
        ```

    #### Test 4: Login User (ENDPOINT: POST /api/auth/login)
        ##### 1. Find POST /api/auth/login
        ##### 2. Click "Try it out"
        ##### 3. Copy and paste the following into Request body:
        ```bash
        {
        "email": "alice@example.com",
        "password": "AlicePass123!",
        "device_fingerprint": "my_laptop_123"
        }
        ```
        ##### 4. Click Execute
        Expected Response (200 OK)
        ```bash
        {
        "access_token": "token_abc123-def456-xyz789-ghijkl", <== SAVE THIS FOR LATER TESTS
        "refresh_token": null,
        "user_id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "alice@example.com",
        "requires_mfa": false
        }
        ```

    #### Test 5: Login User (ENDPOINT: GET /api/auth/me)
        ##### 1. Click Authorize button located top right
        ##### 2. Enter the token from Test 4.
        ##### 3. Click Authorize and Click Close
        ##### 4. Go to GET /api/auth/me
        ##### 5. Click "Try it out"
        ##### 6. Click Execute

        Expected Response (200 OK)
        ```bash
        {
        "user_id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "alice@example.com",
        "created_at": 1707953191,    <== example time
        "last_login": 1707953250,    <== example time
        "account_status": "active"
        }
        ```
    #### Test 6: Save Vault (ENDPOINT: POST /api/vault/save)
        ##### 1. Ensure you're authorized
        ##### 2. Find POST /api/vault/save
        ##### 3. Click "Try it out"
        ##### 4. Copy and paste the following into Request body:
        ```bash
        {
        "encrypted_vault": "dGVzdGVuY3J5cHRlZGRhdGE="
        }
        ```
        ##### 5. Click "Execute"

        Expected Response (200 OK)
        ```bash
        {
        "status": "saved",
        "timestamp": 1707953400    <== example time
        }
        ```

    #### Test 7: Retreive Vault (ENDPOINT: GET /api/vault/retrieve)
        ##### 1. Ensure you're authorized
        ##### 2. Find GET /api/vault/retrieve
        ##### 3. Click "Try it out"
        ##### 4. Click "Execute"

        Expected Response (200 OK)
        ```bash
        {
        "encrypted_vault": "dGVzdGVuY3J5cHRlZGRhdGE=",
        "last_modified": 1707953400   <== example time
        }
        ```


    #### Test 8: Wrong Password (ENDPOINT: POST /api/auth/login)
        ##### 1. find POST /api/auth/login
        ##### 2. Click "Try it out"
        ##### 3. Copy and paste this into Request body:
        ```bash
        {
        "email": "alice@example.com",
        "password": "WrongPassword123!",
        "device_fingerprint": "test_device"
        }
        ```
        ##### 4. Click "Execute"

        Expected Response (200 OK)
        ```bash
        {
        "detail": "Invalid email or password"
        }
        ```

    #### Test 9: Duplicate Email (ENDPOINT: POST /api/auth/register)
        ##### 1. Find POST /api/auth/register
        ##### 2. Click "Try it out"
        ##### 3. Copy and paste this into Request body:
        ```bash
        {
        "email": "alice@example.com",
        "password": "AnotherPass123!",
        "auth_image_id": "img_999"
        }
        ```
        ##### 4. Click "Execute"

        Expected Response (200 OK)
        ```bash
        {
        "detail": "User with this email already exists"
        }
        ```

    #### Test 10: Logout (ENDPOINT: POST /api/auth/logout)
        ##### 1. Ensure you are authorized
        ##### 2. Find POST /api/auth/logout
        ##### 3. Click "Try it out"
        ##### 4. Click "Execute"

        Expected Response (200 OK)
        ```bash
        {
        "message": "Logged out successfully"
        }
        ```

    #### Test 11: Logout (ENDPOINT: GET /api/auth/debug/database-info)
        ##### 1. Find GET /api/auth/debug/database-info
        ##### 2. Click "Try it out"
        ##### 3. Click "Execute"

        Expected Response (200 OK)
        ```bash
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
            "created_at": 1707953191,      <== example time
            "account_status": "active",
            "last_login": 1707953250,      <== example time
            "failed_attempts": 1
            }
        ]
        }
        ```    
            

