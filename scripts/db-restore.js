#!/usr/bin/env node

/**
 * Database Restore Script
 * Restores from a backup file.
 *
 * Usage (inside backend container):
 *   node scripts/db-restore.js backups/backup-2026-03-06T12-00-00.sql
 *
 * Usage (from host via Docker):
 *   docker compose exec backend node scripts/db-restore.js backups/backup-2026-03-06T12-00-00.sql
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
    try {
        require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    } catch (_) { /* ignore */ }

    if (!process.env.DATABASE_URL) {
        console.error('ERROR: DATABASE_URL not set. Run this inside the backend container or set DATABASE_URL.');
        process.exit(1);
    }
}

const backupFile = process.argv[2];
if (!backupFile) {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql')).sort().reverse();
        if (files.length > 0) {
            console.log('Available backups:');
            files.forEach(f => {
                const size = (fs.statSync(path.join(backupDir, f)).size / 1024).toFixed(1);
                console.log(`  node scripts/db-restore.js backups/${f}  (${size} KB)`);
            });
        } else {
            console.log('No backups found. Run db-backup.js first.');
        }
    }
    console.error('\nUsage: node scripts/db-restore.js <backup-file>');
    process.exit(1);
}

const resolvedFile = path.resolve(backupFile);
if (!fs.existsSync(resolvedFile)) {
    console.error(`ERROR: Backup file not found: ${resolvedFile}`);
    process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const url = new URL(dbUrl);
const host = url.hostname;
const port = url.port || '5432';
const user = url.username;
const password = url.password;
const dbName = url.pathname.slice(1);

console.log(`\nWARNING: This will OVERWRITE the current database with the backup.`);
console.log(`Database: ${dbName}@${host}:${port}`);
console.log(`Backup:   ${resolvedFile}\n`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Type "yes" to continue: ', (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
        console.log('Restore cancelled.');
        process.exit(0);
    }

    try {
        execSync(
            `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${dbName} -f "${resolvedFile}"`,
            { stdio: 'inherit' }
        );
        console.log('\nDatabase restored successfully.');
    } catch (error) {
        console.error('\nRestore FAILED:', error.message);
        process.exit(1);
    }
});
