# CloudLock

<p align="center">
  <img src="assets/CloudLock_logo.png" width="800">
</p>

## Overview

CloudLock is a secure cloud-based password manager built with React, Python, SQL, and AWS. It enforces a zero-knowledge architecture, ensuring that all encryption and decryption occur client-side. The server never has access to passwords or master keys.

This project demonstrates secure system design principles, client-side cryptography, and modern cloud deployment practices.

---

## 🚀 Features

- 🔐 Zero-knowledge encryption (client-side cryptography)
- 🔑 Secure password generation
- 🧬 Biometric multi-factor authentication (WebAuthn)
- 📊 Audit logging and suspicious activity detection
- 🖥️ Device-based login recognition
- 🚫 Account lockout protection
- ☁️ AWS cloud deployment
- 🛡️ Injection-resistant authentication flows
- Physical key password integration

---

## 🏗️ Architecture

**Frontend**
- React
- Client-side encryption
- WebAuthn API integration

**Backend**
- Python (Flask / FastAPI)
- RESTful API
- Secure authentication handling

**Database**
- SQL database storing encrypted credential blobs

**Cloud Infrastructure**
- AWS (API Gateway, Lambda, optional RDS)

---

## 🔒 Security Model

VaultZero follows a zero-knowledge security model:
- All sensitive data is encrypted before transmission.
- The backend stores only encrypted data.
- The server cannot decrypt user credentials.

This ensures confidentiality even in the event of server compromise.

## Running CloudLock

This project supports two common workflows:
- Local development (frontend + backend on your machine)
- AWS deployment (frontend on S3/CloudFront, backend on Lambda/API Gateway)

---

## Local Development

### 1) Backend (FastAPI)

From the `backend` folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Useful local endpoints:
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health
- Example auth route: `POST /api/auth/register`
- Example vault route: `POST /api/vault/save`

### 2) Frontend (React + Vite)

From `ui_framework/cloudlock_ui`:

```powershell
npm install
npm run dev
```

Then open the Vite URL shown in the terminal (commonly http://localhost:5173).

### 3) Local integration notes

- Ensure frontend API configuration points to your local backend (for example, `http://localhost:8000`).
- If CORS issues appear, verify backend CORS settings in `backend/app/main.py` and frontend API base URL settings.

---

## AWS Deployment

### Backend on AWS (Lambda + API Gateway)

This backend is Lambda-compatible via Mangum. Typical deployment flow:

1. Package and deploy FastAPI app to AWS Lambda.
2. Attach API Gateway routes to the Lambda handler.
3. Configure required environment variables/secrets in Lambda.
4. Verify API Gateway base URL and health/auth/vault routes.

After deployment, test:
- `GET /health`
- Auth and vault endpoints through API Gateway URL

### Frontend on AWS (S3 + CloudFront)

From `ui_framework/cloudlock_ui`:

```powershell
npm install
npm run build
```

Then:
1. Upload build artifacts (typically from `dist/`) to your S3 static hosting bucket.
2. Configure CloudFront distribution with the S3 bucket as origin.
3. Point frontend API base URL to your API Gateway endpoint.
4. Invalidate CloudFront cache after updates.

### Deployment checklist

- Frontend points to AWS API base URL (not localhost)
- API Gateway routes are reachable
- CORS allows frontend origin
- CloudFront cache invalidated after each release
- Secrets are stored in AWS-managed configuration (not hard-coded)

---

## Quick Decision Guide

- Use **Local Development** when building features, testing UI changes, and debugging.
- Use **AWS Deployment** when validating production-like behavior and sharing live demos.