const puppeteer = require('puppeteer');
const fs = require('fs');

async function uploadToTikTok(pinData, videoPath) {
    if (!pinData.tiktokCookie) {
        console.warn("[TikTok] No TikTok cookie provided. Skipping.");
        return;
    }

    console.log(`[TikTok] Starting upload for ${pinData.title}...`);
    const browser = await puppeteer.launch({
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
        } catch(e) {
            cookies = [{
                name: 'sessionid',
                value: pinData.tiktokCookie,
                domain: '.tiktok.com'
            }];
        }
        await page.setCookie(...cookies);

        await page.goto('https://www.tiktok.com/creator-center/upload', { waitUntil: 'networkidle2' });
        
        // Wait for iframe if present (TikTok sometimes puts the uploader in an iframe)
        await page.waitForTimeout(5000);
        const loginCheck = await page.content();
        if (loginCheck.includes('Log in')) {
            throw new Error("TikTok session expired or invalid cookie.");
        }

        console.log("[TikTok] Logged in. Initiating upload...");
        
        // Find file input and upload
        // Note: TikTok web uploader DOM changes frequently, this is a generic selector
        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length === 0) {
            // Try inside iframe
            const frames = await page.frames();
            for (let f of frames) {
                const fInput = await f.$$('input[type="file"]');
                if (fInput.length > 0) {
                    await fInput[0].uploadFile(videoPath);
                    break;
                }
            }
        } else {
            await fileInputs[0].uploadFile(videoPath);
        }

        console.log("[TikTok] File selected. Waiting for upload...");
        await page.waitForTimeout(10000);

        // Fill caption (Find the contenteditable div for the Draft.js editor)
        const captionEditor = await page.$('.public-DraftEditor-content');
        if (captionEditor) {
            await captionEditor.click({ clickCount: 3 });
            await captionEditor.press('Backspace');
            
            const cleanTitle = (pinData.title.substring(0, 80)).replace(/\n/g, ' ');
            const cleanTitleForDesc = (pinData.title.substring(0, 50)).replace(/\n/g, ' ');
            const captionText = `${cleanTitle} \n\n🔗 Link in Bio! (Look for: ⭐ ${cleanTitleForDesc}) \n#aliexpress #musthave #finds`;
            
            await captionEditor.type(captionText);
        }

        // Click Post
        console.log("[TikTok] Clicking Post...");
        const postButton = await page.$('button[data-e2e="post-button"], .btn-post');
        if (postButton) {
            await postButton.click();
            console.log("[TikTok] Video Published!");
        }

        await page.waitForTimeout(5000);

    } catch (err) {
        console.error("[TikTok] Upload failed:", err.message);
    } finally {
        await browser.close();
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); // Cleanup
    }
}

module.exports = { uploadToTikTok };
