const fs = require('fs');
const path = require('path');

const config = require('./config');

const baseDir = path.resolve(
    process.cwd(),
    config.sessionDir
);

function normalizeNumber(number) {
    return String(number || '').replace(/\D/g, '');
}

function getSessionDir(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error(
            'Invalid phone number'
        );
    }

    return path.join(
        baseDir,
        phoneNumber
    );
}

function ensureSessionDir(number) {
    const dir =
        getSessionDir(number);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }

    return dir;
}

function sessionExists(number) {
    const dir =
        getSessionDir(number);

    if (!fs.existsSync(dir)) {
        return false;
    }

    const files =
        fs.readdirSync(dir);

    return files.length > 0;
}

function listSessions() {
    if (!fs.existsSync(baseDir)) {
        return [];
    }

    return fs.readdirSync(baseDir)
        .filter(name => {
            const fullPath =
                path.join(
                    baseDir,
                    name
                );

            return fs.statSync(
                fullPath
            ).isDirectory();
        });
}

function deleteSession(number) {
    const dir =
        getSessionDir(number);

    if (fs.existsSync(dir)) {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    }

    return true;
}

function getSessionFile(
    number,
    fileName
) {
    const dir =
        getSessionDir(number);

    return path.join(
        dir,
        fileName
    );
}

function readSessionFile(
    number,
    fileName
) {
    const file =
        getSessionFile(
            number,
            fileName
        );

    if (!fs.existsSync(file)) {
        return null;
    }

    return fs.readFileSync(
        file,
        'utf8'
    );
}

function writeSessionFile(
    number,
    fileName,
    data
) {
    const dir =
        ensureSessionDir(number);

    const file =
        path.join(
            dir,
            fileName
        );

    fs.writeFileSync(
        file,
        data
    );

    return true;
}

module.exports = {
    normalizeNumber,
    getSessionDir,
    ensureSessionDir,
    sessionExists,
    listSessions,
    deleteSession,
    getSessionFile,
    readSessionFile,
    writeSessionFile
};
