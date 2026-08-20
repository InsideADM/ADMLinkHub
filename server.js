require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const pairingRoutes = require('./routes/pairing');
const sessionRoutes = require('./routes/sessions');
const healthRoutes = require('./routes/health');

const app = express();

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({
    limit: '1mb'
}));

app.use(express.urlencoded({
    extended: true,
    limit: '1mb'
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests. Try again later.'
    }
});

app.use('/api', apiLimiter);

app.use(express.static(
    path.join(__dirname, 'public')
));

app.use('/api/pair', pairingRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/health', healthRoutes);

app.get('/', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'index.html')
    );
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found.'
        });
    }

    res.status(404).send('Page not found.');
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error.'
    });
});

const server = app.listen(PORT, HOST, () => {
    console.log(`ADM Link Hub running on ${HOST}:${PORT}`);
});

process.on('SIGINT', async () => {
    console.log('Shutting down ADM Link Hub...');

    try {
        const sessions = require('./src/sessions');
        await sessions.closeAll();
    } catch (error) {
        console.error('Session shutdown error:', error.message);
    }

    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('Shutting down ADM Link Hub...');

    try {
        const sessions = require('./src/sessions');
        await sessions.closeAll();
    } catch (error) {
        console.error('Session shutdown error:', error.message);
    }

    server.close(() => {
        process.exit(0);
    });
});

module.exports = {
    app,
    server
};
