const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createProductVideo } = require('./video_maker');
const { uploadToYouTubeShorts } = require('./youtube_uploader');
const { uploadToTikTok } = require('./tiktok_uploader');
const { uploadToLinktree } = require('./linktree_uploader');

// 1 minute between pins for testing (change to 15 mins for production)
const PIN_INTERVAL_MS = 1 * 60 * 1000;

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*, q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.pinterest.com/',
    'Origin': 'https://www.pinterest.com',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Pinterest-PWS-Handler': 'www/pin-creation-tool.js',
    'X-Pinterest-Source-Url': '/pin-creation-tool/',
    'X-Pinterest-AppState': 'active',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
};

/**
 * Visit pinterest.com and extract ALL cookies (csrftoken + others)
 */
async function initSession(sessionCookie) {
    try {
        const resp = await axios.get('https://www.pinterest.com/pin-creation-tool/', {
            headers: {
                'Cookie': `_pinterest_sess=${sessionCookie}`,
                'User-Agent': COMMON_HEADERS['User-Agent'],
                'Accept': 'text/html,application/xhtml+xml'
            },
            maxRedirects: 5,
            validateStatus: () => true
        });

        // Collect ALL cookies from Set-Cookie headers
        const setCookies = resp.headers['set-cookie'] || [];
        let csrfToken = null;
        let allCookies = `_pinterest_sess=${sessionCookie}`;

        for (const cookieStr of setCookies) {
            const nameVal = cookieStr.split(';')[0];
            if (nameVal) {
                allCookies += `; ${nameVal}`;
            }
            const csrfMatch = cookieStr.match(/csrftoken=([^;]+)/);
            if (csrfMatch) {
                csrfToken = csrfMatch[1];
            }
        }

        // Also try to extract app version from HTML for API calls
        let appVersion = null;
        const html = (resp.data || '').toString();
        const versionMatch = html.match(/"app_version"\s*:\s*"([^"]+)"/);
        if (versionMatch) appVersion = versionMatch[1];

        console.log(`[Pinner] Session initialized. CSRF: ${csrfToken ? csrfToken.substring(0, 10) + '...' : 'NOT FOUND'}, AppVersion: ${appVersion || 'N/A'}`);
        console.log(`[Pinner] Response status: ${resp.status}, Cookies collected: ${setCookies.length}`);

        return { csrfToken, allCookies, appVersion };
    } catch (e) {
        console.error('[Pinner] Failed to init session:', e.message);
        return { csrfToken: null, allCookies: null, appVersion: null };
    }
}

/**
 * Get user's Pinterest boards
 */
async function getUserBoards(allCookies, csrfToken, appVersion) {
    try {
        const options = {
            field_set_key: "board_picker",
            allow_stale: true,
            filter: "all",
            page_size: 50
        };

        const url = `https://www.pinterest.com/resource/BoardPickerBoardsResource/get/?source_url=%2Fpin-creation-tool%2F&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`;

        const headers = {
            ...COMMON_HEADERS,
            'Cookie': allCookies,
            'X-CSRFToken': csrfToken,
        };
        if (appVersion) headers['X-APP-VERSION'] = appVersion;

        const resp = await axios.get(url, {
            headers,
            validateStatus: () => true
        });

        if (resp.status === 200 && resp.data) {
            // Debug: log the response structure to understand what Pinterest returns
            const dataKeys = Object.keys(resp.data);
            console.log(`[Pinner] Boards response keys: ${dataKeys.join(', ')}`);
            
            let boards = [];
            const resData = resp.data.resource_response ? resp.data.resource_response.data : resp.data;
            
            // Debug: log what resData looks like
            console.log(`[Pinner] Board data type: ${typeof resData}, isArray: ${Array.isArray(resData)}`);
            if (resData && typeof resData === 'object' && !Array.isArray(resData)) {
                console.log(`[Pinner] Board data keys: ${Object.keys(resData).join(', ')}`);
                // It might be { all_boards: [...] } or { boards: [...] } or similar
                if (resData.all_boards) boards = resData.all_boards;
                else if (resData.boards) boards = resData.boards;
                else if (resData.items) boards = resData.items;
                else {
                    // Maybe the object itself is a single board, or has numbered keys
                    const vals = Object.values(resData);
                    if (vals.length > 0 && Array.isArray(vals[0])) {
                        boards = vals[0];
                    } else {
                        // Log first 500 chars to debug
                        console.log(`[Pinner] Raw board data: ${JSON.stringify(resData).substring(0, 500)}`);
                    }
                }
            } else if (Array.isArray(resData)) {
                boards = resData;
            }

            console.log(`[Pinner] Found ${boards.length} boards`);
            if (boards.length > 0) {
                console.log(`[Pinner] First board: "${boards[0].name || boards[0].title || 'unknown'}" (ID: ${boards[0].id || 'N/A'})`);
            }
            return boards;
        } else {
            console.log(`[Pinner] BoardPickerBoardsResource returned ${resp.status}, trying BoardsResource...`);
            return await getUserBoardsFallback(allCookies, csrfToken, appVersion);
        }
    } catch (e) {
        console.error('[Pinner] Failed to fetch boards:', e.message);
        return await getUserBoardsFallback(allCookies, csrfToken, appVersion);
    }
}

