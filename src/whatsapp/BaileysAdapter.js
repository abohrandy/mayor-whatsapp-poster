const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

class BaileysAdapter {
    constructor(bridgeUrl) {
        this.bridgeUrl = this.normalizeUrl(bridgeUrl || process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:8080');
    }

    normalizeUrl(rawUrl) {
        let url = rawUrl.trim().replace(/:+$/, '').replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(url)) {
            url = `http://${url}`;
        }
        return url;
    }

    async fetchStatus() {
        try {
            const res = await axios.get(`${this.bridgeUrl}/status`);
            return res.data || [];
        } catch (err) {
            console.error('[BaileysAdapter] Failed to contact WhatsApp backend:', err.message);
            throw err;
        }
    }

    async createSession() {
        try {
            console.log('[BaileysAdapter] Requesting new session creation...');
            const res = await axios.post(`${this.bridgeUrl}/session/new`);
            return res.data;
        } catch (err) {
            console.error('[BaileysAdapter] Failed to create new session:', err.message);
            throw err;
        }
    }

    async pairPhone(phone) {
        try {
            console.log(`[BaileysAdapter] Requesting phone-pairing code for ${phone}...`);
            const res = await axios.post(`${this.bridgeUrl}/session/pair-phone`, { phone });
            return res.data;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error('[BaileysAdapter] Failed to request phone-pairing code:', errMsg);
            throw new Error(typeof errMsg === 'string' ? errMsg : errMsg?.error || 'Failed to request pairing code');
        }
    }

    async deleteSession(id) {
        try {
            console.log(`[BaileysAdapter] Requesting deletion of session: ${id}...`);
            const res = await axios.post(`${this.bridgeUrl}/session/delete`, { id });
            return res.data;
        } catch (err) {
            console.error(`[BaileysAdapter] Failed to delete session ${id}:`, err.message);
            throw err;
        }
    }

    async joinGroup(from, inviteLink) {
        try {
            console.log(`[BaileysAdapter] Requesting session ${from || 'default'} to join group: ${inviteLink}...`);
            const res = await axios.post(`${this.bridgeUrl}/join`, { from, inviteLink });
            return res.data;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error('[BaileysAdapter] Failed to join group:', errMsg);
            throw new Error(errMsg);
        }
    }

    async sendTextMessage(to, text, from = null) {
        try {
            await axios.post(`${this.bridgeUrl}/send`, { from, to, text });
            console.log(`[BaileysAdapter] Text message sent from ${from || 'default'} to ${to}`);
            return true;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error(`[BaileysAdapter] Failed to send text message from ${from || 'default'} to ${to}:`, errMsg);
            throw new Error(errMsg);
        }
    }

    async sendMediaMessage(to, mediaFilePath, caption = '', mediaType = 'image', from = null) {
        try {
            const form = new FormData();
            if (from) form.append('from', from);
            form.append('to', to);
            form.append('text', caption);
            form.append('mediaType', mediaType);
            form.append('media', fs.createReadStream(mediaFilePath));

            await axios.post(`${this.bridgeUrl}/send`, form, {
                headers: form.getHeaders(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });
            console.log(`[BaileysAdapter] Media (${mediaType}) sent from ${from || 'default'} to ${to}`);
            return true;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error(`[BaileysAdapter] Failed to send media to ${to} from ${from || 'default'}:`, errMsg);
            throw new Error(errMsg);
        }
    }

    async getGroups(from = null) {
        try {
            const res = await axios.get(`${this.bridgeUrl}/groups`, {
                params: { from }
            });
            return res.data || [];
        } catch (err) {
            console.error(`[BaileysAdapter] Failed to fetch groups for ${from || 'default'}:`, err.message);
            return [];
        }
    }

    async getContacts(from = null) {
        try {
            const res = await axios.get(`${this.bridgeUrl}/contacts`, {
                params: { from }
            });
            return res.data || [];
        } catch (err) {
            console.error(`[BaileysAdapter] Failed to fetch contacts for ${from || 'default'}:`, err.message);
            return [];
        }
    }
}

module.exports = BaileysAdapter;
