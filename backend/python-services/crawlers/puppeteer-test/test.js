const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function main() {
    // Load cookies
    const cookiesPath = path.join(__dirname, '..', 'sahibinden_cookies.json');
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    console.log('[+] Loaded ' + cookies.length + ' cookies');

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--proxy-server=http://51.77.190.247:5959'
        ],
        executablePath: '/root/.cache/puppeteer/chrome/linux-142.0.7444.61/chrome-linux64/chrome'
    });

    const page = await browser.newPage();

    // Set proxy authentication
    await page.authenticate({
        username: 'pcMVhFMABB-mob-tr',
        password: 'PC_07qMzFOzrqvngMuXW'
    });

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Add cookies
    for (const c of cookies) {
        try {
            await page.setCookie({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                expires: c.expires > 0 ? c.expires : undefined,
                httpOnly: c.httpOnly,
                secure: c.secure
            });
        } catch (e) {}
    }

    const url = 'https://www.sahibinden.com/satilik-arsa/izmir';
    console.log('[+] Navigating to ' + url + '...');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait and check
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const title = await page.title();
        const currentUrl = page.url();
        console.log('[' + (i*3) + 's] Title: ' + title.substring(0, 40) + '... URL: ' + currentUrl.substring(0, 50));

        if (title && (title.toLowerCase().includes('arsa') || title.toLowerCase().includes('ilan'))) {
            if (!title.toLowerCase().includes('moment')) {
                console.log('[+] SUCCESS!');
                break;
            }
        }

        if (currentUrl.includes('olagan-disi')) {
            console.log('[-] BLOCKED');
            break;
        }
    }

    // Count listings
    const items = await page.$$('tr.searchResultsItem');
    console.log('[+] Found ' + items.length + ' listings');

    await browser.close();
}

main().catch(console.error);
