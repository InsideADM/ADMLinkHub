const {
    createSocket,
    sessions
} = require('./socket');

const {
    ensureSessionDir,
    normalizeNumber
} = require('./session-store');

const {
    createSession,
    updateSessionStatus
} = require('./database');

const pairingCodes = new Map();
const pairingPromises = new Map();

async function createPairing(number) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error(
            'Invalid phone number'
        );
    }

    createSession(phoneNumber);

    const existingSocket =
        sessions[phoneNumber];

    if (existingSocket) {
        const existingCode =
            pairingCodes.get(
                phoneNumber
            );

        if (existingCode) {
            return {
                socket: existingSocket,
                code: existingCode
            };
        }

        return {
            socket: existingSocket,
            code: null
        };
    }

    updateSessionStatus(
        phoneNumber,
        'connecting'
    );

    const promise =
        new Promise(
            async (resolve, reject) => {
                let resolved = false;

                const finish = (
                    code,
                    error
                ) => {
                    if (resolved) {
                        return;
                    }

                    resolved = true;

                    if (error) {
                        reject(error);
                        return;
                    }

                    if (code) {
                        pairingCodes.set(
                            phoneNumber,
                            code
                        );
                    }

                    resolve(code || null);
                };

                try {
                    const socket =
                        await createSocket(
                            phoneNumber,
                            (
                                code,
                                error
                            ) => {
                                finish(
                                    code,
                                    error
                                );
                            }
                        );

                    if (
                        socket &&
                        socket.user
                    ) {
                        updateSessionStatus(
                            phoneNumber,
                            'connected'
                        );

                        finish(null);
                    } else {
                        setTimeout(
                            () => {
                                if (
                                    !resolved
                                ) {
                                    const current =
                                        sessions[
                                            phoneNumber
                                        ];

                                    if (
                                        current
                                            ?.user
                                    ) {
                                        updateSessionStatus(
                                            phoneNumber,
                                            'connected'
                                        );

                                        finish(
                                            null
                                        );
                                    }
                                }
                            },
                            1000
                        );
                    }

                    setTimeout(
                        () => {
                            if (
                                !resolved
                            ) {
                                finish(
                                    null
                                );
                            }
                        },
                        15000
                    );
                } catch (error) {
                    updateSessionStatus(
                        phoneNumber,
                        'disconnected'
                    );

                    finish(
                        null,
                        error
                    );
                }
            }
        );

    pairingPromises.set(
        phoneNumber,
        promise
    );

    try {
        const code =
            await promise;

        return {
            socket:
                sessions[
                    phoneNumber
                ] || null,
            code
        };
    } finally {
        pairingPromises.delete(
            phoneNumber
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

    const result =
        await createPairing(
            phoneNumber
        );

    return result.code || null;
}

function getSocket(number) {
    const phoneNumber =
        normalizeNumber(number);

    return (
        sessions[
            phoneNumber
        ] || null
    );
}

function getSessions() {
    return Object.keys(
        sessions
    ).filter(
        number =>
            sessions[number]
    );
}

function isConnected(number) {
    const socket =
        getSocket(number);

    return !!(
        socket &&
        socket.user
    );
}

function clearPairingCode(number) {
    const phoneNumber =
        normalizeNumber(number);

    pairingCodes.delete(
        phoneNumber
    );
}

module.exports = {
    createPairing,
    getPairingCode,
    getSocket,
    getSessions,
    isConnected,
    clearPairingCode
};
