const { Client } = require('whatsapp-web.js');

async function test() {
    console.log('Testing whatsapp-web.js initialization...');
    const client = new Client({
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('QR RECEIVED!');
        process.exit(0);
    });

    try {
        await client.initialize();
        console.log('Client initialized (wait for QR)...');
    } catch (e) {
        console.error('Initialization failed:', e.message);
    }
}

test();
