const fs = require('fs');
const path = require('path');

const config = require('./config');

const baseDir = path.resolve(
    process.cwd(),
    config.sessionDir
);

if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, {
        recursive: true
    });
}

function normalizeNumber(number) {
    return String(
        number || ''
    ).replace(/\D/g, '');
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

    fs.mkdirSync(dir, {
        recursive: true
    });

    return dir;
}

function sessionExists(number) {
    const dir =
        getSessionDir(number);

    if (!fs.existsSync(dir)) {
        return false;
    }

    try {
        return fs
            .readdirSync(dir)
            .length > 0;
    } catch {
        return false;
    }
}

function listSessions() {
    if (!fs.existsSync(baseDir)) {
        return [];
    }

    try {
        return fs
            .readdirSync(
                baseDir,
                {
                    withFileTypes: true
                }
            )
            .filter(
                entry =>
                    entry.isDirectory()
            )
            .map(
                entry =>
                    entry.name
            )
            .filter(
                name =>
                    /^\d+$/.test(name)
            );
    } catch {
        return [];
    }
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
    if (
        !fileName ||
        typeof fileName !==
            'string'
    ) {
        throw new Error(
            'Invalid session file name'
        );
    }

    const dir =
        getSessionDir(number);

    return path.join(
        dir,
        path.basename(fileName)
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

    try {
        return fs.readFileSync(
            file,
            'utf8'
        );
    } catch (error) {
        console.error(
            'Session file read error:',
            error.message
        );

        return null;
    }
}

function writeSessionFile(
    number,
    fileName,
    data
) {
    const dir =
        ensureSessionDir(number);

    const file =
        getSessionFile(
            number,
            fileName
        );

    fs.writeFileSync(
        file,
        data
    );

    return true;
}

function getBaseDir() {
    return baseDir;
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
    writeSessionFile,
    getBaseDir
};
