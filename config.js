const path = require('path');

const port = Number(
    process.env.PORT || 3000
);

const sessionDir =
    process.env.SESSION_DIR ||
    path.join(
        process.cwd(),
        'sessions'
    );

const dbPath =
    process.env.DB_PATH ||
    path.join(
        process.cwd(),
        'data',
        'adm.db'
    );

const apiKey =
    process.env.API_KEY || '';

module.exports = {
    port,
    sessionDir,
    dbPath,
    apiKey
};
