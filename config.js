require('dotenv').config();

module.exports = {
    port: Number(process.env.PORT || 8080),
    apiKey: process.env.API_KEY || '',
    sessionDir: process.env.SESSION_DIR || './sessions'
};
