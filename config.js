require('dotenv').config();

function required(name, fallback = null) {
    const value = process.env[name];

    if (value !== undefined && value !== '') {
        return value;
    }

    return fallback;
}

const config = {
    port: Number(process.env.PORT) || 8080,

    host: process.env.HOST || '0.0.0.0',

    nodeEnv: process.env.NODE_ENV || 'production',

    apiKey: required('ADM_LINK_HUB_API_KEY', ''),

    controlApiUrl: required(
        'ADM_CONTROL_API_URL',
        ''
    ),

    controlApiKey: required(
        'ADM_CONTROL_API_KEY',
        ''
    ),

    sessionDirectory: required(
        'SESSION_DIRECTORY',
        './sessions'
    ),

    dataDirectory: required(
        'DATA_DIRECTORY',
        './data'
    ),

    pairingTimeout: Number(
        process.env.PAIRING_TIMEOUT
    ) || 120000,

    reconnectDelay: Number(
        process.env.RECONNECT_DELAY
    ) || 5000,

    maxSessions: Number(
        process.env.MAX_SESSIONS
    ) || 10,

    publicUrl: required(
        'PUBLIC_URL',
        ''
    ),

    corsOrigin: required(
        'CORS_ORIGIN',
        '*'
    )
};

module.exports = config;
