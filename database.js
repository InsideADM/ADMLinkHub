const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const config = require('./config');

const dbDirectory = path.dirname(config.dbPath);

if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory, {
        recursive: true
    });
}

const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'disconnected',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
`);

function now() {
    return new Date().toISOString();
}

function createSession(phoneNumber) {
    const timestamp = now();

    db.prepare(`
        INSERT INTO sessions (
            phone_number,
            status,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(phone_number)
        DO UPDATE SET
            updated_at = excluded.updated_at
    `).run(
        phoneNumber,
        'disconnected',
        timestamp,
        timestamp
    );

    return getSession(phoneNumber);
}

function updateSessionStatus(phoneNumber, status) {
    db.prepare(`
        UPDATE sessions
        SET
            status = ?,
            updated_at = ?
        WHERE phone_number = ?
    `).run(
        status,
        now(),
        phoneNumber
    );

    return getSession(phoneNumber);
}

function getSession(phoneNumber) {
    return db.prepare(`
        SELECT *
        FROM sessions
        WHERE phone_number = ?
    `).get(phoneNumber) || null;
}

function getAllSessions() {
    return db.prepare(`
        SELECT *
        FROM sessions
        ORDER BY id ASC
    `).all();
}

function deleteSession(phoneNumber) {
    db.prepare(`
        DELETE FROM sessions
        WHERE phone_number = ?
    `).run(phoneNumber);

    return true;
}

module.exports = {
    db,
    createSession,
    updateSessionStatus,
    getSession,
    getAllSessions,
    deleteSession
};
