const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, '..', 'referees.db');
let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('✅ Connected to SQLite database');
      }
    });
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();
  
  database.serialize(() => {
    // Create users table
    database.run(`
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
    `, (err) => {
      if (err) {
        console.error('Error creating users table:', err);
      } else {
        console.log('✅ Users table ready');
      }
    });

    // Create index for faster lookups
    database.run(`
      CREATE INDEX IF NOT EXISTS idx_username ON users(username)
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_email ON users(email)
    `);
  });
}

// User operations
async function createUser(userData) {
  return new Promise((resolve, reject) => {
    const { username, email, password, name, experience = 'Not specified' } = userData;
    
    bcrypt.hash(password, 10, (err, passwordHash) => {
      if (err) {
        reject(err);
        return;
      }

      const db_instance = getDb();
      const query = `
        INSERT INTO users (username, email, passwordHash, name, experience)
        VALUES (?, ?, ?, ?, ?)
      `;

      db_instance.run(query, [username, email, passwordHash, name, experience], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed: users.username')) {
            reject(new Error('Username already exists'));
          } else if (err.message.includes('UNIQUE constraint failed: users.email')) {
            reject(new Error('Email already registered'));
          } else {
            reject(err);
          }
        } else {
          resolve({ id: this.lastID, username, email, name, experience });
        }
      });
    });
  });
}

async function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    const db_instance = getDb();
    const query = `SELECT * FROM users WHERE LOWER(username) = LOWER(?)`;
    
    db_instance.get(query, [username], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const db_instance = getDb();
    const query = `SELECT * FROM users WHERE LOWER(email) = LOWER(?)`;
    
    db_instance.get(query, [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function getUserById(id) {
  return new Promise((resolve, reject) => {
    const db_instance = getDb();
    const query = `SELECT * FROM users WHERE id = ?`;
    
    db_instance.get(query, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function verifyPassword(password, passwordHash) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(password, passwordHash, (err, isValid) => {
      if (err) reject(err);
      else resolve(isValid);
    });
  });
}

async function checkUsernameAvailability(username) {
  return new Promise((resolve, reject) => {
    const db_instance = getDb();
    const query = `SELECT COUNT(*) as count FROM users WHERE LOWER(username) = LOWER(?)`;
    
    db_instance.get(query, [username], (err, row) => {
      if (err) reject(err);
      else resolve(row.count === 0);
    });
  });
}

async function checkEmailAvailability(email) {
  return new Promise((resolve, reject) => {
    const db_instance = getDb();
    const query = `SELECT COUNT(*) as count FROM users WHERE LOWER(email) = LOWER(?)`;
    
    db_instance.get(query, [email], (err, row) => {
      if (err) reject(err);
      else resolve(row.count === 0);
    });
  });
}

async function updateUser(id, userData) {
  return new Promise((resolve, reject) => {
    const db_instance = getDb();
    const { name, experience } = userData;
    const query = `UPDATE users SET name = ?, experience = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`;
    
    db_instance.run(query, [name, experience, id], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
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
