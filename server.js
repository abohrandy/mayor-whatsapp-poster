require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const { initDb } = require('./src/models/database');
const apiRoutes = require('./src/routes/api');
const { scheduleAnnouncementChecker } = require('./src/services/scheduler');
const { initSocket } = require('./src/services/socket');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Socket.io
initSocket(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB (videos can be large)
}));

// Static files for uploads
const uploadsPath = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'uploads')
    : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Serve frontend assets
app.use(express.static(path.join(__dirname, 'admin-dashboard/dist')));

// Routes
app.use('/api', apiRoutes);

// SPA routing fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard/dist/index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Initialize DB and start server
async function start() {
    try {
        await initDb();
        const waClient = require('./src/services/whatsapp');
        await waClient.init();
        await scheduleAnnouncementChecker();

        server.listen(PORT, () => {
            console.log(`Mayor WhatsApp Poster running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
