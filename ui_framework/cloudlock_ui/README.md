# CloudLock UI Frontend

React and Vite frontend for CloudLock zero-knowledge password manager.

## Tech Stack

- React 19
- Vite 7
- React Router
- React Hook Form
- ESLint 9

## Setup

From this folder:

```bash
cd ui_framework/cloudlock_ui
```

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Default app URL:

- http://127.0.0.1:5173

## Build and Preview

```bash
npm run build
npm run preview
```

## Environment Variables

Create a .env file in this folder as needed.

- VITE_API_BASE_URL
  - Default: /api
  - Used by src/api/apiService.js to build all API requests.
  - In dev, /api is proxied to http://127.0.0.1:8000 by Vite.

- VITE_DEV_BYPASS_AUTH
  - Optional: true or false
  - When true in development and no master key is present, main vault page can run in preview mode.

Example:

```env
VITE_API_BASE_URL=/api
VITE_DEV_BYPASS_AUTH=false
```

## Local Development with Backend

Expected backend URL in local dev:

- http://127.0.0.1:8000

The Vite dev proxy forwards /api requests to backend automatically. You can run both apps separately:

1. Backend: uvicorn app.main:app --reload --port 8000
2. Frontend: npm run dev

## App Routes

- /: Home
- /login: Login page
- /signup: Signup page
- /main: Protected vault page
- /recovery: Recovery page

## Core Features

- Zero-knowledge login and signup payload construction in src/api/authApi.js.
- Access token persistence in localStorage key cloudlock_token.
- Protected route guard for main vault.
- Vault encryption and decryption with envelope crypto utilities.
- Offline unlock flow using cached encrypted vault when available.
- MFA and image-auth follow-up support after login challenges.
- Service worker registration in production for app-shell caching.

## API Integration Notes

- API client lives in src/api/apiService.js.
- Auth header is attached automatically when token exists.
- Request timeout and error normalization are handled centrally.
- On login or verification success, access token is stored automatically.

## Useful Scripts

- npm run dev: Start dev server
- npm run build: Production build
- npm run preview: Preview built output
- npm run lint: Lint codebase

## Troubleshooting

- If UI cannot reach backend, confirm backend is running on 127.0.0.1:8000 or set VITE_API_BASE_URL explicitly.
- If auth appears stale, clear localStorage key cloudlock_token and log in again.
- If offline unlock fails, ensure a vault was synced online at least once so encrypted cache exists.