async function getUserBoardsFallback(allCookies, csrfToken, appVersion) {
    try {
        const options = {
            field_set_key: "profile_grid_item",
            filter: "all",
            sort: "last_pinned_to",
            username: "me",
            page_size: 25
        };
        const url = `https://www.pinterest.com/resource/BoardsResource/get/?source_url=%2F&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`;

        const headers = {
            ...COMMON_HEADERS,
            'Cookie': allCookies,
            'X-CSRFToken': csrfToken,
        };
        if (appVersion) headers['X-APP-VERSION'] = appVersion;

        const resp = await axios.get(url, {
            headers,
            validateStatus: () => true
        });

        if (resp.status === 200 && resp.data && resp.data.resource_response) {
            const boards = resp.data.resource_response.data || [];
            console.log(`[Pinner] (Fallback) Found ${boards.length} boards`);
            return boards;
        } else {
            console.error(`[Pinner] Fallback board fetch also failed (${resp.status}):`, JSON.stringify(resp.data).substring(0, 300));
            return [];
        }
    } catch (e) {
        console.error('[Pinner] Fallback board fetch error:', e.message);
        return [];
    }
}

/**
 * Create a pin using Pinterest's internal API
 */
async function createPin(allCookies, csrfToken, appVersion, boardId, imageUrl, description, link) {
    const pinOptions = {
        board_id: boardId,
        image_url: imageUrl,
        description: description,
        link: link,
        method: "scraped",
        scrape_metric: { source: "www_url_scrape" }
    };

    const formData = new URLSearchParams();
    formData.append('source_url', '/pin-creation-tool/');
    formData.append('data', JSON.stringify({ options: pinOptions, context: {} }));

    const headers = {
        ...COMMON_HEADERS,
        'Cookie': allCookies,
        'X-CSRFToken': csrfToken,
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (appVersion) headers['X-APP-VERSION'] = appVersion;

    const resp = await axios.post('https://www.pinterest.com/resource/PinResource/create/', formData.toString(), {
        headers,
        validateStatus: () => true
    });

    if (resp.status === 200 && resp.data && resp.data.resource_response) {
        const pin = resp.data.resource_response.data;
        console.log(`[Pinner] Pin created! Pinterest Pin ID: ${pin.id}`);
        return pin;
    } else {
        const errMsg = JSON.stringify(resp.data).substring(0, 500);
        throw new Error(`Pinterest API error (${resp.status}): ${errMsg}`);
    }
}

async function processNextPin(queueFile) {
    let queue = [];
    try {
        queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    } catch (e) {
        return false;
    }

    const nextPinIndex = queue.findIndex(p => p.status === 'pending');
    if (nextPinIndex === -1) {
        return false;
    }

    const pinData = queue[nextPinIndex];
    console.log(`[Pinner] Processing pin: ${pinData.title}`);

    if (!pinData.pinterestCookie) {
        console.error(`[Pinner] Missing Pinterest cookie. Skipping.`);
        queue[nextPinIndex].status = 'failed';
        queue[nextPinIndex].error = 'Missing Pinterest session cookie';
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
        return true;
    }

    queue[nextPinIndex].status = 'processing';
    fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

    try {
        // Step 1: Initialize session - get CSRF token and all cookies
        console.log('[Pinner] Step 1: Initializing Pinterest session...');
        const { csrfToken, allCookies, appVersion } = await initSession(pinData.pinterestCookie);
        if (!csrfToken) {
            throw new Error('Could not get CSRF token - session cookie may be expired. Re-login to Pinterest in Chrome.');
        }

        // Step 2: Get boards
        console.log('[Pinner] Step 2: Fetching boards...');
        const boards = await getUserBoards(allCookies, csrfToken, appVersion);
        if (boards.length === 0) {
            throw new Error('No boards found. Pinterest API may require re-authentication.');
        }

        // Find matching board
        const targetBoardName = (pinData.board || 'Viral Finds').toLowerCase();
        let selectedBoard = boards.find(b => (b.name || '').toLowerCase().includes(targetBoardName));
        if (!selectedBoard) {
            selectedBoard = boards[0];
            console.log(`[Pinner] Board "${targetBoardName}" not found, using: "${selectedBoard.name}"`);
        } else {
            console.log(`[Pinner] Using board: "${selectedBoard.name}" (ID: ${selectedBoard.id})`);
        }

        // Step 3: Shorten affiliate link
        let finalAffLink = pinData.affLink;
        if (finalAffLink.includes('aliexpress.com') && !finalAffLink.includes('s.click')) {
            try {
                const res = await axios.get(`https://is.gd/create.php?format=json&url=${encodeURIComponent(finalAffLink)}`);
                if (res.data && res.data.shorturl) finalAffLink = res.data.shorturl;
            } catch(e) { console.log("[Pinner] Link shortener failed, using original URL"); }
        }

        // Step 4: Create the pin
        console.log('[Pinner] Step 3: Creating pin on Pinterest...');
        const safeDesc = pinData.description.substring(0, 450);
        const pin = await createPin(
            allCookies,
            csrfToken,
            appVersion,
            selectedBoard.id,
            pinData.imageUrl,
            safeDesc,
            finalAffLink
        );

        console.log(`[Pinner] ✅ Successfully pinned: ${pinData.title}`);

        // Update queue status
        queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        const idx = queue.findIndex(p => p.pinId === pinData.pinId);
        if (idx !== -1) {
            queue[idx].status = 'completed';
            queue[idx].completedAt = Date.now();
            queue[idx].pinterestPinId = pin.id;
        }
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

        // Generate Video & Upload concurrently AFTER successful pin
        if (pinData.youtubeCookie || pinData.tiktokCookie || pinData.linktreeCookie) {
            console.log(`[Pinner] Initiating video creation and uploads for ${pinData.title}...`);
            createProductVideo(pinData).then(videoPath => {
                const uploads = [];
                if (pinData.youtubeCookie) {
                    uploads.push(uploadToYouTubeShorts(pinData, videoPath).catch(e => console.error("YT Error:", e)));
                }
                if (pinData.tiktokCookie) {
                    uploads.push(uploadToTikTok(pinData, videoPath).catch(e => console.error("TikTok Error:", e)));
                }
                if (pinData.linktreeCookie) {
                    uploads.push(uploadToLinktree(pinData).catch(e => console.error("Linktree Error:", e)));
                }
                return Promise.all(uploads);
            }).then(() => {
                console.log(`[Pinner] All uploads completed for ${pinData.title}!`);
            }).catch(e => {
                console.error("[Pinner] Video/Upload error:", e);
            });
        }

    } catch (error) {
        console.error(`[Pinner] ❌ Error pinning:`, error.message);
        queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        const idx = queue.findIndex(p => p.pinId === pinData.pinId);
        if (idx !== -1) {
            queue[idx].status = 'failed';
            queue[idx].error = error.message;
        }
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
    }

    return true;
}

function startPinnerService(queueFile) {
    (async function loop() {
        while (true) {
            try {
                const processed = await processNextPin(queueFile);
                if (processed) {
                    console.log(`[Pinner] Waiting ${PIN_INTERVAL_MS / 1000 / 60} minutes before next pin...`);
                    await delay(PIN_INTERVAL_MS);
                } else {
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
