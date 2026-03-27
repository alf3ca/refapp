const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// PostgreSQL connection pool - shared across the app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/refapp',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

function getDb() {
  return pool;
}

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Initializing PostgreSQL database...');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL COLLATE "C",
        email VARCHAR(255) UNIQUE NOT NULL COLLATE "C",
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        experience VARCHAR(255) DEFAULT 'Not specified',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email ON users(email)`);
    
    console.log('✅ PostgreSQL database initialized');
  } catch (err) {
    console.error('❌ Error initializing database:', err.message);
  } finally {
    client.release();
  }
}

async function createUser(userData) {
  const { username, email, password, name, experience = 'Not specified' } = userData;
  
  console.log('📝 createUser called for:', username);
  const passwordHash = bcrypt.hashSync(password, 10);
  
  try {
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, name, experience)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, name, experience`
    , [username, email, passwordHash, name, experience]);
    
    console.log('✅ User inserted successfully. ID:', result.rows[0].id);
    return result.rows[0];
  } catch (err) {
    console.error('❌ Database error in createUser:', err.message);
    if (err.message.includes('duplicate key value violates unique constraint "users_username_key"')) {
      throw new Error('Username already exists');
    } else if (err.message.includes('duplicate key value violates unique constraint "users_email_key"')) {
      throw new Error('Email already registered');
    } else {
      throw err;
    }
  }
}

async function getUserByUsername(username) {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Looking up user by username:', username);
    const result = await client.query(
      `SELECT id, username, email, name, experience, password_hash FROM users 
       WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    
    const user = result.rows[0];
    console.log('Result:', user ? '✅ User found' : '❌ User not found');
    return user;
  } finally {
    client.release();
  }
}

async function getUserByEmail(email) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getUserById(id) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT id, username, email, name, experience FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compareSync(password, passwordHash);
}

async function checkUsernameAvailability(username) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT COUNT(*) as count FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    return parseInt(result.rows[0].count, 10) === 0;
  } finally {
    client.release();
  }
}

async function checkEmailAvailability(email) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT COUNT(*) as count FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    return parseInt(result.rows[0].count, 10) === 0;
  } finally {
    client.release();
  }
}

async function updateUser(id, userData) {
  const { name, experience } = userData;
  
  try {
    const result = await pool.query(
      `UPDATE users SET name = $1, experience = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3
       RETURNING id, username, email, name, experience`,
      [name, experience, id]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Error updating user:', err);
    throw err;
  }
}

module.exports = {
  getDb,
  pool, // Export pool so session store can use the same connection
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
