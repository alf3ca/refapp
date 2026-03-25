# ⚽ Referee Portal (JavaScript)

A web-based referee management portal built with Node.js, Express, EJS, and JSON account storage.

## Features

- Account registration and login
- Referee dashboard and directory
- Profile editing with persistence to `accounts.json`
- Session-based auth protection
- Responsive UI

## Tech Stack

- Node.js
- Express
- EJS
- express-session

## Project Structure

```
test/
├── server.js
├── package.json
├── accounts.json
├── static/
│   └── style.css
└── views/
    ├── login.ejs
    ├── register.ejs
    ├── dashboard.ejs
    ├── profile.ejs
    └── referees.ejs
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open:

`http://localhost:5000`

## Notes

- `accounts.json` starts empty, so create an account first via `/register`.
- For production, hash passwords and move to a real database.
