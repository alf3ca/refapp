# Referee Portal - Simple Deployment

A minimal Express.js application for quick deployment.

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:5000`

## Files

- `app.js` - Main application server
- `package-minimal.json` - Dependencies (rename to package.json to use)
- `views/` - EJS templates
- `static/` - CSS, JS assets
- `sessions/` - Session storage (auto-created)
- `uploads/` - File uploads (auto-created)

## Deployment

1. Install dependencies: `npm install`
2. Set environment variables:
   - `PORT` (default: 5000)
   - `SESSION_SECRET` (for sessions)
3. Run: `node app.js`

## Default Routes

- `GET /` - Home
- `GET /login` - Login page
- `GET /register` - Register page
- `POST /login` - Login handler
- `GET /dashboard` - Dashboard (requires session)
- `GET /logout` - Logout

## Requirements

- Node.js 14+
- Express.js
- EJS templates
- Session store

## Notes

- Uses file-based sessions (good for single server)
- Minimal configuration for quick deployment
- Add authentication backend as needed
