const path = require('path');

const port = Number(
    process.env.PORT || 3000
);

const sessionDir = path.resolve(
    process.env.SESSION_DIR ||
    path.join(
        process.cwd(),
        'sessions'
    )
);

const dbPath = path.resolve(
    process.env.DB_PATH ||
    path.join(
        process.cwd(),
        'data',
        'adm.db'
    )
);

const apiKey =
    process.env.API_KEY || '';

const nodeEnv =
    process.env.NODE_ENV ||
    'production';

const logLevel =
    process.env.LOG_LEVEL ||
    'error';

const pairingTimeout =
    Number(
        process.env.PAIRING_TIMEOUT ||
        120000
    );

const reconnectDelay =
    Number(
        process.env.RECONNECT_DELAY ||
        5000
    );

module.exports = {
    port,
    sessionDir,
    dbPath,
    apiKey,
    nodeEnv,
    logLevel,
    pairingTimeout,
    reconnectDelay
};
