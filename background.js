// AliPin Chrome Extension - Background Service Worker (Autopilot & Scheduler Coordinator)

let activePinningTabId = null;
let activePinningId = null;
let pinningTimeoutId = null;

let activeTrendsTabId = null;
let trendsTimeoutId = null;

let activeSourcingTabId = null;
let activeSourcingKeyword = null;
let sourcingTimeoutId = null;

let keywordsToSource = [];
let maxProductsPerKeyword = 10; // Products per keyword per sourcing run
const MAX_QUEUE_SIZE = 5000;   // Hard cap on total pin queue size

// Evergreen fallback keywords used when all trend sources fail
const FALLBACK_KEYWORDS = [
  'LED strip lights', 'portable blender', 'phone stand', 'cable organizer',
  'silicone mold', 'nail art kit', 'car air freshener', 'mini projector',
  'reusable bag', 'magnetic phone mount', 'desk organizer', 'bath bomb mold',
  'jewelry organizer', 'smart plug', 'kitchen gadget', 'travel pillow',
  'yoga mat', 'resistance bands', 'LED desk lamp', 'wireless charger'
];

// --- 1. INITIALIZATION ---
chrome.runtime.onInstalled.addListener(() => {
  console.log("AliPin Extension Installed.");
  initializeSettings();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("AliPin Extension Startup.");
  setupAlarms();
});

async function initializeSettings() {
  const defaults = {
    trackingId: '_c3PWNQIr', // Default tracker format
    linkRouting: 'direct',
    bridgeUrl: 'https://linktr.ee/yourprofile',
    autopilotEnabled: false,
    postingInterval: 4, // Every 4 hours (approx 6 pins per day)
    sourcingLimit: 5,   // Source 5 keywords daily
    sourcingMode: 'trends', // 'trends' | 'google' | 'custom'
    customKeywords: 'cool gadgets, room decor, kitchen gadgets',
    pinQueue: []
  };

  chrome.storage.local.get(Object.keys(defaults), (result) => {
    const updates = {};
    for (const key in defaults) {
      if (result[key] === undefined) {
        updates[key] = defaults[key];
      }
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log("AliPin default settings initialized:", updates);
        setupAlarms();
      });
    } else {
      setupAlarms();
    }
  });
}

// Set up alarms for Scheduler and Sourcing
async function setupAlarms() {
  chrome.storage.local.get(['autopilotEnabled', 'postingInterval'], (result) => {
    // 1. Posting Scheduler Alarm
    chrome.alarms.clear('pinSchedulerAlarm', () => {
      const interval = parseFloat(result.postingInterval) || 4;
      chrome.alarms.create('pinSchedulerAlarm', { periodInMinutes: interval * 60 });
      console.log(`AliPin: Registered pin scheduler alarm for every ${interval} hours.`);
    });

    // 2. Trend Discovery Alarm (runs every 24 hours)
    chrome.alarms.clear('trendDiscoveryAlarm', () => {
      chrome.alarms.create('trendDiscoveryAlarm', { periodInMinutes: 24 * 60 });
      console.log("AliPin: Registered daily trend discovery alarm.");
    });
  });
}

// Listen to storage changes to reconfigure alarms
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.postingInterval || changes.autopilotEnabled)) {
    console.log("AliPin: Settings changed, updating alarms...");
    setupAlarms();
  }
});

// --- 2. ALARM TRIGGER HANDLER ---
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`AliPin: Alarm fired: ${alarm.name}`);
  if (alarm.name === 'pinSchedulerAlarm') {
    processNextPin();
  } else if (alarm.name === 'trendDiscoveryAlarm') {
    triggerTrendSourcing();
  }
});

