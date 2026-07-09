const puppeteer = require('puppeteer');
const fs = require('fs');

async function uploadToYouTubeShorts(pinData, videoPath) {
    if (!pinData.youtubeCookie) {
        console.warn("[YouTube] No YouTube cookie provided. Skipping.");
        return;
    }

    console.log(`[YouTube] Starting upload for ${pinData.title}...`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    try {
        const page = await browser.newPage();
        
        // RAM Optimization: Block unnecessary requests
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Parse and set cookie (assuming JSON format like Pinterest)
        let cookies;
        try {
            cookies = JSON.parse(pinData.youtubeCookie);
            if (!Array.isArray(cookies)) cookies = [cookies];
        } catch(e) {
            // Fallback for simple string cookie
            cookies = [{
                name: 'LOGIN_INFO',
                value: pinData.youtubeCookie,
                domain: '.youtube.com'
            }];
        }
        await page.setCookie(...cookies);

        await page.goto('https://studio.youtube.com/', { waitUntil: 'networkidle2' });
        
        // Verify login
        const loginUrl = page.url();
        if (loginUrl.includes('accounts.google.com')) {
            throw new Error("YouTube session expired or invalid cookie.");
        }

        console.log("[YouTube] Logged in. Initiating upload...");
        
        // Click Create -> Upload Videos
        await page.waitForSelector('#create-icon', { timeout: 10000 });
        await page.click('#create-icon');
        await page.waitForSelector('#text-item-0', { timeout: 5000 });
        await page.click('#text-item-0');

        // Upload File
        await page.waitForSelector('input[type="file"]', { timeout: 10000 });
        const fileInput = await page.$('input[type="file"]');
        await fileInput.uploadFile(videoPath);
        
        console.log("[YouTube] File selected. Waiting for upload details...");

        // Wait for Details page
        await page.waitForSelector('#textbox', { timeout: 30000 });

        // Title
        const titleBox = await page.$$('#textbox');
        if (titleBox.length > 0) {
            await titleBox[0].click({ clickCount: 3 });
            await titleBox[0].press('Backspace');
            const cleanTitle = (pinData.title.substring(0, 80) + ' #shorts').replace(/\n/g, ' ');
            await titleBox[0].type(cleanTitle);
        }

        // Description
        if (titleBox.length > 1) {
            await titleBox[1].click();
            
            const cleanTitleForDesc = (pinData.title.substring(0, 50)).replace(/\n/g, ' ');
            await titleBox[1].type(`${pinData.description}\n\n🔗 Link in Bio! (Look for: ⭐ ${cleanTitleForDesc})`);
        }

        // Wait for Next buttons (Simplified flow)
        for (let i = 0; i < 3; i++) {
            await page.waitForTimeout(2000);
            const nextBtn = await page.$('#next-button');
            if (nextBtn) await nextBtn.click();
        }

        // Visibility (Public)
        await page.waitForSelector('tp-yt-paper-radio-button[name="PUBLIC"]', { timeout: 10000 });
        await page.click('tp-yt-paper-radio-button[name="PUBLIC"]');

        // Publish
        const doneBtn = await page.$('#done-button');
        if (doneBtn) {
            await doneBtn.click();
            console.log("[YouTube] Video Published!");
        }

        // Give it a moment to complete
        await page.waitForTimeout(5000);

    } catch (err) {
        console.error("[YouTube] Upload failed:", err.message);
    } finally {
        await browser.close();
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); // Cleanup
    }
}

module.exports = { uploadToYouTubeShorts };
