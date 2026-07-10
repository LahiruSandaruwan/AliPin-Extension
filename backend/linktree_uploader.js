const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function uploadToLinktree(pinData) {
    console.log(`[Linktree] Adding link for ${pinData.title}...`);
    
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

        // Set Linktree cookie
        let cookies;
        try {
            cookies = JSON.parse(pinData.linktreeCookie);
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
                name: 'auth_token', // Common linktree auth cookie
                value: pinData.linktreeCookie,
                domain: '.linktr.ee',
                path: '/',
                secure: true
            }];
        }
        await page.setCookie(...cookies);

        await page.goto('https://linktr.ee/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        const loginCheck = await page.content();
        if (loginCheck.includes('Log in to your Linktree') || loginCheck.includes('Welcome back')) {
            throw new Error("Linktree session expired. Please click the 'Connect Linktree' button in the extension popup again.");
        }

        console.log("[Linktree] Logged in. Adding link...");
        
        // Click Add Link button
        let addLinkBtn = null;
        for (let i = 0; i < 15; i++) { // wait up to 30s
            addLinkBtn = await page.evaluateHandle(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                return btns.find(b => b.innerText && b.innerText.toLowerCase().includes('add') && b.innerText.toLowerCase().includes('link'));
            });
            const isElement = await addLinkBtn.evaluate(el => el !== undefined && el !== null);
            if (isElement) break;
            addLinkBtn = null;
            await delay(2000);
        }

        if (addLinkBtn) {
            await addLinkBtn.evaluate(el => el.click());
            await delay(2000);
            
            const urlInput = await page.$('input[placeholder="URL"]');
            if (urlInput) {
                await urlInput.type(pinData.affLink);
                await page.keyboard.press('Enter');
                await delay(3000);
            }

            // Edit Title
            const titleInput = await page.$('input[placeholder="Title"]');
            if (titleInput) {
                await titleInput.click({ clickCount: 3 });
                await titleInput.press('Backspace');
                
                const cleanTitle = (pinData.title.substring(0, 50)).replace(/\n/g, ' ');
                await titleInput.type(`⭐ ${cleanTitle}`);
                await page.keyboard.press('Enter');
            }

            console.log("[Linktree] Link successfully added!");
            await delay(2000);
        } else {
            console.error("[Linktree] Could not find 'Add link' button.");
        }

    } catch (err) {
        console.error("[Linktree] Upload failed:", err.message);
    } finally {
        await browser.close();
    }
}

module.exports = { uploadToLinktree };
