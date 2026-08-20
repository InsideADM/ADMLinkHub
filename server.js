const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const config = require('./config');

const {
    createPairing,
    getPairingCode,
    getSessions,
    isConnected,
    getConnectionStatus
} = require('./pairing');

const {
    getAllSessions,
    getSession
} = require('./database');

const app = express();

app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(
    express.json({
        limit: '100kb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '100kb'
    })
);

const limiter =
    rateLimit({
        windowMs:
            15 * 60 * 1000,

        max: 100,

        standardHeaders:
            true,

        legacyHeaders:
            false,

        message: {
            success: false,
            error:
                'Too many requests. Please try again later.'
        }
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
    return String(
        number || ''
    ).replace(/\D/g, '');
}

function authenticate(
    req,
    res,
    next
) {
    if (!config.apiKey) {
        return next();
    }

    const key =
        req.headers[
            'x-api-key'
        ];

    if (
        !key ||
        key !== config.apiKey
    ) {
        return res.status(401).json({
            success: false,
            error:
                'Unauthorized'
        });
    }

    next();
}

app.get(
    '/',
    (req, res) => {
        res.json({
            name:
                'ADM Link Hub',

            version:
                '1.0.0',

            status:
                'online'
        });
    }
);

app.get(
    '/health',
    (req, res) => {
        res.json({
            status:
                'ok',

            service:
                'ADM Link Hub',

            uptime:
                process.uptime()
        });
    }
);

app.get(
    '/api/status',
    (req, res) => {
        res.json({
            success:
                true,

            service:
                'ADM Link Hub',

            status:
                'online',

            sessions:
                getSessions().length
        });
    }
);

app.get(
    '/pair.html',
    (req, res) => {
        res.sendFile(
            path.join(
                publicDir,
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
                publicDir,
                'pair.html'
            )
        );
    }
);

app.post(
    '/api/pair',
    authenticate,
    async (req, res) => {
        try {
            const number =
                normalizeNumber(
                    req.body.number
                );

            if (!number) {
                return res.status(
                    400
                ).json({
                    success:
                        false,

                    error:
                        'Phone number is required'
                });
            }

            const result =
                await createPairing(
                    number
                );

            return res.json({
                success:
                    true,

                number,

                code:
                    result.code ||
                    null
            });

        } catch (error) {
            console.error(
                'Pairing request failed:',
                error
            );

            return res.status(
                500
            ).json({
                success:
                    false,

                error:
                    error.message ||
                    'Unable to generate pairing code'
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
                return res.status(
                    400
                ).json({
                    success:
                        false,

                    error:
                        'Phone number is required'
                });
            }

            const code =
                await getPairingCode(
                    number
                );

            return res.json({
                success:
                    true,

                number,

                code:
                    code ||
                    null
            });

        } catch (error) {
            console.error(
                'Pairing code request failed:',
                error
            );

            return res.status(
                500
            ).json({
                success:
                    false,

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
                return res.status(
                    400
                ).json({
                    success:
                        false,

                    error:
                        'Phone number is required'
                });
            }

            const session =
                getSession(
                    number
                );

            const connectionStatus =
                getConnectionStatus(
                    number
                );

            return res.json({
                success:
                    true,

                number,

                connected:
                    isConnected(
                        number
                    ),

                paired:
                    session?.status ===
                    'connected',

                status:
                    session?.status ||
                    connectionStatus ||
                    'disconnected'
            });

        } catch (error) {
            console.error(
                'Pairing status failed:',
                error
            );

            return res.status(
                500
            ).json({
                success:
                    false,

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
                success:
                    true,

                sessions
            });

        } catch (error) {
            console.error(
                'Session query failed:',
                error
            );

            return res.status(
                500
            ).json({
                success:
                    false,

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

            if (!number) {
                return res.status(
                    400
                ).json({
                    success:
                        false,

                    error:
                        'Invalid phone number'
                });
            }

            const session =
                getSession(
                    number
                );

            if (!session) {
                return res.status(
                    404
                ).json({
                    success:
                        false,

                    error:
                        'Session not found'
                });
            }

            return res.json({
                success:
                    true,

                session
            });

        } catch (error) {
            console.error(
                'Session lookup failed:',
                error
            );

            return res.status(
                500
            ).json({
                success:
                    false,

                error:
                    'Unable to retrieve session'
            });
        }
    }
);

app.use(
    express.static(
        publicDir,
        {
            extensions: [
                'html'
            ],

            index:
                false,

            maxAge:
                '1h'
        }
    )
);

app.use(
    (req, res) => {
        if (
            req.path.startsWith(
                '/api/'
            )
        ) {
            return res.status(
                404
            ).json({
                success:
                    false,

                error:
                    'API endpoint not found'
            });
        }

        return res.status(
            404
        ).json({
            success:
                false,

            error:
                'Not Found'
        });
    }
);

const PORT =
    Number(
        process.env.PORT ||
        config.port ||
        3000
    );

const server =
    app.listen(
        PORT,
        '0.0.0.0',
        () => {
            console.log(
                `ADM Link Hub running on port ${PORT}`
            );

            console.log(
                `Public directory: ${publicDir}`
            );

            console.log(
                `Session directory: ${sessionsDir}`
            );
        }
    );

function shutdown(
    signal
) {
    console.log(
        `${signal} received. Shutting down...`
    );

    server.close(
        () => {
            console.log(
                'HTTP server closed.'
            );

            process.exit(0);
        }
    );

    setTimeout(
        () => {
            process.exit(1);
        },
        10000
    );
}

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);
