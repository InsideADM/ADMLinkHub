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
const connectionStates = new Map();
const reconnecting = new Set();
const pairingPromises = new Map();

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
            'Unable to fetch Baileys version:',
            error.message
        );
    }

    return [
        2,
        3000,
        1015901307
    ];
}

function setConnectionState(
    phoneNumber,
    state
) {
    connectionStates.set(
        phoneNumber,
        state
    );
}

function getConnectionState(
    phoneNumber
) {
    return (
        connectionStates.get(
            phoneNumber
        ) || 'disconnected'
    );
}

async function createPairing(number) {
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

    const existingSocket =
        sockets.get(
            phoneNumber
        );

    if (existingSocket) {
        return {
            socket: existingSocket,
            code:
                pairingCodes.get(
                    phoneNumber
                ) || null,
            status:
                getConnectionState(
                    phoneNumber
                )
        };
    }

    if (
        pairingPromises.has(
            phoneNumber
        )
    ) {
        return pairingPromises.get(
            phoneNumber
        );
    }

    const promise =
        initializeSocket(
            phoneNumber
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

async function initializeSocket(
    phoneNumber
) {
    setConnectionState(
        phoneNumber,
        'connecting'
    );

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
            generateHighQualityLinkPreview:
                true,
            connectTimeoutMs:
                120000,
            keepAliveIntervalMs:
                30000,
            defaultQueryTimeoutMs:
                60000,
            retryRequestDelayMs:
                2000,
            getMessage:
                async () => undefined
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

                setConnectionState(
                    phoneNumber,
                    'connected'
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
                connection === 'connecting'
            ) {
                setConnectionState(
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

            setConnectionState(
                phoneNumber,
                'disconnected'
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

                setConnectionState(
                    phoneNumber,
                    'logged_out'
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

            console.log(
                `WhatsApp disconnected. Reconnecting ${phoneNumber}...`
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
                        setConnectionState(
                            phoneNumber,
                            'disconnected'
                        );

                        updateSessionStatus(
                            phoneNumber,
                            'disconnected'
                        );

                        console.error(
                            `Reconnect failed for ${phoneNumber}:`,
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
            code: null,
            status:
                getConnectionState(
                    phoneNumber
                )
        };
    }

    const code =
        await waitForPairingCode(
            socket,
            state,
            phoneNumber
        );

    return {
        socket,
        code,
        status:
            getConnectionState(
                phoneNumber
            )
    };
}

async function waitForPairingCode(
    socket,
    state,
    phoneNumber
) {
    if (
        state.creds.registered
    ) {
        return null;
    }

    const existingCode =
        pairingCodes.get(
            phoneNumber
        );

    if (existingCode) {
        return existingCode;
    }

    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                2500
            )
    );

    if (
        state.creds.registered
    ) {
        return null;
    }

    if (
        !sockets.has(
            phoneNumber
        )
    ) {
        throw new Error(
            'WhatsApp socket is no longer available'
        );
    }

    try {
        const code =
            await socket.requestPairingCode(
                phoneNumber
            );

        pairingCodes.set(
            phoneNumber,
            code
        );

        updateSessionStatus(
            phoneNumber,
            'waiting_for_pairing'
        );

        setConnectionState(
            phoneNumber,
            'waiting_for_pairing'
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

        setConnectionState(
            phoneNumber,
            'disconnected'
        );

        throw error;
    }
}

async function getPairingCode(
    number
) {
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

    const existingCode =
        pairingCodes.get(
            phoneNumber
        );

    if (existingCode) {
        return existingCode;
    }

    if (
        getConnectionState(
            phoneNumber
        ) === 'connected'
    ) {
        return null;
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

    updateSessionStatus(
        phoneNumber,
        'waiting_for_pairing'
    );

    setConnectionState(
        phoneNumber,
        'waiting_for_pairing'
    );

    return code;
}

function getSocket(number) {
    return (
        sockets.get(
            normalizeNumber(number)
        ) || null
    );
}

function getSessions() {
    return Array.from(
        sockets.keys()
    );
}

function isConnected(number) {
    return (
        getConnectionState(
            number
        ) === 'connected'
    );
}

function getConnectionStatus(number) {
    return getConnectionState(
        normalizeNumber(number)
    );
}

function getPairingStatus(number) {
    const phoneNumber =
        normalizeNumber(number);

    return {
        number: phoneNumber,
        connected:
            getConnectionState(
                phoneNumber
            ) === 'connected',
        status:
            getConnectionState(
                phoneNumber
            ),
        pairingCode:
            pairingCodes.get(
                phoneNumber
            ) || null
    };
}

module.exports = {
    createPairing,
    getPairingCode,
    getSocket,
    getSessions,
    isConnected,
    getConnectionStatus,
    getPairingStatus
};