// --- 3. AUTO-PINNING RUNNER ---
async function processNextPin() {
  chrome.storage.local.get(['pinQueue', 'autopilotEnabled'], async (result) => {
    const queue = result.pinQueue || [];
    const queuedItemIndex = queue.findIndex(item => item.status === 'queued');

    if (queuedItemIndex === -1) {
      console.log("AliPin: No queued pins found.");
      return;
    }

    const item = queue[queuedItemIndex];
    console.log(`AliPin: Scheduler is processing pin ID ${item.id} - "${item.title}"`);

    // Mark as active
    queue[queuedItemIndex].status = 'processing';
    await chrome.storage.local.set({ pinQueue: queue });

    // Fetch Pinterest session cookie to send to the backend
    let pinterestCookie = '';
    try {
      const cookie = await chrome.cookies.get({ url: 'https://www.pinterest.com', name: '_pinterest_sess' });
      if (cookie) pinterestCookie = cookie.value;
    } catch (e) {
      console.warn("Could not read Pinterest cookie", e);
    }

    // Clean image URL to ensure it ends in .jpg or .png
    let cleanImage = item.imageUrl.replace(/_[0-9]+x[0-9]+.*\.jpg/i, '');
    const validIndex = Math.max(cleanImage.toLowerCase().lastIndexOf('.jpg'), cleanImage.toLowerCase().lastIndexOf('.png'));
    if (validIndex !== -1) cleanImage = cleanImage.substring(0, validIndex + 4);

    const payload = {
      affLink: item.affLink,
      imageUrl: cleanImage,
      description: item.description,
      title: item.title,
      board: item.board,
      pinId: item.id,
      pinterestCookie: pinterestCookie
    };

    try {
      // Send to local Node.js backend
      const response = await fetch('http://localhost:3333/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Backend returned status ' + response.status);
      }

      console.log(`AliPin: Successfully sent pin ${item.id} to backend.`);
      
      // Remove from Chrome queue since backend has taken ownership
      queue.splice(queuedItemIndex, 1);
      await chrome.storage.local.set({ pinQueue: queue });
      updateBadge(queue.length);
      
    } catch (error) {
      console.error("AliPin: Failed to send pin to backend:", error);
      // Mark failed so it doesn't get stuck processing
      queue[queuedItemIndex].status = 'failed';
      queue[queuedItemIndex].error = 'Could not reach backend daemon';
      await chrome.storage.local.set({ pinQueue: queue });
    }
  });
}

async function handlePinSuccess(pinId) {
  console.log(`AliPin: Pin ID ${pinId} successfully posted!`);
  if (pinningTimeoutId) clearTimeout(pinningTimeoutId);
  
  if (activePinningTabId) {
    try {
      await chrome.tabs.remove(activePinningTabId);
    } catch(e) {}
    activePinningTabId = null;
  }
  activePinningId = null;

  chrome.storage.local.get(['pinQueue'], async (result) => {
    const queue = result.pinQueue || [];
    const idx = queue.findIndex(item => item.id === pinId);
    if (idx !== -1) {
      queue[idx].status = 'completed';
      queue[idx].completedAt = Date.now();
      await chrome.storage.local.set({ pinQueue: queue });
    }
  });
}

async function handlePinFailure(pinId, reason) {
  console.warn(`AliPin: Pin ID ${pinId} failed: ${reason}`);
  if (pinningTimeoutId) clearTimeout(pinningTimeoutId);
  
  if (activePinningTabId) {
    try {
      await chrome.tabs.remove(activePinningTabId);
    } catch(e) {}
    activePinningTabId = null;
  }
  activePinningId = null;

  chrome.storage.local.get(['pinQueue'], async (result) => {
    const queue = result.pinQueue || [];
    const idx = queue.findIndex(item => item.id === pinId);
    if (idx !== -1) {
      queue[idx].status = 'failed';
      queue[idx].error = reason;
      queue[idx].failedAt = Date.now();
      await chrome.storage.local.set({ pinQueue: queue });
    }
  });
}

