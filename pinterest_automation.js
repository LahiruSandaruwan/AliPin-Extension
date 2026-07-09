// AliPin Chrome Extension - Pinterest & Trends Automation Content Script

(async () => {
  const url = window.location.href;

  if (url.includes('trends.pinterest.com/shopping')) {
    handleShoppingTrendsPage();
  } else if (url.includes('trends.pinterest.com')) {
    handleTrendsPage();
  } else if (url.includes('pinterest.com/pin/create/extension')) {
    handlePinPage();
  }

  // --- 1. SHOPPING TRENDS PAGE AUTO-SCRAPER ---
  async function handleShoppingTrendsPage() {
    console.log("AliPin: Pinterest Shopping Trends automation active.");
    
    const overlay = createStatusOverlay("AliPin: Scraping Pinterest Shopping Trends...");
    document.body.appendChild(overlay);

    let keywords = [];
    for (let attempts = 0; attempts < 30; attempts++) {
      await delay(500);
      keywords = extractShoppingTrends();
      if (keywords.length >= 5) break;
    }

    if (keywords.length > 0) {
      console.log("AliPin: Scraped shopping trends:", keywords);
      overlay.innerText = `AliPin: Scraped ${keywords.length} shopping trends! Sourcing products...`;
      overlay.style.backgroundColor = "#28a745";
      
      await delay(1000);
      chrome.runtime.sendMessage({ action: "trendsScraped", keywords: keywords });
    } else {
      console.error("AliPin: Failed to scrape shopping trends.");
      overlay.innerText = "AliPin: Scraping failed. No shopping trends found.";
      overlay.style.backgroundColor = "#dc3545";
      
      await delay(2000);
      chrome.runtime.sendMessage({ action: "trendsScraped", keywords: [] });
    }
  }

  function extractShoppingTrends() {
    const foundKeywords = new Set();
    const allElements = document.querySelectorAll('*');
    
    // Pattern to match Outbound Clicks Growth (e.g. ↑189% MoM, ↓20% YoY, +15% WoW, -5% MoM, 15% YoY)
    const growthRegex = /[↑↓▲▼+-]?\s*\d+(?:\.\d+)?%\s*(?:MoM|YoY|WoW|change)/i;
    
    const matchingElements = [];
    allElements.forEach(el => {
      const text = el.innerText ? el.innerText.trim() : "";
      if (growthRegex.test(text)) {
        matchingElements.push(el);
      }
    });

    // Find the deepest matching elements (none of their descendants are also matching elements)
    const deepestElements = matchingElements.filter(el => {
      return !Array.from(el.querySelectorAll('*')).some(child => matchingElements.includes(child));
    });

    deepestElements.forEach(el => {
      // Traverse up to find the row container (usually a row/flex item within 5 levels)
      let container = el.parentElement;
      for (let i = 0; i < 5; i++) {
        if (!container) break;
        
        // Look for any links inside this row container that represents the product category
        const links = container.querySelectorAll('a');
        for (let link of links) {
          const linkText = link.innerText ? link.innerText.trim() : "";
          
          // Category name criteria: not empty, not a number, and not matching the growth duration text
          if (linkText && 
              !/^\d+$/.test(linkText) && 
              !growthRegex.test(linkText) &&
              !isCommonUiWord(linkText)) {
            
            // Format name
            const formattedKeyword = linkText.replace(/\b\w/g, l => l.toUpperCase());
            foundKeywords.add(formattedKeyword);
            break; // Sourced the primary category name for this row
          }
        }
        if (foundKeywords.size > 0) {
          // We successfully found a category for this container, stop going up
          break;
        }
        container = container.parentElement;
      }
    });

    // Fallback: If no keywords found using growth metrics, let's scrape all category-like links on the page
    if (foundKeywords.size < 3) {
      console.log("AliPin: Growth-based parsing failed or returned too few keywords. Trying link scraping fallback...");
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        const text = link.innerText ? link.innerText.trim() : "";
        // Simple heuristic for category links: 1 to 4 words, not common UI words, starts with a letter
        if (text && 
            /^[a-zA-Z]/.test(text) &&
            text.split(/\s+/).length >= 1 && 
            text.split(/\s+/).length <= 4 && 
            !isCommonUiWord(text)) {
          foundKeywords.add(text.replace(/\b\w/g, l => l.toUpperCase()));
        }
      });
    }

    return Array.from(foundKeywords).slice(0, 15);
  }

  // --- 2. TRENDS PAGE AUTO-SCRAPER ---
  async function handleTrendsPage() {
    console.log("AliPin: Trends automation script active.");
    
    // Create an overlay to show status
    const overlay = createStatusOverlay("AliPin: Scraping Trending Keywords...");
    document.body.appendChild(overlay);

    // Wait for the dynamic content to load (poll up to 10 seconds)
    let keywords = [];
    for (let attempts = 0; attempts < 30; attempts++) {
      await delay(500);
      keywords = extractTrendsHeuristic();
      if (keywords.length >= 5) break;
    }

    if (keywords.length > 0) {
      console.log("AliPin: Scraped keywords:", keywords);
      overlay.innerText = `AliPin: Scraped ${keywords.length} trends! Sourcing products...`;
      overlay.style.backgroundColor = "#28a745";
      
      await delay(1000);
      chrome.runtime.sendMessage({ action: "trendsScraped", keywords: keywords });
    } else {
      console.error("AliPin: Failed to scrape trending keywords.");
      overlay.innerText = "AliPin: Scraping failed. No trends found.";
      overlay.style.backgroundColor = "#dc3545";
      
      await delay(2000);
      chrome.runtime.sendMessage({ action: "trendsScraped", keywords: [] });
    }
  }

  // Heuristic-based Trends Parser (Layout-independent)
  function extractTrendsHeuristic() {
    const foundKeywords = new Set();
    const allElements = document.querySelectorAll('*');
    
    // Pattern to match percentage changes (e.g. +150%, -20%, 300%)
    const pctRegex = /^[+-]?\d+%\s*$/;
    
    allElements.forEach(el => {
      const text = el.innerText ? el.innerText.trim() : "";
      
      // If we find a percentage change indicator
      if (pctRegex.test(text)) {
        // Traverse up to find a suitable small container containing the trend cell/card
        let container = el.parentElement;
        for (let i = 0; i < 4; i++) {
          if (!container) break;
          
          // Check if container text contains non-product keywords to skip irrelevant categories
          const containerText = container.innerText ? container.innerText.toLowerCase() : "";
          const blocklist = ['food', 'drink', 'recipe', 'quote', 'finance', 'travel', 'parenting', 'education', 'relationship', 'saving money', 'tips', 'life hacks', 'workout', 'diet', 'exercise', 'health and fitness'];
          const isNonProduct = blocklist.some(blockWord => containerText.includes(blockWord));
          
          if (isNonProduct) {
            container = container.parentElement;
            continue;
          }
          
          // Find any text/anchor inside this container that might be the keyword
          const anchors = container.querySelectorAll('a, span, div, p');
          for (let item of anchors) {
            const itemText = item.innerText ? item.innerText.trim() : "";
            // Keyword criteria: 2 to 6 words, no percentages, no numbers only, no common UI words
            if (itemText && 
                itemText.split(/\s+/).length >= 1 && 
                itemText.split(/\s+/).length <= 6 && 
                !pctRegex.test(itemText) &&
                !/^\d+$/.test(itemText) &&
                !isCommonUiWord(itemText)) {
              
              // Capitalize words nicely
              const formattedKeyword = itemText.replace(/\b\w/g, l => l.toUpperCase());
              foundKeywords.add(formattedKeyword);
            }
          }
          container = container.parentElement;
        }
      }
    });

    // Fallback: If heuristic fails, scrape all links with search queries or clean links
    if (foundKeywords.size < 3) {
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        const text = link.innerText ? link.innerText.trim() : "";
        if (text && text.split(/\s+/).length >= 1 && text.split(/\s+/).length <= 5 && !isCommonUiWord(text)) {
          foundKeywords.add(text.replace(/\b\w/g, l => l.toUpperCase()));
        }
      });
    }

    return Array.from(foundKeywords).slice(0, 15);
  }

  function isCommonUiWord(word) {
    const wordLower = word.toLowerCase();
    const common = [
      'pinterest', 'trends', 'home', 'business', 'analytics', 'ads', 'about', 
      'log in', 'sign up', 'weekly', 'monthly', 'yearly', 'change', 'growth',
      'region', 'interest', 'age', 'gender', 'search', 'terms', 'privacy', 'terms of service',
      'help', 'discover', 'today', 'create', 'view', 'save', 'close', 'share', 'cancel',
      'growing', 'stable', 'seasonal', 'all', 'demographics', 'audience', 'overview', 'details'
    ];
    return common.includes(wordLower) || wordLower.length < 3 || /^\+?\d+/.test(wordLower);
  }

  // --- 2. PIN CREATION PAGE AUTOMATION (Extension: /pin/create/extension/) ---
  async function handlePinPage() {
    // --- Load pin data from session storage ---
    let pinData = null;
    try {
      const session = await chrome.storage.session.get(['pendingPin']);
      pinData = session.pendingPin || null;
    } catch(e) {
      console.warn('AliPin: Failed to read pendingPin from session storage:', e);
    }

    if (!pinData) {
      console.log('AliPin: No pending pin data found. User navigated manually.');
      return;
    }

    // Only run board-saving automation if triggered by auto-pin
    if (pinData.isAutoPin !== true) {
      console.log('AliPin: Manual pin page open. No automation — user will interact.');
      
      // We can still try to auto-fill the title for manual pins since the URL doesn't support the title parameter
      if (pinData.title) {
         setTimeout(() => {
           const titleInput = document.querySelector('input[name="title"], input[placeholder*="title" i], input[aria-label*="title" i]');
           if (titleInput) {
             titleInput.focus();
             const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
             if (nativeSetter && nativeSetter.set) nativeSetter.set.call(titleInput, pinData.title.substring(0, 100));
             else titleInput.value = pinData.title.substring(0, 100);
             titleInput.dispatchEvent(new Event('input', { bubbles: true }));
           }
         }, 4000);
      }
      return;
    }

    let pinId = pinData.pinId;
    let targetBoard = pinData.board || 'Viral Finds'; // default

    console.log(`AliPin: Auto-pinning to board "${targetBoard}" (pinId: ${pinId})`);
    const overlay = createStatusOverlay(`AliPin: Finding board "${targetBoard}"...`);
    document.body.appendChild(overlay);

    // ---- Helpers ----
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // Wait for ANY of the given selectors to appear, with MutationObserver
    function waitForAny(selectors, timeout = 30000) {
      return new Promise((resolve, reject) => {
        const combined = selectors.join(', ');
        const check = () => {
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) return els;
          }
          return null;
        };
        const found = check();
        if (found) return resolve(found);

        const observer = new MutationObserver(() => {
          const f = check();
          if (f) { observer.disconnect(); resolve(f); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Timeout (${timeout}ms) waiting for: ${combined}`));
        }, timeout);
      });
    }

    let pinStatus = false;
    let errorMsg  = '';

    try {
      // Pinterest's bookmarklet page takes time to render the board list
      overlay.innerText = 'AliPin: Waiting for Pinterest to load boards...';
      console.log('AliPin: Waiting for board list...');

      // ── Strategy 1: Wait for board rows by data-test-id (Pinterest's stable attribute) ──
      // Known selectors used by Pinterest's internal QA: "board-row-wrapper" and "board-row"
      let boardRows = null;
      try {
        boardRows = await waitForAny([
          '[data-test-id="board-row-wrapper"]',
          '[data-test-id="board-row"]',
          '[data-test-id="boardRow"]',
          '.boardRow',
          'li[data-board-id]',
        ], 25000);
        console.log(`AliPin: Board rows found (${boardRows.length}) via data-test-id strategy.`);
      } catch(e) {
        console.warn('AliPin: data-test-id board rows not found. Trying text-match fallback.', e.message);
      }

      // ── Strategy 2: Text-match any element that looks like a board name ──
      // Finds the board row by scanning for elements whose text matches the target board name,
      // then finds the Save button closest to it.
      let saveBtn = null;

      if (boardRows && boardRows.length > 0) {
        // Find the row whose text matches target board
        let targetRow = null;
        for (const row of boardRows) {
          const rowText = row.innerText?.trim().toLowerCase() || '';
          if (rowText.includes(targetBoard.toLowerCase())) {
            targetRow = row;
            console.log('AliPin: Exact/partial board match found:', row.innerText?.trim());
            break;
          }
        }
        // Fallback: use first board row
        if (!targetRow) {
          targetRow = boardRows[0];
          console.warn(`AliPin: Board "${targetBoard}" not found in list. Using first board: ${targetRow.innerText?.trim()}`);
        }
        // Find the Save button inside this row
        saveBtn = targetRow.querySelector('button')
          || targetRow.querySelector('[role="button"]');
        console.log('AliPin: Save button in row:', saveBtn?.innerText?.trim() || saveBtn?.tagName);
      }

      // ── Strategy 3: Text scan across ALL page elements ──
      if (!saveBtn) {
        console.warn('AliPin: Falling back to full-DOM text scan...');
        const allEls = Array.from(document.querySelectorAll('*'));
        for (const el of allEls) {
          if (el.children.length > 0) continue; // leaf nodes only
          const text = el.innerText?.trim().toLowerCase() || '';
          if (text === targetBoard.toLowerCase() || text.includes(targetBoard.toLowerCase().split(' ')[0])) {
            let parent = el.parentElement;
            for (let i = 0; i < 6 && parent; i++) {
              const btn = parent.querySelector('button') || parent.querySelector('[role="button"]');
              if (btn) { saveBtn = btn; break; }
              parent = parent.parentElement;
            }
            if (saveBtn) {
              console.log('AliPin: Found save btn via text scan near:', el.innerText);
              break;
            }
          }
        }
      }

      // ── Strategy 4: Find ANY Save / Pin-it button ──
      if (!saveBtn) {
        console.warn('AliPin: No board-specific button found. Clicking first "Save"/"Pin it" button.');
        const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
        saveBtn = allBtns.find(b => {
          const t = b.innerText?.trim().toLowerCase() || '';
          return (t === 'save' || t === 'pin it' || t === 'pin' || t.includes('save to'));
        });
      }

      // ── Execute the save ──
      if (saveBtn) {
        // Human-like delay
        const humanDelay = 800 + Math.random() * 1200;
        overlay.innerText = `AliPin: Saving to "${targetBoard}"...`;
        await delay(humanDelay);

        console.log('AliPin: Clicking Save button:', saveBtn.innerText?.trim(), saveBtn);
        saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(300);
        saveBtn.focus();
        ['mousedown', 'mouseup', 'click'].forEach(evType => {
          saveBtn.dispatchEvent(new MouseEvent(evType, { bubbles: true, cancelable: true, view: window }));
        });

        await delay(4000); // Wait for Pinterest to confirm save

        pinStatus = true;
        overlay.innerText = '✅ AliPin: Pinned successfully!';
        overlay.style.backgroundColor = '#28a745';
        console.log('AliPin: Pin saved successfully!');
        await delay(2000);
      } else {
        throw new Error('No Save button found on page. Pinterest UI may have changed or boards not loaded.');
      }

    } catch(err) {
      pinStatus = false;
      errorMsg = err.message;
      console.error('AliPin: Auto-pin failed:', err);
      overlay.innerText = `❌ AliPin: ${err.message}`;
      overlay.style.backgroundColor = '#dc3545';
      await delay(3000);
    }

    // Clean up session
    try { await chrome.storage.session.remove(['pendingPin']); } catch(e) {}

    // Report to background to update queue status
    const msg = pinStatus
      ? { action: 'pinSuccess', pinId }
      : { action: 'pinFailed', pinId, error: errorMsg };
    chrome.runtime.sendMessage(msg);
  }

  // --- HELPER FUNCTIONS ---
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function createStatusOverlay(text) {
    const div = document.createElement('div');
    div.id = "alipin-status-overlay";
    div.innerText = text;
    div.style.position = "fixed";
    div.style.top = "15px";
    div.style.left = "50%";
    div.style.transform = "translateX(-50%)";
    div.style.backgroundColor = "#E60023";
    div.style.color = "white";
    div.style.padding = "12px 24px";
    div.style.borderRadius = "30px";
    div.style.fontSize = "14px";
    div.style.fontWeight = "bold";
    div.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
    div.style.zIndex = "2147483647"; // Max possible z-index
    div.style.transition = "background-color 0.3s";
    div.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    return div;
  }
})();
