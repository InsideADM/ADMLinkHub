const {
    getAllSessions,
    getSession
} = require('./database');

const {
    createPairing,
    getPairingCode,
    isConnected
} = require('./pairing');

const {
    normalizeNumber
} = require('./session-store');

function registerBravoControl(app, config) {
    function authenticate(req, res, next) {
        if (!config.apiKey) {
            return res.status(503).json({
                success: false,
                error: 'BravoControl API is not configured'
            });
        }

        const key = req.headers['x-api-key'];

        if (!key || key !== config.apiKey) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        next();
    }

    app.get(
        '/api/bravocontrol/status',
        authenticate,
        (req, res) => {
            res.json({
                success: true,
                service: 'ADM Link Hub',
                integration: 'BravoControl',
                status: 'online',
                timestamp: new Date().toISOString()
            });
        }
    );

    app.get(
        '/api/bravocontrol/sessions',
        authenticate,
        (req, res) => {
            try {
                const sessions = getAllSessions();

                res.json({
                    success: true,
                    sessions: sessions.map(session => ({
                        id: session.id,
                        number: session.phone_number,
                        status: session.status,
                        connected:
                            isConnected(
                                session.phone_number
                            ),
                        created_at:
                            session.created_at,
                        updated_at:
                            session.updated_at
                    }))
                });
            } catch (error) {
                console.error(
                    'BravoControl sessions error:',
                    error.message
                );

                res.status(500).json({
                    success: false,
                    error: 'Unable to retrieve sessions'
                });
            }
        }
    );

    app.get(
        '/api/bravocontrol/session/:number',
        authenticate,
        (req, res) => {
            try {
                const number =
                    normalizeNumber(
                        req.params.number
                    );

                if (!number) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid phone number'
                    });
                }

                const session =
                    getSession(number);

                if (!session) {
                    return res.status(404).json({
                        success: false,
                        error: 'Session not found'
                    });
                }

                res.json({
                    success: true,
                    session: {
                        id: session.id,
                        number:
                            session.phone_number,
                        status:
                            session.status,
                        connected:
                            isConnected(number),
                        created_at:
                            session.created_at,
                        updated_at:
                            session.updated_at
                    }
                });
            } catch (error) {
                console.error(
                    'BravoControl session error:',
                    error.message
                );

                res.status(500).json({
                    success: false,
                    error: 'Unable to retrieve session'
                });
            }
        }
    );

    app.post(
        '/api/bravocontrol/pair',
        authenticate,
        async (req, res) => {
            try {
                const number =
                    normalizeNumber(
                        req.body.number
                    );

                if (!number) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Phone number is required'
                    });
                }

                const result =
                    await createPairing(number);

                res.json({
                    success: true,
                    number,
                    code:
                        result.code || null
                });
            } catch (error) {
                console.error(
                    'BravoControl pairing error:',
                    error.message
                );

                res.status(500).json({
                    success: false,
                    error:
                        error.message ||
                        'Unable to start pairing'
                });
            }
        }
    );

    app.get(
        '/api/bravocontrol/pair/:number',
        authenticate,
        async (req, res) => {
            try {
                const number =
                    normalizeNumber(
                        req.params.number
                    );

                if (!number) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Invalid phone number'
                    });
                }

                const code =
                    await getPairingCode(number);

                res.json({
                    success: true,
                    number,
                    code
                });
            } catch (error) {
                console.error(
                    'BravoControl pairing code error:',
                    error.message
                );

                res.status(500).json({
                    success: false,
                    error:
                        error.message ||
                        'Unable to retrieve pairing code'
                });
            }
        }
    );
}

module.exports = {
    registerBravoControl
};
