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

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);

const sessionsDir = path.resolve(
    process.cwd(),
    config.sessionDir
);

if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, {
        recursive: true
    });
}

function authenticate(req, res, next) {
    if (!config.apiKey) {
        return next();
    }

    const key =
        req.headers['x-api-key'];

    if (key !== config.apiKey) {
        return res.status(401).json({
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
        status: 'ok'
    });
});

app.get(
    '/pair.html',
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                'public',
                'pair.html'
            )
        );
    }
);

app.get(
    '/pair',
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                'public',
                'pair.html'
            )
        );
    }
);

app.get(
    '/api/sessions',
    authenticate,
    (req, res) => {
        try {
            const sessions =
                getAllSessions();

            res.json({
                success: true,
                sessions
            });
        } catch (error) {
            console.error(
                'Session query failed:',
                error.message
            );

            res.status(500).json({
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
            const session =
                getSession(
                    String(
                        req.params.number
                    ).replace(/\D/g, '')
                );

            if (!session) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Session not found'
                });
            }

            res.json({
                success: true,
                session
            });
        } catch (error) {
            console.error(
                'Session lookup failed:',
                error.message
            );

            res.status(500).json({
                success: false,
                error:
                    'Unable to retrieve session'
            });
        }
    }
);

app.post(
    '/api/pair',
    authenticate,
    async (req, res) => {
        try {
            const {
                number
            } = req.body;

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

            res.json({
                success: true,
                number:
                    String(number)
                        .replace(/\D/g, ''),
                code:
                    result.code || null
            });
        } catch (error) {
            console.error(
                'Pairing request failed:',
                error.message
            );

            res.status(500).json({
                success: false,
                error: error.message
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
                String(
                    req.params.number
                ).replace(/\D/g, '');

            const code =
                await getPairingCode(
                    number
                );

            res.json({
                success: true,
                number,
                code
            });
        } catch (error) {
            console.error(
                'Pairing code request failed:',
                error.message
            );

            res.status(500).json({
                success: false,
                error: error.message
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
                String(
                    req.query.number || ''
                ).replace(/\D/g, '');

            if (!number) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Phone number is required'
                });
            }

            const session =
                getSession(number);

            const connected =
                isConnected(number);

            res.json({
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
                'Pairing status failed:',
                error.message
            );

            res.status(500).json({
                success: false,
                error:
                    'Unable to check pairing status'
            });
        }
    }
);

app.use(
    express.static(
        path.join(
            __dirname,
            'public'
        )
    )
);

app.use(
    (req, res) => {
        res.status(404).json({
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
