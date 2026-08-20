const {
    createSocket,
    sessions
} = require('./socket');

const {
    createSession,
    updateSessionStatus
} = require('./database');

const {
    normalizeNumber
} = require('./session-store');

const pairingCodes = new Map();
const pairingPromises = new Map();

function wait(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function createPairing(number) {
    const phoneNumber = normalizeNumber(number);

    if (!phoneNumber) {
        throw new Error('Invalid phone number');
    }

    createSession(phoneNumber);

    const existingCode = pairingCodes.get(phoneNumber);

    if (existingCode) {
        return {
            socket: sessions.get(phoneNumber) || null,
            code: existingCode
        };
    }

    const existingPromise =
        pairingPromises.get(phoneNumber);

    if (existingPromise) {
        const code = await existingPromise;

        return {
            socket: sessions.get(phoneNumber) || null,
            code
        };
    }

    let socket = sessions.get(phoneNumber);

    if (!socket) {
        updateSessionStatus(
            phoneNumber,
            'connecting'
        );

        socket = await createSocket(
            phoneNumber,
            async code => {
                if (code) {
                    pairingCodes.set(
                        phoneNumber,
                        code
                    );

                    console.log(
                        `Pairing code generated for ${phoneNumber}: ${code}`
                    );
                }
            }
        );
    }

    const promise =
        waitForPairingCode(
            phoneNumber
        );

    pairingPromises.set(
        phoneNumber,
        promise
    );

    try {
        const code = await promise;

        return {
            socket:
                sessions.get(
                    phoneNumber
                ) || socket,
            code: code || null
        };
    } finally {
        pairingPromises.delete(
            phoneNumber
        );
    }
}

async function waitForPairingCode(
    phoneNumber
) {
    const timeout = 30000;
    const interval = 500;
    const started = Date.now();

    while (
        Date.now() - started <
        timeout
    ) {
        const code =
            pairingCodes.get(
                phoneNumber
            );

        if (code) {
            return code;
        }

        const session =
            sessions.get(
                phoneNumber
            );

        if (
            session &&
            session.user
        ) {
            return null;
        }

        await wait(interval);
    }

    throw new Error(
        'Pairing code is not available'
    );
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

    const socket =
        sessions.get(
            phoneNumber
        );

    if (!socket) {
        const result =
            await createPairing(
                phoneNumber
            );

        return result.code || null;
    }

    const promise =
        waitForPairingCode(
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

function getSocket(number) {
    const phoneNumber =
        normalizeNumber(number);

    return (
        sessions.get(
            phoneNumber
        ) || null
    );
}

function getSessions() {
    return Array.from(
        sessions.keys()
    );
}

function isConnected(number) {
    const phoneNumber =
        normalizeNumber(number);

    const socket =
        sessions.get(
            phoneNumber
        );

    if (!socket) {
        return false;
    }

    return !!socket.user;
}

function setPairingCode(
    number,
    code
) {
    const phoneNumber =
        normalizeNumber(number);

    if (!phoneNumber || !code) {
        return;
    }

    pairingCodes.set(
        phoneNumber,
        code
    );

    console.log(
        `Pairing code stored for ${phoneNumber}: ${code}`
    );
}

function clearPairingCode(number) {
    const phoneNumber =
        normalizeNumber(number);

    pairingCodes.delete(
        phoneNumber
    );

    pairingPromises.delete(
        phoneNumber
    );
}

module.exports = {
    createPairing,
    getPairingCode,
    getSocket,
    getSessions,
    isConnected,
    setPairingCode,
    clearPairingCode
};
