document.addEventListener('DOMContentLoaded', async () => {
  // Tab Navigation Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const queueCountBadge = document.getElementById('queueCountBadge');

  // General Settings Elements
  const trackingIdInput = document.getElementById('trackingId');
  const bridgeUrlInput = document.getElementById('bridgeUrl');
  const linkRoutingSelect = document.getElementById('linkRouting');
  const bridgeLinkGroup = document.getElementById('bridgeLinkGroup');
  const btnSave = document.getElementById('btnSave');
  
  // Collapsible Settings Toggle
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsContent = document.getElementById('settingsContent');
  const settingsArrow = document.getElementById('settingsArrow');

  // Product Assistant Elements
  const prodTitleInput = document.getElementById('prodTitle');
  const affLinkInput = document.getElementById('affLink');
  const pinDescInput = document.getElementById('pinDesc');
  const charCountSpan = document.getElementById('charCount');
  const btnPin = document.getElementById('btnPin');
  const btnQueue = document.getElementById('btnQueue');
  const badge = document.getElementById('winningBadge');

  // Queue Tab Elements
  const queueListContainer = document.getElementById('queueListContainer');
  const btnClearQueue = document.getElementById('btnClearQueue');

  // Autopilot Tab Elements
  const autopilotEnabledCheckbox = document.getElementById('autopilotEnabled');
  const statQueueCount = document.getElementById('statQueueCount');
  const statCompletedCount = document.getElementById('statCompletedCount');
  const sourcingModeSelect = document.getElementById('sourcingMode');
  const customKeywordsGroup = document.getElementById('customKeywordsGroup');
  const customKeywordsInput = document.getElementById('customKeywords');
  const sourcingLimitSelect = document.getElementById('sourcingLimit');
  const postingIntervalSelect = document.getElementById('postingInterval');
  
  // Video Elements
  const autoYoutubeCb = document.getElementById('autoYoutube');
  const btnConnectYoutube = document.getElementById('btnConnectYoutube');
  const autoTiktokCb = document.getElementById('autoTiktok');
  const btnConnectTiktok = document.getElementById('btnConnectTiktok');
  const autoLinktreeCb = document.getElementById('autoLinktree');
  const btnConnectLinktree = document.getElementById('btnConnectLinktree');
  const btnTriggerAutopilot = document.getElementById('btnTriggerAutopilot');

  let productData = null;
  const LEGAL_TAGS = " #musthaves #viralgadgets #affiliate #ad";

  // --- 1. TAB NAVIGATION ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'tab-queue') {
        renderQueue();
      } else if (tabId === 'tab-autopilot') {
        updateAutopilotStats();
      }
    });
  });

  // --- 2. COLLAPSIBLE SETTINGS PANEL ---
  settingsToggle.addEventListener('click', () => {
    const isOpen = settingsContent.classList.toggle('open');
    settingsArrow.textContent = isOpen ? '▲' : '▼';
  });

  // --- Cookie Extraction Helper ---
  async function connectPlatform(domain, buttonElement, storageKey, platformName) {
    if (!chrome.cookies) {
      buttonElement.textContent = "Error: No Cookie Permission";
      return;
    }
    buttonElement.textContent = "Connecting...";
    try {
      const cookies = await chrome.cookies.getAll({ domain: domain });
      if (cookies && cookies.length > 0) {
        chrome.storage.local.set({ [storageKey]: JSON.stringify(cookies) });
        buttonElement.textContent = `✅ Connected!`;
        buttonElement.style.background = "#28a745";
        buttonElement.style.color = "white";
        buttonElement.style.border = "none";
      } else {
        buttonElement.textContent = "❌ Not Logged In";
        buttonElement.style.background = "#dc3545";
      }
    } catch (e) {
      buttonElement.textContent = "❌ Error";
    }
    setTimeout(() => {
      // Revert text after 3 seconds, keep color
      buttonElement.textContent = buttonElement.textContent.includes("Connected") ? `🔄 Reconnect ${platformName}` : `Connect ${platformName}`;
    }, 3000);
  }

  // --- 3. LOAD & SAVE SETTINGS ---
  const settingsKeys = [
    'trackingId', 'linkRouting', 'bridgeUrl', 
    'autopilotEnabled', 'sourcingMode', 'customKeywords', 
    'sourcingLimit', 'postingInterval', 'pinQueue',
    'autoYoutube', 'autoTiktok', 'youtubeCookie', 'tiktokCookie',
    'autoLinktree', 'linktreeCookie'
  ];

  chrome.storage.local.get(settingsKeys, (result) => {
    // General Settings
    if (result.trackingId) trackingIdInput.value = result.trackingId;
    if (result.linkRouting) {
      linkRoutingSelect.value = result.linkRouting;
      bridgeLinkGroup.style.display = result.linkRouting === 'bridge' ? 'block' : 'none';
    }
    if (result.bridgeUrl) bridgeUrlInput.value = result.bridgeUrl;

    // Autopilot Settings
    autopilotEnabledCheckbox.checked = !!result.autopilotEnabled;
    if (result.sourcingMode) {
      sourcingModeSelect.value = result.sourcingMode;
      customKeywordsGroup.style.display = result.sourcingMode === 'custom' ? 'block' : 'none';
    }
    if (result.customKeywords) customKeywordsInput.value = result.customKeywords;
    if (result.sourcingLimit) sourcingLimitSelect.value = result.sourcingLimit;
    if (result.postingInterval) postingIntervalSelect.value = result.postingInterval;

    // Video Settings
    autoYoutubeCb.checked = result.autoYoutube !== false; // default true
    btnConnectYoutube.style.display = autoYoutubeCb.checked ? 'block' : 'none';
    if (result.youtubeCookie && result.youtubeCookie.length > 5) {
      btnConnectYoutube.textContent = "🔄 Reconnect YouTube";
      btnConnectYoutube.style.background = "#28a745";
    }

    autoTiktokCb.checked = result.autoTiktok !== false; // default true
    btnConnectTiktok.style.display = autoTiktokCb.checked ? 'block' : 'none';
    if (result.tiktokCookie && result.tiktokCookie.length > 5) {
      btnConnectTiktok.textContent = "🔄 Reconnect TikTok";
      btnConnectTiktok.style.background = "#28a745";
    }

    autoLinktreeCb.checked = result.autoLinktree !== false; // default true
    btnConnectLinktree.style.display = autoLinktreeCb.checked ? 'block' : 'none';
    if (result.linktreeCookie && result.linktreeCookie.length > 5) {
      btnConnectLinktree.textContent = "🔄 Reconnect Linktree";
      btnConnectLinktree.style.background = "#28a745";
    }

    // Badges update
    const queue = result.pinQueue || [];
    const pendingCount = queue.filter(item => item.status === 'queued').length;
    queueCountBadge.textContent = pendingCount;
  });

  // Auto-save Autopilot Settings on change
  const saveAutopilotSettings = () => {
    chrome.storage.local.set({
      autopilotEnabled: autopilotEnabledCheckbox.checked,
      sourcingMode: sourcingModeSelect.value,
      customKeywords: customKeywordsInput.value.trim(),
      sourcingLimit: sourcingLimitSelect.value,
      postingInterval: postingIntervalSelect.value,
      autoYoutube: autoYoutubeCb.checked,
      autoTiktok: autoTiktokCb.checked,
      autoLinktree: autoLinktreeCb.checked
    }, () => {
      updateAutopilotStats();
    });
  };

  autopilotEnabledCheckbox.addEventListener('change', saveAutopilotSettings);
  sourcingModeSelect.addEventListener('change', () => {
    customKeywordsGroup.style.display = sourcingModeSelect.value === 'custom' ? 'block' : 'none';
    saveAutopilotSettings();
  });
  customKeywordsInput.addEventListener('input', saveAutopilotSettings);
  sourcingLimitSelect.addEventListener('change', saveAutopilotSettings);
  postingIntervalSelect.addEventListener('change', saveAutopilotSettings);
  
  autoYoutubeCb.addEventListener('change', () => {
    btnConnectYoutube.style.display = autoYoutubeCb.checked ? 'block' : 'none';
    saveAutopilotSettings();
  });
  btnConnectYoutube.addEventListener('click', () => connectPlatform('.youtube.com', btnConnectYoutube, 'youtubeCookie', 'YouTube'));
  
  autoTiktokCb.addEventListener('change', () => {
    btnConnectTiktok.style.display = autoTiktokCb.checked ? 'block' : 'none';
    saveAutopilotSettings();
  });
  btnConnectTiktok.addEventListener('click', () => connectPlatform('.tiktok.com', btnConnectTiktok, 'tiktokCookie', 'TikTok'));

  autoLinktreeCb.addEventListener('change', () => {
    btnConnectLinktree.style.display = autoLinktreeCb.checked ? 'block' : 'none';
    saveAutopilotSettings();
  });
  btnConnectLinktree.addEventListener('click', () => connectPlatform('.linktr.ee', btnConnectLinktree, 'linktreeCookie', 'Linktree'));

  // Link Routing Selector Behavior
  linkRoutingSelect.addEventListener('change', () => {
    bridgeLinkGroup.style.display = linkRoutingSelect.value === 'bridge' ? 'block' : 'none';
    generateFinalLink();
  });

  // Save General Settings button
  btnSave.addEventListener('click', () => {
    chrome.storage.local.set({ 
      trackingId: trackingIdInput.value.trim(),
      linkRouting: linkRoutingSelect.value,
      bridgeUrl: bridgeUrlInput.value.trim()
    }, () => {
      btnSave.textContent = "Saved!";
      setTimeout(() => btnSave.textContent = "Save Settings", 2000);
      generateFinalLink();
    });
  });

  // --- 4. CHARACTER COUNTER & LEGAL DISCLOSURES ---
  const updateCharCount = () => {
    const len = pinDescInput.value.length;
    charCountSpan.textContent = `${len}/500`;
    charCountSpan.style.color = len >= 500 ? '#FF3D00' : '#9E9EAE';
  };
  
  pinDescInput.addEventListener('input', updateCharCount);

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

  // --- 5. LINK GENERATION ENGINE ---
  function generateFinalLink() {
    if (!productData) return;
    
    let routingChoice = linkRoutingSelect.value;
    let trackingId = trackingIdInput.value.trim() || '_c3PWNQIr';
    
    if (routingChoice === 'direct' && productData.sClickUrl) {
      affLinkInput.value = productData.sClickUrl;
      return;
    }
    
    let finalLink = "";
    if (routingChoice === 'direct') {
      if (productData.productUrl.includes('aliexpress')) {
        try {
          const urlObj = new URL(productData.productUrl);
          urlObj.searchParams.set('aff_platform', 'portals-promotion');
          urlObj.searchParams.set('sk', trackingId);
          finalLink = urlObj.toString();
        } catch(e) {
          finalLink = productData.productUrl + (productData.productUrl.includes('?') ? '&' : '?') + `aff_platform=portals-promotion&sk=${trackingId}`;
        }
      } else {
        finalLink = productData.productUrl;
      }
    } else {
      let rootUrl = bridgeUrlInput.value.trim();
      if (!rootUrl) rootUrl = "https://linktr.ee/yourprofile";
      
      const match = productData.productUrl.match(/\/(\d+)\.html/);
      const productId = match ? match[1] : 'ali_item';
      finalLink = rootUrl + (rootUrl.includes('?') ? '&' : '?') + `product=${productId}`;
    }
    
    affLinkInput.value = finalLink;
  }

  function showError(msg) {
    document.getElementById('productSection').style.display = 'none';
    const errSec = document.getElementById('errorSection');
    errSec.textContent = msg;
    errSec.style.display = 'block';
  }

  // --- 6. SCRAPE ACTIVE TAB PRODUCT ---
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && (tab.url.match(/aliexpress\.(com|us|ru)\/(item|i)\//) || tab.url.match(/etsy\.com\/([^\/]+\/)?listing\//))) {
      let globalSClickUrl = null;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: async () => {
            function findLink() {
              const inputs = document.querySelectorAll('input, textarea');
              for (const input of inputs) {
                if (input.value && input.value.includes('s.click.aliexpress.com')) return input.value.trim();
              }
              const match = document.body.innerHTML.match(/(https:\/\/s\.click\.aliexpress\.com\/e\/_[a-zA-Z0-9]+)/);
              if (match) return match[1];
              return null;
            }

            let link = findLink();
            if (link) return link;

            // SiteStripe button automation
            const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
            const getLinkBtn = buttons.find(b => b.innerText && (b.innerText.trim() === 'Get link' || b.innerText.trim() === 'Text'));
            
            if (getLinkBtn) {
              getLinkBtn.click();
              for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 100));
                link = findLink();
                if (link) return link;
              }
            }
            return null;
          }
        });
        for (const res of results) {
          if (res.result) { globalSClickUrl = res.result; break; }
        }
      } catch (e) {
        console.error("Frame injection failed", e);
      }

      chrome.tabs.sendMessage(tab.id, { action: "getProductData" }, (response) => {
        if (chrome.runtime.lastError) {
          showError("Connection failed. Please refresh the AliExpress page.");
          return;
        }

        if (response && response.title) {
          productData = response;
          if (globalSClickUrl) productData.sClickUrl = globalSClickUrl;
          
          function generateSeoTitle(rawTitle) {
              const words = rawTitle.split(/\s+/);
              let short = words.slice(0, 6).join(' ').replace(/[,|\-].*$/, '').trim();
              short = short.replace(/\b\w/g, l => l.toUpperCase());
              return short.length > 60 ? short.substring(0, 60).trim() : short;
          }
          
          let initialTitle = generateSeoTitle(productData.title);
          prodTitleInput.value = initialTitle;
          
          // Badge Logic
          if (productData.orders >= 500) {
            badge.textContent = `🔥 Winning Product! (${productData.orders.toLocaleString()}+ Sold)`;
            badge.className = "badge winning";
          } else {
            badge.textContent = `Normal Niche Strength (${productData.orders > 0 ? productData.orders.toLocaleString() : 'Few'} Sold)`;
            badge.className = "badge";
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
          
          const initialDesc = generateSmartDescription(productData.title);
          pinDescInput.value = enforceDisclosures(initialDesc);
          updateCharCount();
          
          generateFinalLink();
          
          if (!productData.sClickUrl) {
             affLinkInput.placeholder = "Click 'Get link' in SiteStripe, then paste here...";
          }
        } else {
          showError("Could not scrape product data. UI may have changed.");
        }
      });
    } else {
      showError("Please open an AliExpress or Etsy product page to use this tool.");
    }
  } catch (error) {
    showError("Extension Error: " + error.message);
  }

  // --- 7. MANUAL PINTEREST DISPATCHER ---
  btnPin.addEventListener('click', async () => {
    if (!productData) {
      alert("No product data loaded.");
      return;
    }

    btnPin.disabled = true;
    btnPin.textContent = '⏳ Opening...';

    let rawTitle = prodTitleInput.value;
    let combinedDesc = "📌 " + rawTitle + "\n\n" + pinDescInput.value;
    combinedDesc = enforceDisclosures(combinedDesc);
    
    // Shorten the affiliate link to prevent Pinterest from stripping the tracking parameters
    let finalLink = affLinkInput.value;
    if (finalLink.includes('aliexpress.com') && !finalLink.includes('s.click')) {
        try {
            const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(finalLink)}`);
            const data = await res.json();
            if (data && data.shorturl) finalLink = data.shorturl;
        } catch(e) { console.warn("Shortener failed"); }
    }

    // Store pin data in session so content script can read affiliate link
    await chrome.storage.session.set({
      pendingPin: {
        affLink: finalLink,
        imageUrl: productData.imageUrl,
        description: combinedDesc,
        title: rawTitle,
        board: null, // manual - user picks board themselves
        pinId: null,
        isAutoPin: false
      }
    });

    // Open Pinterest bookmarklet page - url= is the destination/affiliate link
    // Clean image URL to ensure it ends in .jpg or .png (Pinterest rejects complex/webp URLs)
    let cleanImage = productData.imageUrl.replace(/_[0-9]+x[0-9]+.*\.jpg/i, '');
    // Open Pinterest extension page
    // We send the affiliate link directly in the URL parameter.
    // NOTE: declarativeNetRequest rules in background automatically spoof the Referer header
    // to https://www.aliexpress.com/ which bypasses Pinterest's show_error=true spam block.
    const safeDesc = combinedDesc.substring(0, 450);
    const pinterestUrl = `https://www.pinterest.com/pin/create/extension/?url=${encodeURIComponent(finalLink)}&media=${encodeURIComponent(cleanImage)}&description=${encodeURIComponent(safeDesc)}`;
    
    // Open in a new tab normally
    chrome.tabs.create({ url: pinterestUrl, active: true });

    setTimeout(() => {
      btnPin.disabled = false;
      btnPin.textContent = 'Create Pin';
    }, 2000);
  });

  // --- 8. MANUAL QUEUE ADDER ---
  btnQueue.addEventListener('click', () => {
    if (!productData) {
      alert("No product data loaded.");
      return;
    }

    const title = prodTitleInput.value.trim();
    const link = affLinkInput.value.trim();
    let desc = pinDescInput.value.trim();

    if (!title || !link) {
      alert("Please fill out Title and Link fields.");
      return;
    }

    // Auto-generate board name
    function getBoardName(t) {
        const titleLower = t.toLowerCase();
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
    const board = getBoardName(productData.title);
    
    // Auto-append hashtags if not present
    if (!desc.includes('#ad') && !desc.includes('#affiliate')) {
      desc = enforceDisclosures("📌 " + title + "\n\n" + desc);
    }

    chrome.storage.local.get(['pinQueue'], (result) => {
      const queue = result.pinQueue || [];
      
      // Check duplicate
      const isDuplicate = queue.some(item => item.productUrl === productData.productUrl && item.status === 'queued');
      if (isDuplicate) {
        alert("This product is already pending in the queue!");
        return;
      }

      const newItem = {
        id: 'pin_' + Date.now(),
        title: title,
        imageUrl: productData.imageUrl,
        productUrl: productData.productUrl,
        affLink: link,
        description: desc,
        board: board,
        status: 'queued',
        addedAt: Date.now()
      };

      queue.push(newItem);
      chrome.storage.local.set({ pinQueue: queue }, () => {
        // UI Feedback
        btnQueue.textContent = "✔ Queued!";
        btnQueue.style.backgroundColor = "#28a745";
        btnQueue.style.color = "white";
        
        // Update header badge
        const pendingCount = queue.filter(item => item.status === 'queued').length;
        queueCountBadge.textContent = pendingCount;

        setTimeout(() => {
          btnQueue.textContent = "+ Queue";
          btnQueue.style.backgroundColor = "";
          btnQueue.style.color = "";
        }, 1500);
      });
    });
  });

  // --- 9. QUEUE RENDERING ENGINE ---
  function renderQueue() {
    chrome.storage.local.get(['pinQueue'], (result) => {
      const queue = result.pinQueue || [];
      queueListContainer.innerHTML = "";

      // Sort: processing first, then queued, then failed, then completed. Newest added at top.
      const statusWeight = { 'processing': 0, 'queued': 1, 'failed': 2, 'completed': 3 };
      const sortedQueue = [...queue].sort((a, b) => {
        if (statusWeight[a.status] !== statusWeight[b.status]) {
          return statusWeight[a.status] - statusWeight[b.status];
        }
        return b.addedAt - a.addedAt;
      });

      // Update all count badges
      const queuedCount   = queue.filter(item => item.status === 'queued').length;
      const doneCount     = queue.filter(item => item.status === 'completed').length;
      const failedCount   = queue.filter(item => item.status === 'failed').length;
      queueCountBadge.textContent = queuedCount;
      const qStat = document.getElementById('queueStatQueued');
      const dStat = document.getElementById('queueStatDone');
      const fStat = document.getElementById('queueStatFailed');
      if (qStat) qStat.textContent = queuedCount;
      if (dStat) dStat.textContent = doneCount;
      if (fStat) fStat.textContent = failedCount;

      if (sortedQueue.length === 0) {
        queueListContainer.innerHTML = '<div class="empty-queue">No items in pinning queue.</div>';
        return;
      }

      sortedQueue.forEach(item => {
        const row = document.createElement('div');
        row.className = "queue-item";
        
        const img = document.createElement('img');
        img.className = "queue-thumb";
        img.src = item.imageUrl || "placeholder.png";
        
        const details = document.createElement('div');
        details.className = "queue-details";
        
        const title = document.createElement('div');
        title.className = "queue-title";
        title.textContent = item.title;
        
        const sub = document.createElement('div');
        sub.className = "queue-board";
        
        // Status Badge
        const statusBadge = document.createElement('span');
        statusBadge.className = `queue-status-badge ${item.status}`;
        statusBadge.textContent = item.status;
        if (item.status === 'failed' && item.error) {
          statusBadge.title = `Error: ${item.error}`;
        }
        
        sub.appendChild(statusBadge);
        if (item.sourcedFrom) {
          const originSpan = document.createElement('span');
          originSpan.style.color = "var(--success)";
          originSpan.style.fontSize = "9px";
          originSpan.style.marginLeft = "6px";
          originSpan.style.fontWeight = "600";
          originSpan.textContent = `[Trend: ${item.sourcedFrom}]`;
          sub.appendChild(originSpan);
        }
        sub.appendChild(document.createTextNode(`  •  ${item.board}`));
        
        details.appendChild(title);
        details.appendChild(sub);

        // --- Pin Now Button (manual post to Pinterest) ---
        const pinNowBtn = document.createElement('button');
        pinNowBtn.className = "queue-pin-btn";
        pinNowBtn.innerHTML = "📌";
        pinNowBtn.title = "Pin this product to Pinterest now";
        // Only allow pinning queued or failed items; completed already done, processing is in-flight
        if (item.status === 'processing') {
          pinNowBtn.disabled = true;
          pinNowBtn.title = "Currently being pinned...";
        }
        pinNowBtn.addEventListener('click', () => {
          pinNowBtn.textContent = "✓";
          pinNowBtn.disabled = true;
          
          // Force status to queued if it was failed, so processNextPin can pick it up
          chrome.storage.local.get(['pinQueue'], (result) => {
            const currentQueue = result.pinQueue || [];
            const idx = currentQueue.findIndex(q => q.id === item.id);
            if (idx !== -1) {
              currentQueue[idx].status = 'queued';
              chrome.storage.local.set({ pinQueue: currentQueue }, () => {
                // Tell background to dispatch THIS item to the backend immediately
                chrome.runtime.sendMessage({ action: 'processManualPin', pinId: item.id });
              });
            }
          });
        });
        
        const removeBtn = document.createElement('button');
        removeBtn.className = "queue-remove-btn";
        removeBtn.innerHTML = "✖";
        removeBtn.title = "Remove item";
        removeBtn.addEventListener('click', () => {
          removeItemFromQueue(item.id);
        });

        row.appendChild(img);
        row.appendChild(details);
        row.appendChild(pinNowBtn);
        row.appendChild(removeBtn);
        
        queueListContainer.appendChild(row);
      });
    });
  }

  // Open Pinterest pin creation page for a specific queue item (manual trigger)
  async function openPinterestForItem(item) {
    // Store pin data in session storage so content script can reliably read it
    await chrome.storage.session.set({
      pendingPin: {
        affLink: item.affLink || item.productUrl,
        imageUrl: item.imageUrl,
        description: item.description || item.title,
        title: item.title,
        board: item.board || 'Viral Finds',
        pinId: item.id
      }
    });

    let cleanImage = item.imageUrl.replace(/_[0-9]+x[0-9]+.*\.jpg/i, '');
    const validIndex = Math.max(cleanImage.toLowerCase().lastIndexOf('.jpg'), cleanImage.toLowerCase().lastIndexOf('.png'));
    if (validIndex !== -1) cleanImage = cleanImage.substring(0, validIndex + 4);

    const safeDesc = (item.description || item.title).substring(0, 450);
    
    // Shorten the affiliate link to prevent Pinterest from stripping the tracking parameters
    let affiliateUrl = item.affLink || item.productUrl;
    if (affiliateUrl.includes('aliexpress.com') && !affiliateUrl.includes('s.click')) {
        try {
            const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(affiliateUrl)}`);
            const data = await res.json();
            if (data && data.shorturl) affiliateUrl = data.shorturl;
        } catch(e) { console.warn("Shortener failed"); }
    }
    
    const pinterestUrl = `https://www.pinterest.com/pin/create/extension/?url=${encodeURIComponent(affiliateUrl)}&media=${encodeURIComponent(cleanImage)}&description=${encodeURIComponent(safeDesc)}`;
    chrome.tabs.create({ url: pinterestUrl, active: true });
  }

  function removeItemFromQueue(itemId) {
    chrome.storage.local.get(['pinQueue'], (result) => {
      let queue = result.pinQueue || [];
      queue = queue.filter(item => item.id !== itemId);
      chrome.storage.local.set({ pinQueue: queue }, () => {
        renderQueue();
      });
    });
  }

  // Clear completed and failed queue items
  btnClearQueue.addEventListener('click', () => {
    chrome.storage.local.get(['pinQueue'], (result) => {
      let queue = result.pinQueue || [];
      // Keep only queued and processing items
      queue = queue.filter(item => item.status === 'queued' || item.status === 'processing');
      chrome.storage.local.set({ pinQueue: queue }, () => {
        renderQueue();
      });
    });
  });

  // --- 10. AUTOPILOT DASHBOARD STATS ---
  function updateAutopilotStats() {
    chrome.storage.local.get(['pinQueue'], (result) => {
      const queue = result.pinQueue || [];
      
      const queuedCount = queue.filter(item => item.status === 'queued').length;
      statQueueCount.textContent = queuedCount;
      queueCountBadge.textContent = queuedCount;

      // Count completed items in the last 24 hours
      const last24h = Date.now() - (24 * 60 * 60 * 1000);
      const completedToday = queue.filter(item => item.status === 'completed' && item.completedAt && item.completedAt >= last24h).length;
      statCompletedCount.textContent = completedToday;
    });
  }

  // Manually Trigger Autopilot
  btnTriggerAutopilot.addEventListener('click', () => {
    btnTriggerAutopilot.disabled = true;
    const originalText = btnTriggerAutopilot.textContent;
    btnTriggerAutopilot.textContent = "⏳ Running Sourcing...";
    btnTriggerAutopilot.style.opacity = "0.7";

    chrome.runtime.sendMessage({ action: "triggerAutopilotNow" }, (response) => {
      console.log("Autopilot sourcing manual run response:", response);
      
      setTimeout(() => {
        btnTriggerAutopilot.disabled = false;
        btnTriggerAutopilot.textContent = originalText;
        btnTriggerAutopilot.style.opacity = "";
        
        // Show success alert in popup
        alert("Autopilot search sequence started! Running in background tabs. Do not close browser.");
        updateAutopilotStats();
      }, 1500);
    });
  });
});