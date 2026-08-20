const express = require('express');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const config = require('./config');

const app = express();

const logger = pino({
    level: 'error'
});

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

app.listen(config.port, () => {
    console.log(
        `ADM Link Hub running on port ${config.port}`
    );
});
