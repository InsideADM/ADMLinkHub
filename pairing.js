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

const {
    createSession,
    updateSessionStatus
} = require('./database');

const logger = pino({
    level: 'error'
});

const sockets = new Map();
const pairingCodes = new Map();
const pairingPromises = new Map();
const reconnecting = new Set();

async function getVersion() {
    try {
        const result =
            await fetchLatestBaileysVersion();

        if (result?.version) {
            return result.version;
        }
    } catch (error) {
        console.error(
            'Baileys version lookup failed:',
            error.message
        );
    }

    return [
        2,
        3000,
        1015901307
    ];
}

function wait(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function createPairing(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error(
            'Invalid phone number'
        );
    }

    createSession(phoneNumber);

    if (sockets.has(phoneNumber)) {
        const existingCode =
            pairingCodes.get(
                phoneNumber
            );

        if (existingCode) {
            return {
                socket:
                    sockets.get(
                        phoneNumber
                    ),
                code: existingCode
            };
        }

        const existingPromise =
            pairingPromises.get(
                phoneNumber
            );

        if (existingPromise) {
            const code =
                await existingPromise;

            return {
                socket:
                    sockets.get(
                        phoneNumber
                    ),
                code
            };
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

        if (state.creds.registered) {
            return {
                socket:
                    sockets.get(
                        phoneNumber
                    ),
                code: null
            };
        }

        const socket =
            sockets.get(
                phoneNumber
            );

        if (!socket) {
            return createPairing(
                phoneNumber
            );
        }

        const promise =
            generatePairingCode(
                phoneNumber,
                socket
            );

        pairingPromises.set(
            phoneNumber,
            promise
        );

        try {
            const code =
                await promise;

            return {
                socket,
                code
            };
        } finally {
            pairingPromises.delete(
                phoneNumber
            );
        }
    }

    updateSessionStatus(
        phoneNumber,
        'connecting'
    );

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

                pairingPromises.delete(
                    phoneNumber
                );

                updateSessionStatus(
                    phoneNumber,
                    'connected'
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

            pairingPromises.delete(
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

                updateSessionStatus(
                    phoneNumber,
                    'logged_out'
                );

                console.log(
                    `WhatsApp logged out: ${phoneNumber}`
                );

                return;
            }

            updateSessionStatus(
                phoneNumber,
                'disconnected'
            );

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
                    } catch (error) {
                        updateSessionStatus(
                            phoneNumber,
                            'disconnected'
                        );

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
        const promise =
            generatePairingCode(
                phoneNumber,
                socket
            );

        pairingPromises.set(
            phoneNumber,
            promise
        );

        try {
            const code =
                await promise;

            return {
                socket,
                code
            };
        } finally {
            pairingPromises.delete(
                phoneNumber
            );
        }
    }

    return {
        socket,
        code: null
    };
}

async function generatePairingCode(
    phoneNumber,
    socket
) {
    if (
        pairingCodes.has(
            phoneNumber
        )
    ) {
        return pairingCodes.get(
            phoneNumber
        );
    }

    await wait(3000);

    const existingSocket =
        sockets.get(
            phoneNumber
        );

    if (
        !existingSocket ||
        existingSocket !== socket
    ) {
        throw new Error(
            'WhatsApp socket is no longer available'
        );
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

    try {
        const code =
            await socket.requestPairingCode(
                phoneNumber
            );

        if (!code) {
            throw new Error(
                'WhatsApp returned an empty pairing code'
            );
        }

        pairingCodes.set(
            phoneNumber,
            code
        );

        console.log(
            `Pairing code generated for ${phoneNumber}: ${code}`
        );

        return code;

    } catch (error) {
        updateSessionStatus(
            phoneNumber,
            'disconnected'
        );

        throw new Error(
            error.message ||
            'Unable to generate pairing code'
        );
    }
}

async function getPairingCode(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error(
            'Invalid phone number'
        );
    }

    createSession(phoneNumber);

    const existingCode =
        pairingCodes.get(
            phoneNumber
        );

    if (existingCode) {
        return existingCode;
    }

    const existingPromise =
        pairingPromises.get(
            phoneNumber
        );

    if (existingPromise) {
        return await existingPromise;
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

    if (!socket) {
        throw new Error(
            'WhatsApp socket is unavailable'
        );
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

    const promise =
        generatePairingCode(
            phoneNumber,
            socket
        );

    pairingPromises.set(
        phoneNumber,
        promise
    );

    try {
        return await promise;
    } finally {
        pairingPromises.delete(
            phoneNumber
        );
    }
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
    const phoneNumber =
        normalizeNumber(number);

    return sockets.has(
        phoneNumber
    );
}

module.exports = {
    createPairing,
    getPairingCode,
    getSocket,
    getSessions,
    isConnected
};
