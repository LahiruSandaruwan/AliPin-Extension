const puppeteer = require('puppeteer');

async function uploadToLinktree(pinData) {
    if (!pinData.linktreeCookie) {
        console.warn("[Linktree] No Linktree cookie provided. Skipping.");
        return;
    }

    console.log(`[Linktree] Adding link for ${pinData.title}...`);
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

        // Set Linktree cookie
        let cookies;
        try {
            cookies = JSON.parse(pinData.linktreeCookie);
            if (!Array.isArray(cookies)) cookies = [cookies];
        } catch(e) {
            cookies = [{
                name: 'auth_token', // Common linktree auth cookie
                value: pinData.linktreeCookie,
                domain: '.linktr.ee'
            }];
        }
        await page.setCookie(...cookies);

        await page.goto('https://linktr.ee/admin', { waitUntil: 'networkidle2' });
        
        const loginCheck = await page.content();
        if (loginCheck.includes('Log in to your Linktree') || loginCheck.includes('Welcome back')) {
            throw new Error("Linktree session expired or invalid cookie.");
        }

        console.log("[Linktree] Logged in. Adding link...");
        
        // Click Add Link button
        // Linktree uses dynamic classes, but standard text is usually "Add link"
        const addLinkBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.find(b => b.innerText && b.innerText.includes('Add link'));
        });

        if (addLinkBtn) {
            await addLinkBtn.click();
            await page.waitForTimeout(2000);
            
            // Linktree modal/inputs usually have specific aria-labels or placeholders
            const urlInput = await page.$('input[placeholder="URL"]');
            if (urlInput) {
                await urlInput.type(pinData.affLink);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(3000);
            }

            // Edit Title (Linktree auto-scrapes title, we overwrite it)
            const titleInput = await page.$('input[placeholder="Title"]');
            if (titleInput) {
                await titleInput.click({ clickCount: 3 });
                await titleInput.press('Backspace');
                
                const cleanTitle = (pinData.title.substring(0, 50)).replace(/\n/g, ' ');
                await titleInput.type(`⭐ ${cleanTitle}`);
                await page.keyboard.press('Enter');
            }

            console.log("[Linktree] Link successfully added!");
            await page.waitForTimeout(2000);
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
