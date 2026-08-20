const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const path = require('path');
const fs = require('fs');

const config = require('./config');

const logger = pino({
    level: 'error'
});

const sockets = new Map();
const pairingCodes = new Map();

function normalizeNumber(number) {
    return String(number || '').replace(/\D/g, '');
}

function getSessionPath(number) {
    return path.join(
        path.resolve(process.cwd(), config.sessionDir),
        normalizeNumber(number)
    );
}

async function getVersion() {
    try {
        const result =
            await fetchLatestBaileysVersion();

        if (result?.version) {
            return result.version;
        }
    } catch {}

    return [
        2,
        3000,
        1015901307
    ];
}

async function createPairing(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error(
            'Invalid phone number'
        );
    }

    if (sockets.has(phoneNumber)) {
        return {
            socket: sockets.get(phoneNumber),
            code: pairingCodes.get(phoneNumber) || null
        };
    }

    const sessionPath =
        getSessionPath(phoneNumber);

    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, {
            recursive: true
        });
    }

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(
        sessionPath
    );

    const version =
        await getVersion();

    const socket =
        makeWASocket({
            version,
            auth: state,
            logger,
            browser:
                Browsers.ubuntu(
                    'Chrome'
                ),
            printQRInTerminal: false,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            connectTimeoutMs: 120000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: 60000,
            retryRequestDelayMs: 2000,
            getMessage:
                async () =>
                    undefined
        });

    sockets.set(
        phoneNumber,
        socket
    );

    socket.ev.on(
        'creds.update',
        saveCreds
    );

    if (!state.creds.registered) {
        setTimeout(
            async () => {
                try {
                    if (
                        state.creds.registered
                    ) {
                        return;
                    }

                    const code =
                        await socket.requestPairingCode(
                            phoneNumber
                        );

                    pairingCodes.set(
                        phoneNumber,
                        code
                    );
                } catch (error) {
                    console.error(
                        'Pairing error:',
                        error.message
                    );
                }
            },
            3000
        );
    }

    socket.ev.on(
        'connection.update',
        update => {
            const {
                connection
            } = update;

            if (
                connection === 'open'
            ) {
                pairingCodes.delete(
                    phoneNumber
                );
            }

            if (
                connection === 'close'
            ) {
                sockets.delete(
                    phoneNumber
                );

                pairingCodes.delete(
                    phoneNumber
                );
            }
        }
    );

    return {
        socket,
        code:
            pairingCodes.get(
                phoneNumber
            ) || null
    };
}

async function getPairingCode(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error(
            'Invalid phone number'
        );
    }

    let socket =
        sockets.get(phoneNumber);

    if (!socket) {
        await createPairing(
            phoneNumber
        );

        socket =
            sockets.get(phoneNumber);
    }

    let code =
        pairingCodes.get(
            phoneNumber
        );

    if (code) {
        return code;
    }

    const sessionPath =
        getSessionPath(
            phoneNumber
        );

    const {
        state
    } = await useMultiFileAuthState(
        sessionPath
    );

    if (state.creds.registered) {
        return null;
    }

    code =
        await socket.requestPairingCode(
            phoneNumber
        );

    pairingCodes.set(
        phoneNumber,
        code
    );

    return code;
}

function getSocket(number) {
    return sockets.get(
        normalizeNumber(number)
    ) || null;
}

function getSessions() {
    return Array.from(
        sockets.keys()
    );
}

module.exports = {
    createPairing,
    getPairingCode,
    getSocket,
    getSessions
};
