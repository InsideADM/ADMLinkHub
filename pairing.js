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
    updateSessionStatus,
    getSession
} = require('./database');

const logger = pino({
    level: 'error'
});

const sockets = new Map();
const pairingCodes = new Map();
const connections = new Map();
const reconnecting = new Set();
const creating = new Map();

async function getVersion() {
    try {
        const result =
            await fetchLatestBaileysVersion();

        if (
            result &&
            Array.isArray(result.version)
        ) {
            return result.version;
        }
    } catch (error) {
        console.error(
            'Failed to fetch Baileys version:',
            error.message
        );
    }

    return [
        2,
        3000,
        1015901307
    ];
}

function cleanCode(code) {
    if (!code) {
        return null;
    }

    return String(code)
        .replace(/\s+/g, '')
        .toUpperCase();
}

async function waitForSocket(number, timeout = 30000) {
    const started =
        Date.now();

    while (
        Date.now() - started <
        timeout
    ) {
        const socket =
            sockets.get(number);

        if (socket) {
            return socket;
        }

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    250
                )
        );
    }

    return null;
}

async function generatePairingCode(
    phoneNumber,
    socket,
    state
) {
    if (
        state.creds.registered
    ) {
        return null;
    }

    const existing =
        pairingCodes.get(
            phoneNumber
        );

    if (existing) {
        return existing;
    }

    try {
        const code =
            await socket.requestPairingCode(
                phoneNumber
            );

        const normalizedCode =
            cleanCode(code);

        if (normalizedCode) {
            pairingCodes.set(
                phoneNumber,
                normalizedCode
            );

            updateSessionStatus(
                phoneNumber,
                'waiting'
            );

            console.log(
                `Pairing code generated for ${phoneNumber}`
            );
        }

        return normalizedCode;

    } catch (error) {
        console.error(
            'Pairing code generation error:',
            error.message
        );

        updateSessionStatus(
            phoneNumber,
            'disconnected'
        );

        throw error;
    }
}

async function createPairing(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error(
            'Invalid phone number'
        );
    }

    if (
        creating.has(phoneNumber)
    ) {
        return creating.get(
            phoneNumber
        );
    }

    const operation =
        createPairingInternal(
            phoneNumber
        );

    creating.set(
        phoneNumber,
        operation
    );

    try {
        return await operation;
    } finally {
        creating.delete(
            phoneNumber
        );
    }
}

async function createPairingInternal(
    phoneNumber
) {
    createSession(
        phoneNumber
    );

    const existingSocket =
        sockets.get(
            phoneNumber
        );

    if (existingSocket) {
        const existingCode =
            pairingCodes.get(
                phoneNumber
            ) || null;

        return {
            socket:
                existingSocket,
            code:
                existingCode
        };
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

    connections.set(
        phoneNumber,
        'connecting'
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
                connection ===
                'connecting'
            ) {
                connections.set(
                    phoneNumber,
                    'connecting'
                );

                updateSessionStatus(
                    phoneNumber,
                    'connecting'
                );

                return;
            }

            if (
                connection === 'open'
            ) {
                connections.set(
                    phoneNumber,
                    'connected'
                );

                reconnecting.delete(
                    phoneNumber
                );

                pairingCodes.delete(
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

            connections.set(
                phoneNumber,
                'disconnected'
            );

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
                    } catch (
                        error
                    ) {
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
        state.creds.registered
    ) {
        return {
            socket,
            code: null
        };
    }

    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                1500
            )
    );

    if (
        state.creds.registered
    ) {
        return {
            socket,
            code: null
        };
    }

    const code =
        await generatePairingCode(
            phoneNumber,
            socket,
            state
        );

    return {
        socket,
        code
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

    createSession(
        phoneNumber
    );

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

    if (!socket) {
        throw new Error(
            'Unable to create WhatsApp connection'
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

    const code =
        await generatePairingCode(
            phoneNumber,
            socket,
            state
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
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        return false;
    }

    if (
        connections.get(
            phoneNumber
        ) === 'connected'
    ) {
        return true;
    }

    try {
        const session =
            getSession(
                phoneNumber
            );

        return (
            session?.status ===
            'connected'
        );
    } catch {
        return false;
    }
}

function getConnectionStatus(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        return 'disconnected';
    }

    return (
        connections.get(
            phoneNumber
        ) ||
        'disconnected'
    );
}

function clearPairingCode(number) {
    const phoneNumber =
        normalizeNumber(number);

    pairingCodes.delete(
        phoneNumber
    );
}

function closeSocket(number) {
    const phoneNumber =
        normalizeNumber(number);

    const socket =
        sockets.get(
            phoneNumber
        );

    if (!socket) {
        return false;
    }

    try {
        socket.end(
            undefined
        );
    } catch {}

    sockets.delete(
        phoneNumber
    );

    connections.delete(
        phoneNumber
    );

    pairingCodes.delete(
        phoneNumber
    );

    return true;
}

module.exports = {
    createPairing,
    getPairingCode,
    getSocket,
    getSessions,
    isConnected,
    getConnectionStatus,
    clearPairingCode,
    closeSocket
};
