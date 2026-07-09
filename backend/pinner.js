const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 15 minutes between pins to avoid spam
const PIN_INTERVAL_MS = 15 * 60 * 1000; 

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function processNextPin(queueFile) {
    let queue = [];
    try {
        queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    } catch (e) {
        return false;
    }

    const nextPinIndex = queue.findIndex(p => p.status === 'pending');
    if (nextPinIndex === -1) {
        return false; // Nothing to do
    }

    const pinData = queue[nextPinIndex];
    console.log(`[Pinner] Processing pin: ${pinData.title}`);
    
    // We expect the Chrome extension to pass the Pinterest session cookie
    if (!pinData.pinterestCookie) {
        console.error(`[Pinner] Missing Pinterest cookie. Skipping.`);
        queue[nextPinIndex].status = 'failed';
        queue[nextPinIndex].error = 'Missing Pinterest session cookie';
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
        return true; 
    }

    let browser = null;
    try {
        // Find local Chrome executable
        const executablePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser'
        ];
        
        let chromePath = executablePaths.find(fs.existsSync);
        if (!chromePath) throw new Error("Chrome/Chromium not found on this system.");

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--blink-settings=imagesEnabled=false' // RAM Optimization: block images
            ]
        });

        const page = await browser.newPage();
        
        // RAM Optimization: Block CSS, Fonts, and Media
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Set Pinterest Session Cookie to authenticate
        await page.setCookie({
            name: '_pinterest_sess',
            value: pinData.pinterestCookie,
            domain: '.pinterest.com',
            path: '/',
            secure: true,
            httpOnly: true
        });

        // Set Referer to bypass Pinterest's anti-spam block for affiliate links
        await page.setExtraHTTPHeaders({
            'Referer': 'https://www.aliexpress.com/'
        });

        // Shorten link just in case it's a long link from an older queue item
        let finalAffLink = pinData.affLink;
        if (finalAffLink.includes('aliexpress.com') && !finalAffLink.includes('s.click')) {
            try {
                const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(finalAffLink)}`);
                const data = await res.json();
                if (data && data.shorturl) finalAffLink = data.shorturl;
            } catch(e) { console.log("Backend shortener failed"); }
        }

        // Open the Pinterest Extension creation page
        const safeDesc = pinData.description.substring(0, 450);
        const pinterestUrl = `https://www.pinterest.com/pin/create/extension/?url=${encodeURIComponent(finalAffLink)}&media=${encodeURIComponent(pinData.imageUrl)}&description=${encodeURIComponent(safeDesc)}`;
        
        await page.goto(pinterestUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for the board selector to appear
        await page.waitForSelector('[data-test-id="board-row-wrapper"]', { timeout: 30000 });
        
        // Find the correct board or default
        const targetBoard = (pinData.board || 'Viral Finds').toLowerCase();
        
        const boards = await page.$$('[data-test-id="board-row-wrapper"]');
        let selectedBoard = null;
        
        for (const board of boards) {
            const text = await page.evaluate(el => el.textContent.toLowerCase(), board);
            if (text.includes(targetBoard)) {
                selectedBoard = board;
                break;
            }
        }
        
        if (!selectedBoard && boards.length > 0) {
            selectedBoard = boards[0];
            console.log(`[Pinner] Board "${targetBoard}" not found, using first available.`);
        }
        
        if (!selectedBoard) {
            throw new Error("No boards found to save the pin.");
        }
        
        // Click the Save button for that board
        const saveBtn = await selectedBoard.$('button');
        if (saveBtn) {
            await saveBtn.click();
            await delay(5000); // Wait for save request to complete
        } else {
            throw new Error("Save button not found on board row.");
        }

        console.log(`[Pinner] Successfully pinned: ${pinData.title}`);
        
        // Update queue status
        queue[nextPinIndex].status = 'completed';
        queue[nextPinIndex].completedAt = Date.now();
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

    } catch (error) {
        console.error(`[Pinner] Error pinning:`, error.message);
        queue[nextPinIndex].status = 'failed';
        queue[nextPinIndex].error = error.message;
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
    } finally {
        if (browser) {
            await browser.close();
        }
    }
    
    return true; // We processed an item
}

function startPinnerService(queueFile) {
    // Run an infinite loop that checks the queue
    (async function loop() {
        while (true) {
            try {
                const processed = await processNextPin(queueFile);
                if (processed) {
                    console.log(`[Pinner] Waiting ${PIN_INTERVAL_MS / 1000 / 60} minutes before next pin...`);
                    await delay(PIN_INTERVAL_MS);
                } else {
                    // If queue is empty, check again in 30 seconds
                    await delay(30000);
                }
            } catch (e) {
                console.error("[Pinner] Fatal loop error:", e);
                await delay(30000);
            }
        }
    })();
}

module.exports = { startPinnerService };
