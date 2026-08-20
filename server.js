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

const publicDir = path.join(
    process.cwd(),
    'public'
);

if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, {
        recursive: true
    });
}

app.use(
    express.static(publicDir)
);

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
    const indexPath = path.join(
        publicDir,
        'index.html'
    );

    const pairPath = path.join(
        publicDir,
        'pair.html'
    );

    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    if (fs.existsSync(pairPath)) {
        return res.sendFile(pairPath);
    }

    res.json({
        name: 'ADM Link Hub',
        version: '1.0.0',
        status: 'online'
    });
});

app.get('/pair', (req, res) => {
    const pairPath = path.join(
        publicDir,
        'pair.html'
    );

    if (!fs.existsSync(pairPath)) {
        return res.status(404).send(
            'pair.html not found'
        );
    }

    res.sendFile(pairPath);
});

app.get('/admin', (req, res) => {
    const adminPath = path.join(
        publicDir,
        'admin.html'
    );

    if (!fs.existsSync(adminPath)) {
        return res.status(404).send(
            'admin.html not found'
        );
    }

    res.sendFile(adminPath);
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

app.use(
    (req, res) => {
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({
                error: 'API endpoint not found'
            });
        }

        const indexPath = path.join(
            publicDir,
            'index.html'
        );

        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }

        res.status(404).send(
            'Page not found'
        );
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
