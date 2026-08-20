const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const config = require('./config');

const {
    createPairing,
    getPairingCode,
    getSessions,
    isConnected
} = require('./pairing');

const {
    getAllSessions,
    getSession
} = require('./database');

const app = express();

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);

const publicDir =
    path.join(
        __dirname,
        'public'
    );

const sessionsDir =
    path.resolve(
        process.cwd(),
        config.sessionDir
    );

if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(
        sessionsDir,
        {
            recursive: true
        }
    );
}

function normalizeNumber(number) {
    return String(number || '')
        .replace(/\D/g, '');
}

function authenticate(req, res, next) {
    if (!config.apiKey) {
        return next();
    }

    const key =
        req.headers['x-api-key'];

    if (
        !key ||
        key !== config.apiKey
    ) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized'
        });
    }

    next();
}

app.get('/', (req, res) => {
    res.json({
        name: 'ADM Link Hub',
        version: '1.0.0',
        status: 'online'
    });
});

app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        service: 'ADM Link Hub'
    });
});

app.get('/pair.html', (req, res) => {
    res.sendFile(
        path.join(
            publicDir,
            'pair.html'
        )
    );
});

app.get('/pair', async (req, res) => {
    const number =
        normalizeNumber(
            req.query.number ||
            req.query.code
        );

    if (!number) {
        return res.sendFile(
            path.join(
                publicDir,
                'pair.html'
            )
        );
    }

    try {
        const result =
            await createPairing(
                number
            );

        return res.json({
            success: true,
            number,
            code:
                result.code ||
                null
        });

    } catch (error) {
        console.error(
            'Public pairing error:',
            error.message
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                'Unable to generate pairing code'
        });
    }
});

app.post('/pair', async (req, res) => {
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
            await createPairing(
                number
            );

        return res.json({
            success: true,
            number,
            code:
                result.code ||
                null
        });

    } catch (error) {
        console.error(
            'Public pairing error:',
            error.message
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                'Unable to generate pairing code'
        });
    }
});

app.get(
    '/pair/status',
    (req, res) => {
        try {
            const number =
                normalizeNumber(
                    req.query.number
                );

            if (!number) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Phone number is required'
                });
            }

            const session =
                getSession(
                    number
                );

            const connected =
                isConnected(
                    number
                );

            return res.json({
                success: true,
                number,
                connected,
                paired:
                    session?.status ===
                    'connected',
                status:
                    session?.status ||
                    'disconnected'
            });

        } catch (error) {
            console.error(
                'Pairing status error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'Unable to check pairing status'
            });
        }
    }
);

app.get(
    '/api/pair/:number',
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
                await getPairingCode(
                    number
                );

            return res.json({
                success: true,
                number,
                code:
                    code || null
            });

        } catch (error) {
            console.error(
                'API pairing code error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    'Unable to retrieve pairing code'
            });
        }
    }
);

app.get(
    '/api/pair/status',
    authenticate,
    (req, res) => {
        try {
            const number =
                normalizeNumber(
                    req.query.number
                );

            if (!number) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Phone number is required'
                });
            }

            const session =
                getSession(
                    number
                );

            const connected =
                isConnected(
                    number
                );

            return res.json({
                success: true,
                number,
                connected,
                paired:
                    session?.status ===
                    'connected',
                status:
                    session?.status ||
                    'disconnected'
            });

        } catch (error) {
            console.error(
                'API status error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'Unable to check pairing status'
            });
        }
    }
);

app.get(
    '/api/sessions',
    authenticate,
    (req, res) => {
        try {
            const sessions =
                getAllSessions();

            return res.json({
                success: true,
                count:
                    sessions.length,
                sessions
            });

        } catch (error) {
            console.error(
                'Session list error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'Unable to retrieve sessions'
            });
        }
    }
);

app.get(
    '/api/session/:number',
    authenticate,
    (req, res) => {
        try {
            const number =
                normalizeNumber(
                    req.params.number
                );

            const session =
                getSession(
                    number
                );

            if (!session) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Session not found'
                });
            }

            return res.json({
                success: true,
                session
            });

        } catch (error) {
            console.error(
                'Session lookup error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'Unable to retrieve session'
            });
        }
    }
);

app.get(
    '/api/status',
    authenticate,
    (req, res) => {
        try {
            const sessions =
                getAllSessions();

            const connected =
                sessions.filter(
                    session =>
                        session.status ===
                        'connected'
                ).length;

            return res.json({
                success: true,
                service:
                    'ADM Link Hub',
                status: 'online',
                totalSessions:
                    sessions.length,
                connectedSessions:
                    connected,
                activeSockets:
                    getSessions().length
            });

        } catch (error) {
            console.error(
                'API status error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'Unable to retrieve service status'
            });
        }
    }
);

app.use(
    express.static(
        publicDir
    )
);

app.use(
    (req, res) => {
        res.status(404).json({
            success: false,
            error: 'Not Found'
        });
    }
);

const PORT =
    Number(
        process.env.PORT ||
        config.port ||
        3000
    );

app.listen(
    PORT,
    '0.0.0.0',
    () => {
        console.log(
            `ADM Link Hub running on port ${PORT}`
        );
    }
);
