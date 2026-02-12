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