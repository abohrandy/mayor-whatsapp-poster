const puppeteer = require('puppeteer-core');
const path = require('path');

async function test() {
    console.log('Testing puppeteer launch...');
    const userDataDir = 'C:\\puppeteer_test_session_' + Date.now();
    try {
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            userDataDir: userDataDir
        });
        console.log('Browser launched successfully!');
        await browser.close();
        console.log('Browser closed.');
    } catch (e) {
        console.error('Launch failed:', e.message);
    }
}

test();
