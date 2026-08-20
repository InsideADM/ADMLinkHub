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

    const key = req.headers['x-api-key'];

    if (key !== config.apiKey) {
        return res.status(401).json({
            error: 'Unauthorized'
        });
    }

    next();
}

app.use(express.static(
    path.join(process.cwd(), 'public')
));

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

app.get('/pair', async (req, res) => {
    try {
        const number = String(
            req.query.code || ''
        ).replace(/\D/g, '');

        if (!number || number.length < 10) {
            return res.status(400).json({
                success: false,
                message:
                    'Valid phone number is required'
            });
        }

        const result =
            await createPairing(number);

        let code = result.code || null;

        if (!code) {
            code =
                await getPairingCode(number);
        }

        if (!code) {
            return res.status(400).json({
                success: false,
                message:
                    'Pairing code is not available'
            });
        }

        res.json({
            success: true,
            number,
            code
        });

    } catch (error) {
        console.error(
            'Pairing request failed:',
            error.message
        );

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get('/pair/status', (req, res) => {
    try {
        const number = String(
            req.query.number || ''
        ).replace(/\D/g, '');

        if (!number) {
            return res.status(400).json({
                success: false,
                message:
                    'Phone number is required'
            });
        }

        const connected =
            isConnected(number);

        res.json({
            success: true,
            number,
            connected,
            paired: connected,
            status:
                connected
                    ? 'connected'
                    : 'waiting'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get(
    '/api/sessions',
    authenticate,
    (req, res) => {
        res.json({
            sessions: getSessions()
        });
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
                await createPairing(number);

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
                'API pairing request failed:',
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
            const code =
                await getPairingCode(
                    req.params.number
                );

            res.json({
                success: true,
                number:
                    String(
                        req.params.number
                    ).replace(/\D/g, ''),
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

app.listen(
    config.port,
    '0.0.0.0',
    () => {
        console.log(
            `ADM Link Hub running on port ${config.port}`
        );
    }
);
