# Copy this to .env and fill in your values

AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=your-pool-id-here
COGNITO_CLIENT_ID=your-client-id-here
USE_DYNAMODB=true
USERS_TABLE=PasswordManager-Users
DEVICES_TABLE=PasswordManager-Devices-dev
AUDIT_TABLE=PasswordManager-AuditLogs-dev
WEBAUTHN_RP_ID=127.0.0.1
WEBAUTHN_EXPECTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
JWT_SECRET_KEY=replace-this-with-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60