// --- 4. AUTOPILOT TREND & PRODUCT SOURCING ---
async function triggerTrendSourcing() {
  chrome.storage.local.get(['autopilotEnabled', 'sourcingMode', 'customKeywords', 'sourcingLimit'], async (result) => {
    if (!result.autopilotEnabled) {
      console.log("AliPin Autopilot is disabled. Sourcing skipped.");
      return;
    }

    const mode = result.sourcingMode || 'trends';
    const limit = parseInt(result.sourcingLimit) || 5;

    console.log(`AliPin: Sourcing trigger activated in "${mode}" mode.`);

    if (mode === 'trends') {
      // 1. Pinterest Trends scraping via tab
      try {
        const tab = await chrome.tabs.create({ url: "https://trends.pinterest.com/shopping?country=US", active: false });
        activeTrendsTabId = tab.id;
        
        if (trendsTimeoutId) clearTimeout(trendsTimeoutId);
        trendsTimeoutId = setTimeout(() => {
          console.warn("AliPin: Pinterest Trends scraping timed out. Falling back to Google Trends.");
          closeTrendsTab();
          fallbackToGoogleTrends(limit);
        }, 45000);
      } catch (err) {
        console.error("AliPin: Failed to open trends page. Falling back to Google Trends.", err);
        fallbackToGoogleTrends(limit);
      }
    } else if (mode === 'google') {
      // 2. Direct Google Trends RSS fetch
      fallbackToGoogleTrends(limit);
    } else {
      // 3. Custom Sourcing using user keywords
      const words = (result.customKeywords || "")
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0);
      
      if (words.length > 0) {
        startAliExpressSourcing(words.slice(0, limit));
      } else {
        console.warn("AliPin: Custom keywords empty. Autopilot sourcing aborted.");
      }
    }
  });
}

function closeTrendsTab() {
  if (activeTrendsTabId) {
    try {
      chrome.tabs.remove(activeTrendsTabId);
    } catch(e) {}
    activeTrendsTabId = null;
  }
  if (trendsTimeoutId) clearTimeout(trendsTimeoutId);
}

