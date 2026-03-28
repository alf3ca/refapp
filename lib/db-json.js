const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Use persistent disk on Render, local path for development
const ACCOUNTS_DIR = process.env.NODE_ENV === 'production' ? '/mnt/data' : path.join(__dirname, '..');
const ACCOUNTS_FILE = path.join(ACCOUNTS_DIR, 'accounts.json');

console.log('🔍 DEBUG: ACCOUNTS_DIR =', ACCOUNTS_DIR);
console.log('🔍 DEBUG: ACCOUNTS_FILE =', ACCOUNTS_FILE);

// Ensure directory exists
if (!fs.existsSync(ACCOUNTS_DIR)) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
}

// Initialize accounts file if it doesn't exist
function ensureAccountsFile() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

// Read accounts with proper file handling
function readAccounts() {
  try {
    ensureAccountsFile();
    const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    console.log('📂 readAccounts from:', ACCOUNTS_FILE);
    console.log('   Found users:', parsed.users.length);
    if (parsed.users.length > 0) {
      console.log('   Users:', parsed.users.map(u => u.username).join(', '));
    }
    return parsed;
  } catch (err) {
    console.error('Error reading accounts:', err.message);
    return { users: [] };
  }
}

// Write accounts with proper file handling
function writeAccounts(data) {
  try {
    console.log('✍️  writeAccounts called');
    console.log('   Path:', ACCOUNTS_FILE);
    console.log('   Dir exists:', fs.existsSync(ACCOUNTS_DIR));
    console.log('   Users to write:', data.users.length);
    
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
    console.log('✅ writeAccounts SUCCESS - file written');
    
    // Verify it was actually written
    const verify = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    const verifyParsed = JSON.parse(verify);
    console.log('✅ Verification: file has', verifyParsed.users.length, 'users');
  } catch (err) {
    console.error('❌ Error writing accounts:', err.message);
    console.error('   Stack:', err.stack);
    throw err;
  }
}

function getDb() {
  return { readAccounts, writeAccounts };
}

function initializeDatabase() {
  console.log('✅ JSON accounts file initialized');
  ensureAccountsFile();
}

// Create a new user
function createUser(userData) {
  const { username, email, password, name, experience = 'Not specified' } = userData;
  
  console.log('📝 createUser called for:', username);
  const passwordHash = bcrypt.hashSync(password, 10);
  
  try {
    const accounts = readAccounts();
    
    // Check if username exists
    if (accounts.users.some(u => u.username === username)) {
      throw new Error('Username already exists');
    }
    
    // Check if email exists
    if (accounts.users.some(u => u.email === email)) {
      throw new Error('Email already registered');
    }
    
    const newUser = {
      id: accounts.users.length > 0 ? Math.max(...accounts.users.map(u => u.id)) + 1 : 1,
      username,
      email,
      name,
      passwordHash,
      experience,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    accounts.users.push(newUser);
    writeAccounts(accounts);
    
    console.log('✅ User created successfully. ID:', newUser.id);
    return { id: newUser.id, username, email, name, experience };
  } catch (err) {
    console.error('❌ Error creating user:', err.message);
    throw err;
  }
}

// Get user by username
function getUserByUsername(username) {
  const accounts = readAccounts();
  const user = accounts.users.find(u => u.username === username);
  
  if (user) {
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

// Get user by email
function getUserByEmail(email) {
  const accounts = readAccounts();
  const user = accounts.users.find(u => u.email === email);
  
  if (user) {
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

// Get user by ID
function getUserById(id) {
  const accounts = readAccounts();
  const user = accounts.users.find(u => u.id === id);
  
  if (user) {
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

// Verify password
function verifyPassword(password, username) {
  const accounts = readAccounts();
  const user = accounts.users.find(u => u.username === username);
  
  if (!user) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

// Check username availability
function checkUsernameAvailability(username) {
  const accounts = readAccounts();
  return !accounts.users.some(u => u.username === username);
}

// Check email availability
function checkEmailAvailability(email) {
  const accounts = readAccounts();
  return !accounts.users.some(u => u.email === email);
}

// Update user
function updateUser(id, updates) {
  const accounts = readAccounts();
  const userIndex = accounts.users.findIndex(u => u.id === id);
  
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  const user = accounts.users[userIndex];
  
  // Update allowed fields only
  if (updates.name) user.name = updates.name;
  if (updates.experience) user.experience = updates.experience;
  if (updates.email) {
    // Check if email is already used by another user
    if (accounts.users.some(u => u.id !== id && u.email === updates.email)) {
      throw new Error('Email already in use');
    }
    user.email = updates.email;
  }
  
  user.updatedAt = new Date().toISOString();
  
  writeAccounts(accounts);
  
  const { passwordHash, ...userWithoutPassword } = user;
  return userWithoutPassword;
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
