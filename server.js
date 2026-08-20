const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const {
    createPairing,
    getPairingCode,
    getSessions
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
                    error: 'Phone number is required'
                });
            }

            const result =
                await createPairing(number);

            res.json({
                success: true,
                number: String(number)
                    .replace(/\D/g, ''),
                code: result.code || null
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
            const code =
                await getPairingCode(
                    req.params.number
                );

            res.json({
                success: true,
                number: String(
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
