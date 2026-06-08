const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

console.log('--- WHATSAPP SERVICE MODULE LOADED at ' + new Date().toLocaleTimeString() + ' ---');
const { emitStatus, emitLog } = require('./socket');

class WhatsAppClient {
    constructor() {
        const baseDir = process.env.DATA_DIR || 'C:\\';
        const authPath = path.join(baseDir, 'wa_auth_persistent');

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: authPath
            }),
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--remote-allow-origins=*',
                    '--disable-gpu',
                    '--disable-dev-shm-usage'
                ],
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                pipe: true
            }
        });

        this.status = 'DISCONNECTED';
        this.qrText = '';
        this.lastError = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            console.log('WhatsApp Client already initialized, skipping...');
            return;
        }
        this.initialized = true;

        const baseDir = process.env.DATA_DIR || 'C:\\';
        const tempPath = path.join(baseDir, 'wa_temp_' + Date.now());
        if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
        process.env.TEMP = tempPath;
        process.env.TMP = tempPath;

        console.log('WhatsApp Client initializing...');

        this.client.on('qr', (qr) => {
            this.status = 'AUTH_REQUIRED';
            this.qrText = qr;
            console.log('QR RECEIVED');
            emitLog({ type: 'info', message: 'QR Code received, waiting for scan...', timestamp: new Date().toISOString() });
            qrcode.generate(qr, { small: true });
            emitStatus(this.getStatus());
        });

        this.client.on('ready', () => {
            this.status = 'CONNECTED';
            this.qrText = '';
            console.log('Client is ready!');
            emitLog({ type: 'success', message: 'WhatsApp Client is ready and connected!', timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
        });

        this.client.on('authenticated', () => {
            console.log('AUTHENTICATED');
            emitLog({ type: 'info', message: 'WhatsApp session authenticated.', timestamp: new Date().toISOString() });
        });

        this.client.on('auth_failure', (msg) => {
            this.status = 'DISCONNECTED';
            this.lastError = 'Auth failure: ' + msg;
            console.error('AUTHENTICATION FAILURE', msg);
            emitLog({ type: 'error', message: 'Authentication failure: ' + msg, timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
        });

        this.client.on('disconnected', (reason) => {
            this.status = 'DISCONNECTED';
            console.log('Client was logged out', reason);
            emitLog({ type: 'error', message: 'WhatsApp Client disconnected/logged out.', timestamp: new Date().toISOString() });
            emitStatus(this.getStatus());
            this.client.initialize(); // Try to reconnect
        });

        return this.client.initialize();
    }

    getStatus() {
        return {
            status: this.status,
            qrText: this.qrText,
            lastError: this.lastError
        };
    }

    async reconnect() {
        try {
            console.log('Reconnection requested...');
            this.status = 'DISCONNECTED';
            this.initialized = false;
            if (this.client) {
                try { await this.client.destroy(); } catch (e) {
                    console.error('Error destroying client:', e.message);
                }
            }
            const baseDir = process.env.DATA_DIR || 'C:\\';
            const authPath = path.join(baseDir, 'wa_auth_persistent');

            this.client = new Client({
                authStrategy: new LocalAuth({ dataPath: authPath }),
                puppeteer: {
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                    pipe: true
                }
            });
            return this.init();
        } catch (error) {
            console.error('Error during reconnection:', error);
            throw error;
        }
    }

    async sendTextMessage(to, text) {
        if (this.status !== 'CONNECTED') throw new Error('WhatsApp is not connected.');
        await this.client.sendMessage(to, text);
        console.log(`Text message sent to ${to}`);
        return true;
    }

    /**
     * Send an image or video with an optional caption to a group/chat.
     * @param {string} groupId  - WhatsApp chat ID
     * @param {string} filePath - Absolute path to the media file
     * @param {string} caption  - Optional caption text
     * @param {string} mediaType - 'image' | 'video'
     */
    async sendMedia(groupId, filePath, caption = '', mediaType = 'image') {
        if (this.status !== 'CONNECTED') throw new Error('WhatsApp is not connected.');

        const absPath = path.resolve(filePath);
        if (!fs.existsSync(absPath)) throw new Error(`Media file not found: ${absPath}`);

        const media = MessageMedia.fromFilePath(absPath);

        const options = { caption };
        if (mediaType === 'video') {
            // For video, sendAsVideo flag ensures it's treated as a video note/clip
            options.sendMediaAsDocument = false;
        }

        await this.client.sendMessage(groupId, media, options);
        console.log(`Media (${mediaType}) sent to ${groupId}`);
        return true;
    }

    // Legacy alias kept for compatibility
    async sendImageWithCaption(groupId, imagePath, caption) {
        return this.sendMedia(groupId, imagePath, caption, 'image');
    }
}

// Singleton instance
const waClient = new WhatsAppClient();
module.exports = waClient;
