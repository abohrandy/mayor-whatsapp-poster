const { Client } = require('whatsapp-web.js');
const puppeteer = require('puppeteer-core');

async function test() {
    console.log('Testing manual puppeteer launch...');
    try {
        const browser = await puppeteer.launch({
            executablePath: 'C:\\Users\\admin\\.cache\\puppeteer\\chrome\\win64-145.0.7632.77\\chrome-win64\\chrome.exe',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // NO userDataDir for now, let it be fully transient
        });
        console.log('Browser launched manually!');

        const client = new Client({
            puppeteer: {
                browser: browser
            }
        });

        client.on('qr', (qr) => {
            console.log('QR RECEIVED!');
            process.exit(0);
        });

        await client.initialize();
        console.log('Client initialized with manual browser.');

    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

test();