// Fetch Google Trends RSS as fallback or primary
async function fallbackToGoogleTrends(limit) {
  // Try multiple Google Trends RSS endpoint variants
  const RSS_URLS = [
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US",
    "https://trends.google.com/trending/rss?geo=US"
  ];

  for (const rssUrl of RSS_URLS) {
    try {
      console.log("AliPin: Fetching Google Trends RSS from:", rssUrl);
      const res = await fetch(rssUrl, {
        headers: { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
      });

      if (!res.ok) {
        console.warn(`AliPin: Google Trends RSS returned status ${res.status} — skipping.`);
        continue;
      }

      const xml = await res.text();

      // Parse XML using regex (DOMParser is not available in MV3 service workers)
      let terms = [];
      // Matches both plain <title>foo</title> and CDATA <title><![CDATA[foo]]></title>
      const itemTitleRegex = /<item[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
      let match;
      while ((match = itemTitleRegex.exec(xml)) !== null && terms.length < limit) {
        const term = match[1].trim();
        if (term.length > 0) terms.push(term);
      }
      // Fallback: if item-scoped parsing gets nothing, try all <title> tags skipping the first (feed title)
      if (terms.length === 0) {
        const allTitles = xml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g);
        if (allTitles && allTitles.length > 1) {
          terms = allTitles.slice(1, limit + 1).map(m =>
            m.replace(/<\/?title>|<!\[CDATA\[|\]\]>/g, '').trim()
          ).filter(t => t.length > 0 && t.length < 100); // sanity-check length
        }
      }

      if (terms.length > 0) {
        console.log("AliPin: Google Trends sourced terms:", terms);
        startAliExpressSourcing(terms);
        return; // Success — exit the retry loop
      } else {
        console.warn("AliPin: Google Trends RSS parsed but returned 0 terms.");
      }
    } catch (err) {
      console.warn("AliPin: Google Trends RSS fetch error:", err.message);
    }
  }

  // All network sources failed — use hardcoded evergreen keyword list as last resort
  console.warn("AliPin: All trend sources failed. Using hardcoded evergreen keyword fallback.");
  const shuffled = [...FALLBACK_KEYWORDS].sort(() => Math.random() - 0.5);
  startAliExpressSourcing(shuffled.slice(0, limit));
}

// Coordinator for sequencing AliExpress searches
function startAliExpressSourcing(keywords) {
  keywordsToSource = keywords;
  console.log(`AliPin: Initiating AliExpress Sourcing for ${keywordsToSource.length} keywords.`);
  sourceNextKeyword();
}

async function sourceNextKeyword() {
  if (keywordsToSource.length === 0) {
    console.log("AliPin: Autopilot Sourcing sequence completed.");
    if (activeSourcingTabId) {
      try {
        await chrome.tabs.remove(activeSourcingTabId);
      } catch(e) {}
      activeSourcingTabId = null;
    }
    return;
  }

  const keyword = keywordsToSource.shift();
  console.log(`AliPin: Searching AliExpress for keyword: "${keyword}"`);

  // Open AliExpress search page in active or background tab
  const url = `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(keyword)}.html?sortType=default&g=y&autoProspect=true&sourcingKeyword=${encodeURIComponent(keyword)}`;

  try {
    if (activeSourcingTabId) {
      console.log(`AliPin: Reusing tab ${activeSourcingTabId} for keyword: "${keyword}"`);
      await chrome.tabs.update(activeSourcingTabId, { url: url });
    } else {
      console.log(`AliPin: Creating new tab for keyword: "${keyword}"`);
      const tab = await chrome.tabs.create({ url: url, active: false });
      activeSourcingTabId = tab.id;
    }
    activeSourcingKeyword = keyword;

    if (sourcingTimeoutId) clearTimeout(sourcingTimeoutId);
    sourcingTimeoutId = setTimeout(() => {
      console.warn(`AliPin: AliExpress sourcing timed out for keyword: "${keyword}"`);
      closeSourcingTab();
      // Continue to next keyword (will open a fresh tab since activeSourcingTabId is set to null)
      sourceNextKeyword();
    }, 45000);

  } catch (err) {
    console.error("AliPin: Failed to open or navigate AliExpress search tab", err);
    closeSourcingTab();
    sourceNextKeyword();
  }
}

function closeSourcingTab() {
  if (activeSourcingTabId) {
    try {
      chrome.tabs.remove(activeSourcingTabId);
    } catch(e) {}
    activeSourcingTabId = null;
  }
  activeSourcingKeyword = null;
  if (sourcingTimeoutId) clearTimeout(sourcingTimeoutId);
}

// --- 5. RUNTIME MESSAGE RECEIVER ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Pinterest Trends Script reports scraped keywords
  if (message.action === 'trendsScraped') {
    if (sender.tab && sender.tab.id === activeTrendsTabId) {
      console.log("AliPin: Trends scraped response received.");
      closeTrendsTab();
      
      const keywords = message.keywords || [];
      if (keywords.length > 0) {
        chrome.storage.local.get(['sourcingLimit'], (result) => {
          const limit = parseInt(result.sourcingLimit) || 5;
          startAliExpressSourcing(keywords.slice(0, limit));
        });
      } else {
        // Fallback if scraping trends page returned empty
        chrome.storage.local.get(['sourcingLimit'], (result) => {
          fallbackToGoogleTrends(parseInt(result.sourcingLimit) || 5);
        });
      }
    }
  }

  // 2. AliExpress Content Script reports sourced products
  else if (message.action === 'searchProductsScraped') {
    if (sender.tab && sender.tab.id === activeSourcingTabId) {
      console.log(`AliPin: AliExpress products scraped for keyword "${message.keyword}".`);
      
      // Clear timeout and reset keyword, but KEEP activeSourcingTabId alive to reuse!
      if (sourcingTimeoutId) clearTimeout(sourcingTimeoutId);
      const keyword = message.keyword;
      activeSourcingKeyword = null;

      const products = message.products || [];
      if (products.length > 0) {
        processAndQueueSourcedProducts(products, keyword);
      } else {
        console.log(`AliPin: No products matching winning criteria found for keyword "${message.keyword}".`);
      }
      
      // Sequence next keyword search after a short cooling delay (e.g. 2s)
      setTimeout(sourceNextKeyword, 2000);
    }
  }

  // 3. Pinterest Content Script reports pin success
  else if (message.action === 'pinSuccess') {
    if (message.pinId) {
      handlePinSuccess(message.pinId);
    }
  }

  // 4. Pinterest Content Script reports pin failure
  else if (message.action === 'pinFailed') {
    if (message.pinId) {
      handlePinFailure(message.pinId, message.error || "Unknown pinning error");
    }
  }

  // 5. Force Manual Run of Autopilot from Popup
  else if (message.action === 'triggerAutopilotNow') {
    triggerTrendSourcing();
    sendResponse({ status: "Autopilot Sourcing Started" });
  }

  return true; // Keep message channel open
});

