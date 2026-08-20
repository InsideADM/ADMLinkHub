const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const pino = require('pino');

const {
    ensureSessionDir,
    normalizeNumber
} = require('./session-store');

const logger = pino({
    level: 'error'
});

const sockets = new Map();
const pairingCodes = new Map();
const reconnecting = new Set();

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
            socket:
                sockets.get(
                    phoneNumber
                ),
            code:
                pairingCodes.get(
                    phoneNumber
                ) || null
        };
    }

    const sessionDir =
        ensureSessionDir(
            phoneNumber
        );

    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            sessionDir
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
        async () => {
            try {
                await saveCreds();
            } catch (error) {
                console.error(
                    'Credential save error:',
                    error.message
                );
            }
        }
    );

    socket.ev.on(
        'connection.update',
        async update => {
            const {
                connection,
                lastDisconnect
            } = update;

            if (
                connection === 'open'
            ) {
                reconnecting.delete(
                    phoneNumber
                );

                pairingCodes.delete(
                    phoneNumber
                );

                console.log(
                    `WhatsApp connected: ${phoneNumber}`
                );

                return;
            }

            if (
                connection !== 'close'
            ) {
                return;
            }

            sockets.delete(
                phoneNumber
            );

            pairingCodes.delete(
                phoneNumber
            );

            const statusCode =
                lastDisconnect
                    ?.error
                    ?.output
                    ?.statusCode;

            if (
                statusCode ===
                    DisconnectReason.loggedOut ||
                statusCode === 401
            ) {
                reconnecting.delete(
                    phoneNumber
                );

                console.log(
                    `WhatsApp logged out: ${phoneNumber}`
                );

                return;
            }

            if (
                reconnecting.has(
                    phoneNumber
                )
            ) {
                return;
            }

            reconnecting.add(
                phoneNumber
            );

            setTimeout(
                async () => {
                    reconnecting.delete(
                        phoneNumber
                    );

                    try {
                        await createPairing(
                            phoneNumber
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            'Reconnect error:',
                            error.message
                        );
                    }
                },
                5000
            );
        }
    );

    if (
        !state.creds.registered
    ) {
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

                    console.log(
                        `Pairing code generated for ${phoneNumber}`
                    );
                } catch (
                    error
                ) {
                    console.error(
                        'Pairing code error:',
                        error.message
                    );
                }
            },
            3000
        );
    }

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
        sockets.get(
            phoneNumber
        );

    if (!socket) {
        await createPairing(
            phoneNumber
        );

        socket =
            sockets.get(
                phoneNumber
            );
    }

    let code =
        pairingCodes.get(
            phoneNumber
        );

    if (code) {
        return code;
    }

    const sessionDir =
        ensureSessionDir(
            phoneNumber
        );

    const {
        state
    } =
        await useMultiFileAuthState(
            sessionDir
        );

    if (
        state.creds.registered
    ) {
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

function isConnected(number) {
    return sockets.has(
        normalizeNumber(number)
    );
}

module.exports = {
    createPairing,
    getPairingCode,
    getSocket,
    getSessions,
    isConnected
};
