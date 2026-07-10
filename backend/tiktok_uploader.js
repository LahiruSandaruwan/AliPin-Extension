const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function uploadToTikTok(pinData, videoPath) {
    if (!videoPath) {
        console.warn("[TikTok] Missing video. Skipping.");
        return;
    }

    console.log(`[TikTok] Starting upload for ${pinData.title}...`);
    
    const executablePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ];
    let chromePath = executablePaths.find(fs.existsSync);
    if (!chromePath) throw new Error("Chrome/Chromium not found on this system.");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    try {
        const page = await browser.newPage();
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Set TikTok cookies
        let cookies;
        try {
            cookies = JSON.parse(pinData.tiktokCookie);
            if (!Array.isArray(cookies)) cookies = [cookies];

            // Strictly extract only fields that Puppeteer accepts
            cookies = cookies.map(c => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path || '/',
                secure: c.secure || true,
                httpOnly: c.httpOnly || false
            }));
        } catch(e) {
            cookies = [{
                name: 'sessionid',
                value: pinData.tiktokCookie,
                domain: '.tiktok.com',
                path: '/',
                secure: true
            }];
        }
        await page.setCookie(...cookies);

        try {
            await page.goto('https://www.tiktok.com/creator-center/upload', { waitUntil: 'domcontentloaded', timeout: 90000 });
        } catch(err) {
            console.log("[TikTok] Goto timed out, but proceeding to check if page loaded...");
        }
        
        await delay(5000);
        const loginCheck = await page.content();
        if (loginCheck.includes('Log in')) {
            throw new Error("TikTok session expired. Please click the 'Connect TikTok' button in the extension popup again.");
        }

        console.log("[TikTok] Logged in. Initiating upload...");
        
        let fileInputHandle = null;
        for (let i = 0; i < 6; i++) { // Wait up to 30 seconds
            const fileInputs = await page.$$('input[type="file"]');
            if (fileInputs.length > 0) {
                fileInputHandle = fileInputs[0];
                break;
            } else {
                const frames = await page.frames();
                for (let f of frames) {
                    const fInput = await f.$$('input[type="file"]');
                    if (fInput.length > 0) {
                        fileInputHandle = fInput[0];
                        break;
                    }
                }
            }
            if (fileInputHandle) break;
            await delay(5000);
            console.log("[TikTok] Waiting for file input...");
        }

        if (!fileInputHandle) {
            throw new Error("TikTok upload interface not found.");
        }
        
        await fileInputHandle.uploadFile(videoPath);

        console.log("[TikTok] File selected. Waiting for upload...");
        await delay(10000);

        const captionEditor = await page.$('.public-DraftEditor-content');
        if (captionEditor) {
            await captionEditor.click({ clickCount: 3 });
            await captionEditor.press('Backspace');
            
            const cleanTitle = (pinData.title.substring(0, 80)).replace(/\n/g, ' ');
            const cleanTitleForDesc = (pinData.title.substring(0, 50)).replace(/\n/g, ' ');
            const captionText = `${cleanTitle} \n\n🔗 Link in Bio! (Look for: ⭐ ${cleanTitleForDesc}) \n#aliexpress #musthave #finds`;
            
            await captionEditor.type(captionText);
        }

        console.log("[TikTok] Clicking Post...");
        const postButton = await page.$('button[data-e2e="post-button"], .btn-post');
        if (postButton) {
            await postButton.click();
            console.log("[TikTok] Video Published!");
        }

        await delay(5000);

    } catch (err) {
        console.error("[TikTok] Upload failed:", err.message);
    } finally {
        await browser.close();
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); // Cleanup
    }
}

module.exports = { uploadToTikTok };
