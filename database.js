const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const config = require('./config');

const dbDir =
    path.dirname(config.dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, {
        recursive: true
    });
}

const db =
    new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'disconnected',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_phone
    ON sessions(phone_number)
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON sessions(status)
`);

function normalizeNumber(phoneNumber) {
    return String(
        phoneNumber || ''
    ).replace(/\D/g, '');
}

function timestamp() {
    return new Date().toISOString();
}

function createSession(phoneNumber) {
    const number =
        normalizeNumber(phoneNumber);

    if (!number) {
        throw new Error(
            'Invalid phone number'
        );
    }

    const time =
        timestamp();

    db.prepare(`
        INSERT INTO sessions (
            phone_number,
            status,
            created_at,
            updated_at
        )
        VALUES (
            ?,
            'disconnected',
            ?,
            ?
        )
        ON CONFLICT(phone_number)
        DO UPDATE SET
            updated_at = excluded.updated_at
    `).run(
        number,
        time,
        time
    );

    return getSession(number);
}

function updateSessionStatus(
    phoneNumber,
    status
) {
    const number =
        normalizeNumber(phoneNumber);

    if (!number) {
        throw new Error(
            'Invalid phone number'
        );
    }

    if (!status) {
        throw new Error(
            'Session status is required'
        );
    }

    const allowedStatuses = [
        'disconnected',
        'connecting',
        'waiting',
        'connected',
        'logged_out'
    ];

    if (
        !allowedStatuses.includes(
            status
        )
    ) {
        throw new Error(
            `Invalid session status: ${status}`
        );
    }

    const existing =
        getSession(number);

    if (!existing) {
        createSession(number);
    }

    db.prepare(`
        UPDATE sessions
        SET
            status = ?,
            updated_at = ?
        WHERE phone_number = ?
    `).run(
        status,
        timestamp(),
        number
    );

    return getSession(number);
}

function getSession(phoneNumber) {
    const number =
        normalizeNumber(phoneNumber);

    if (!number) {
        return null;
    }

    return db.prepare(`
        SELECT
            id,
            phone_number,
            status,
            created_at,
            updated_at
        FROM sessions
        WHERE phone_number = ?
    `).get(number) || null;
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

function getSessionsByStatus(status) {
    return db.prepare(`
        SELECT
            id,
            phone_number,
            status,
            created_at,
            updated_at
        FROM sessions
        WHERE status = ?
        ORDER BY id ASC
    `).all(status);
}

function deleteSession(phoneNumber) {
    const number =
        normalizeNumber(phoneNumber);

    if (!number) {
        return false;
    }

    const result =
        db.prepare(`
            DELETE FROM sessions
            WHERE phone_number = ?
        `).run(number);

    return result.changes > 0;
}

function sessionExists(phoneNumber) {
    const number =
        normalizeNumber(phoneNumber);

    if (!number) {
        return false;
    }

    const row =
        db.prepare(`
            SELECT 1
            FROM sessions
            WHERE phone_number = ?
            LIMIT 1
        `).get(number);

    return !!row;
}

function countSessions() {
    const row =
        db.prepare(`
            SELECT COUNT(*) AS count
            FROM sessions
        `).get();

    return row.count;
}

function closeDatabase() {
    if (db.open) {
        db.close();
    }
}

module.exports = {
    db,
    createSession,
    updateSessionStatus,
    getSession,
    getAllSessions,
    getSessionsByStatus,
    deleteSession,
    sessionExists,
    countSessions,
    closeDatabase
};
