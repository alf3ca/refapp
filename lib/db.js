const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, '..', 'referees.db');
let db = null;

function getDb() {
  if (!db) {
    try {
      db = new Database(DB_PATH);
      // Only use WAL mode in development; Render's filesystem has issues with it
      if (process.env.NODE_ENV !== 'production') {
        db.pragma('journal_mode = WAL');
      }
      console.log('✅ Connected to SQLite database');
    } catch (err) {
      console.error('Error opening database:', err);
      throw err;
    }
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();
  
  try {
    // Create users table
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        passwordHash TEXT NOT NULL,
        name TEXT NOT NULL,
        experience TEXT DEFAULT 'Not specified',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table ready');

    // Create indexes for faster lookups
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_email ON users(email);
    `);
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// User operations
function createUser(userData) {
  const { username, email, password, name, experience = 'Not specified' } = userData;
  
  const passwordHash = bcrypt.hashSync(password, 10);
  const database = getDb();
  
  try {
    const stmt = database.prepare(`
      INSERT INTO users (username, email, passwordHash, name, experience)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(username, email, passwordHash, name, experience);
    return { id: result.lastInsertRowid, username, email, name, experience };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: users.username')) {
      throw new Error('Username already exists');
    } else if (err.message.includes('UNIQUE constraint failed: users.email')) {
      throw new Error('Email already registered');
    } else {
      throw err;
    }
  }
}

function getUserByUsername(username) {
  const database = getDb();
  const stmt = database.prepare(`SELECT * FROM users WHERE LOWER(username) = LOWER(?)`);
  return stmt.get(username);
}

function getUserByEmail(email) {
  const database = getDb();
  const stmt = database.prepare(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`);
  return stmt.get(email);
}

function getUserById(id) {
  const database = getDb();
  const stmt = database.prepare(`SELECT * FROM users WHERE id = ?`);
  return stmt.get(id);
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compareSync(password, passwordHash);
}

function checkUsernameAvailability(username) {
  const database = getDb();
  const stmt = database.prepare(`SELECT COUNT(*) as count FROM users WHERE LOWER(username) = LOWER(?)`);
  const result = stmt.get(username);
  return result.count === 0;
}

function checkEmailAvailability(email) {
  const database = getDb();
  const stmt = database.prepare(`SELECT COUNT(*) as count FROM users WHERE LOWER(email) = LOWER(?)`);
  const result = stmt.get(email);
  return result.count === 0;
}

function updateUser(id, userData) {
  const database = getDb();
  const { name, experience } = userData;
  const stmt = database.prepare(`UPDATE users SET name = ?, experience = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`);
  
  const result = stmt.run(name, experience, id);
  return { changes: result.changes };
}

module.exports = {
  getDb,
  initializeDatabase,
  createUser,
  getUserByUsername,
  getUserByEmail,
  getUserById,
  verifyPassword,
  checkUsernameAvailability,
  checkEmailAvailability,
  updateUser
};
