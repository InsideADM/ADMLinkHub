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

const pairingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many pairing requests. Please try again later.'
    }
});

const publicDir = path.join(
    process.cwd(),
    'public'
);

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
        return res.status(500).json({
            error: 'API key is not configured'
        });
    }

    const key = req.headers['x-api-key'];

    if (!key || key !== config.apiKey) {
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

app.use(
    express.static(publicDir)
);

app.get('/pair', (req, res) => {
    res.sendFile(
        path.join(
            publicDir,
            'pair.html'
        )
    );
});

app.get(
    '/api/sessions',
    limiter,
    authenticate,
    (req, res) => {
        res.json({
            sessions: getSessions()
        });
    }
);

app.post(
    '/api/pair',
    pairingLimiter,
    async (req, res) => {
        try {
            const {
                number
            } = req.body;

            if (!number) {
                return res.status(400).json({
                    success: false,
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
    pairingLimiter,
    async (req, res) => {
        try {
            const number =
                String(req.params.number)
                    .replace(/\D/g, '');

            if (!number) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number'
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
    pairingLimiter,
    (req, res) => {
        const number =
            String(req.query.number || '')
                .replace(/\D/g, '');

        if (!number) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        const connected =
            isConnected(number);

        res.json({
            success: true,
            number,
            connected,
            paired: connected,
            status: connected
                ? 'connected'
                : 'waiting'
        });
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
