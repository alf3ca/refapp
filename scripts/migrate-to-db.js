#!/usr/bin/env node

/**
 * Migration script to move accounts from JSON to SQLite
 * Run: node scripts/migrate-to-db.js
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../lib/db');

const ACCOUNTS_FILE = path.join(__dirname, '..', 'accounts.json');

async function migrateAccounts() {
  console.log('🔄 Starting migration from JSON to SQLite...');
  
  try {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      console.log('✅ No accounts.json found - skipping migration');
      process.exit(0);
    }

    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const referees = data.referees || [];

    if (referees.length === 0) {
      console.log('✅ No accounts to migrate');
      process.exit(0);
    }

    console.log(`📦 Found ${referees.length} accounts to migrate`);

    // Initialize database
    db.initializeDatabase();

    // Wait a moment for db to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    let successCount = 0;
    let skipCount = 0;

    for (const referee of referees) {
      try {
        // Check if user already exists
        const existing = await db.getUserByUsername(referee.username);
        if (existing) {
          console.log(`⏭️  Skipping ${referee.username} - already exists`);
          skipCount++;
          continue;
        }

        // Hash the password
        const passwordHash = await new Promise((resolve, reject) => {
          bcrypt.hash(referee.password, 10, (err, hash) => {
            if (err) reject(err);
            else resolve(hash);
          });
        });

        // Create user record directly with passwordHash
        const db_instance = db.getDb();
        const query = `
          INSERT INTO users (username, email, passwordHash, name, experience, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        await new Promise((resolve, reject) => {
          db_instance.run(query, [
            referee.username,
            referee.email,
            passwordHash,
            referee.name,
            referee.experience || 'Not specified',
            referee.createdAt || new Date().toISOString()
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        console.log(`✅ Migrated: ${referee.username}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Error migrating ${referee.username}:`, err.message);
      }
    }

    console.log(`\n📊 Migration Complete:`);
    console.log(`   ✅ Migrated: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   📦 Total: ${referees.length}`);

    // Backup the original file
    const backupPath = `${ACCOUNTS_FILE}.backup`;
    fs.copyFileSync(ACCOUNTS_FILE, backupPath);
    console.log(`\n📁 Original file backed up to: ${backupPath}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateAccounts();
