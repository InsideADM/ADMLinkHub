const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const config = require('./config');

const dbDir = path.dirname(config.dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, {
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

function timestamp() {
    return new Date().toISOString();
}

function createSession(phoneNumber) {
    const time = timestamp();

    db.prepare(`
        INSERT INTO sessions (
            phone_number,
            status,
            created_at,
            updated_at
        )
        VALUES (?, 'disconnected', ?, ?)
        ON CONFLICT(phone_number)
        DO UPDATE SET
            updated_at = excluded.updated_at
    `).run(
        phoneNumber,
        time,
        time
    );

    return getSession(phoneNumber);
}

function updateSessionStatus(
    phoneNumber,
    status
) {
    db.prepare(`
        UPDATE sessions
        SET
            status = ?,
            updated_at = ?
        WHERE phone_number = ?
    `).run(
        status,
        timestamp(),
        phoneNumber
    );

    return getSession(phoneNumber);
}

function getSession(phoneNumber) {
    return db.prepare(`
        SELECT
            id,
            phone_number,
            status,
            created_at,
            updated_at
        FROM sessions
        WHERE phone_number = ?
    `).get(phoneNumber) || null;
}

function getAllSessions() {
    return db.prepare(`
        SELECT
            id,
            phone_number,
            status,
            created_at,
            updated_at
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
