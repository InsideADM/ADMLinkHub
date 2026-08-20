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
const pairingRequests = new Map();

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
        const existingCode =
            pairingCodes.get(
                phoneNumber
            ) || null;

        return {
            socket:
                sockets.get(
                    phoneNumber
                ),
            code: existingCode
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

                pairingRequests.delete(
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

            pairingRequests.delete(
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
        const pairingPromise =
            (async () => {
                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            3000
                        )
                );

                if (
                    state.creds.registered
                ) {
                    return null;
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

                return code;
            })();

        pairingRequests.set(
            phoneNumber,
            pairingPromise
        );

        try {
            const code =
                await pairingPromise;

            return {
                socket,
                code
            };
        } catch (error) {
            pairingRequests.delete(
                phoneNumber
            );

            throw error;
        }
    }

    return {
        socket,
        code: null
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
        const result =
            await createPairing(
                phoneNumber
            );

        socket =
            result.socket;

        if (result.code) {
            return result.code;
        }
    }

    const existingCode =
        pairingCodes.get(
            phoneNumber
        );

    if (existingCode) {
        return existingCode;
    }

    const pending =
        pairingRequests.get(
            phoneNumber
        );

    if (pending) {
        const code =
            await pending;

        return code || null;
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

    const code =
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