// --- 6. AUTO-QUEUE GENERATION LOGIC ---
function processAndQueueSourcedProducts(products, keyword) {
  chrome.storage.local.get(['trackingId', 'linkRouting', 'bridgeUrl', 'pinQueue'], async (result) => {
    const queue = result.pinQueue || [];
    const trackingId = result.trackingId || '_c3PWNQIr';
    const routing = result.linkRouting || 'direct';
    const bridgeUrl = result.bridgeUrl || 'https://linktr.ee/yourprofile';

    // Hard cap: refuse to add more items if queue already at max capacity
    const queuedCount = queue.filter(item => item.status === 'queued').length;
    if (queuedCount >= MAX_QUEUE_SIZE) {
      console.log(`AliPin: Queue is at max capacity (${MAX_QUEUE_SIZE}). Skipping sourcing for keyword: "${keyword}".`);
      return;
    }
    const slotsRemaining = MAX_QUEUE_SIZE - queuedCount;
    const productsToProcess = products.slice(0, Math.min(maxProductsPerKeyword, slotsRemaining));

    let itemsQueuedCount = 0;

    for (const prod of productsToProcess) {
      // Check if product is already in queue to prevent duplicate pins
      const isDuplicate = queue.some(item => {
        const itemMatch = item.productUrl.match(/\/(\d+)\.html/) || [];
        const prodMatch = prod.productUrl.match(/\/(\d+)\.html/) || [];
        return (itemMatch[1] && prodMatch[1] && itemMatch[1] === prodMatch[1]) || item.productUrl === prod.productUrl;
      });

      if (isDuplicate) {
        console.log(`AliPin: Skipping duplicate product: "${prod.title}"`);
        continue;
      }

      // Generate Link
      let finalLink = "";
      if (routing === 'direct') {
        if (prod.sClickUrl) {
          finalLink = prod.sClickUrl;
        } else {
          try {
            const urlObj = new URL(prod.productUrl);
            urlObj.searchParams.set('aff_platform', 'portals-promotion');
            urlObj.searchParams.set('sk', trackingId);
            finalLink = urlObj.toString();
          } catch(e) {
            finalLink = prod.productUrl + `?aff_platform=portals-promotion&sk=${trackingId}`;
          }
        }
      } else {
        const match = prod.productUrl.match(/\/(\d+)\.html/);
        const productId = match ? match[1] : 'ali_item';
        finalLink = bridgeUrl + (bridgeUrl.includes('?') ? '&' : '?') + `product=${productId}`;
      }

      // Shorten the affiliate link to prevent Pinterest from stripping tracking params
      if (finalLink.includes('aliexpress.com') && !finalLink.includes('s.click')) {
        try {
            const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(finalLink)}`);
            const data = await res.json();
            if (data && data.shorturl) finalLink = data.shorturl;
        } catch(e) { console.warn("Shortener failed in background.js"); }
      }

      // Generate title & descriptions
      const seoTitle = generateSeoTitle(prod.title);
      const rawDesc = generateSmartDescription(prod.title);
      
      const hashtags = generateHashtags(prod.title);
      const disclosureDesc = enforceDisclosures("📌 " + seoTitle + "\n\n" + rawDesc + `\n\n${hashtags}`);
      
      const board = getBoardName(prod.title);

      const queueItem = {
        id: 'pin_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        title: seoTitle,
        imageUrl: prod.imageUrl,
        productUrl: prod.productUrl,
        affLink: finalLink,
        description: disclosureDesc,
        board: board,
        status: 'queued',
        addedAt: Date.now(),
        sourcedFrom: keyword || 'Trends'
      };

      queue.push(queueItem);
      itemsQueuedCount++;
    }

    if (itemsQueuedCount > 0) {
      await chrome.storage.local.set({ pinQueue: queue });
      console.log(`AliPin: Added ${itemsQueuedCount} new products to Pin Queue. Total queued: ${queuedCount + itemsQueuedCount}/${MAX_QUEUE_SIZE}.`);
    }
  });
}

// --- 7. CONTENT GENERATION HELPER LIBRARIES ---
function generateSeoTitle(rawTitle) {
  const words = rawTitle.split(/\s+/);
  let short = words.slice(0, 6).join(' ').replace(/[,|\-].*$/, '').trim();
  short = short.replace(/\b\w/g, l => l.toUpperCase());
  return short.length > 60 ? short.substring(0, 60).trim() : short;
}

function generateSmartDescription(title) {
  const words = title.split(/\s+/);
  const shortTitle = words.slice(0, 7).join(' ').replace(/[,|\-].*$/, '').trim();
  const templates = [
    `Looking for the perfect ${shortTitle}? This is one of our absolute favorite finds! 😍 Grab yours today before they sell out! 👇`,
    `You definitely need this ${shortTitle} in your life! 🔥 Amazing quality and super useful. Get the best deal here 👇`,
    `Upgrade your lifestyle with this ${shortTitle}! ✨ We absolutely love this find. Click through to see more details! 👇`,
    `Check out this incredible ${shortTitle}! 🛒 Highly recommended by buyers and currently trending. Don't miss out! 👇`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateHashtags(title) {
  let tags = new Set([]);
  const titleLower = title.toLowerCase();
  if (titleLower.includes('home') || titleLower.includes('kitchen') || titleLower.includes('decor')) tags.add('#homedecor');
  if (titleLower.includes('gadget') || titleLower.includes('electronic') || titleLower.includes('usb')) tags.add('#techfinds');
  if (titleLower.includes('beauty') || titleLower.includes('makeup')) tags.add('#beautyhacks');
  if (titleLower.includes('toy') || titleLower.includes('baby') || titleLower.includes('kids')) tags.add('#momlife');
  if (titleLower.includes('car') || titleLower.includes('auto')) tags.add('#caraccessories');
  if (titleLower.includes('template') || titleLower.includes('html') || titleLower.includes('web')) tags.add('#webdesign');
  if (titleLower.includes('app') || titleLower.includes('ui') || titleLower.includes('mobile')) tags.add('#appdesign');
  if (titleLower.includes('digital') || titleLower.includes('download')) tags.add('#digitaldownload');
  
  if (!titleLower.includes('template') && !titleLower.includes('html') && !titleLower.includes('app')) {
    tags.add('#tiktokmademebuyit');
  }
  return Array.from(tags).slice(0, 3).join(' ');
}

function getBoardName(title) {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('home') || titleLower.includes('kitchen') || titleLower.includes('decor')) return 'Home Decor Finds';
  if (titleLower.includes('gadget') || titleLower.includes('electronic') || titleLower.includes('usb')) return 'Tech Gadgets';
  if (titleLower.includes('beauty') || titleLower.includes('makeup')) return 'Beauty Hacks';
  if (titleLower.includes('toy') || titleLower.includes('baby') || titleLower.includes('kids')) return 'Kids & Mom Life';
  if (titleLower.includes('car') || titleLower.includes('auto')) return 'Car Accessories';
  if (titleLower.includes('template') || titleLower.includes('html') || titleLower.includes('web')) return 'Web Design Templates';
  if (titleLower.includes('app') || titleLower.includes('ui') || titleLower.includes('mobile')) return 'App Design & UI';
  if (titleLower.includes('digital') || titleLower.includes('download')) return 'Digital Downloads';
  return 'Viral Finds';
}

const LEGAL_TAGS = " #musthaves #viralgadgets #affiliate #ad";
function enforceDisclosures(description) {
  let text = description.replace(LEGAL_TAGS, "").trim();
  let combined = text + LEGAL_TAGS;
  if (combined.length > 500) {
    const space = 500 - LEGAL_TAGS.length - 3;
    text = text.substring(0, space) + "...";
    combined = text + LEGAL_TAGS;
  }
  return combined;
}
