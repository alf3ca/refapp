require('dotenv').config();

async function resetDatabase() {
  try {
    console.log('🧹 Resetting database...\n');

    // Use PostgreSQL if DATABASE_URL is set, otherwise SQLite
    if (process.env.DATABASE_URL) {
      console.log('📦 Using PostgreSQL database');
      const { Pool } = require('pg');
      
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      const client = await pool.connect();
      
      try {
        console.log('🗑️  Deleting all users...');
        await client.query('DELETE FROM users');
        console.log('✅ All user accounts deleted');

        console.log('🗑️  Deleting all sessions...');
        await client.query('DELETE FROM session');
        console.log('✅ All sessions deleted');

        console.log('\n✨ Database reset complete!');
      } finally {
        client.release();
        await pool.end();
      }
    } else {
      console.log('📦 Using SQLite database');
      const Database = require('better-sqlite3');
      const dbPath = path.join(__dirname, '../referees.db');
      
      const db = new Database(dbPath);

      try {
        console.log('🗑️  Deleting all users...');
        db.exec('DELETE FROM users');
        console.log('✅ All user accounts deleted');
      } catch (tableErr) {
        if (tableErr.message.includes('no such table')) {
          console.log('ℹ️  No users table found (database empty)');
        } else {
          throw tableErr;
        }
      }

      db.close();
      console.log('\n✨ Database reset complete!');
    }
  } catch (err) {
    console.error('❌ Error resetting database:', err.message);
    process.exit(1);
  }
}

const path = require('path');
resetDatabase();
