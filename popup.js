document.addEventListener('DOMContentLoaded', async () => {
  const trackingIdInput = document.getElementById('trackingId');
  const bridgeUrlInput = document.getElementById('bridgeUrl');
  const linkRoutingSelect = document.getElementById('linkRouting');
  const bridgeLinkGroup = document.getElementById('bridgeLinkGroup');
  
  const prodTitleInput = document.getElementById('prodTitle');
  const affLinkInput = document.getElementById('affLink');
  const pinDescInput = document.getElementById('pinDesc');
  const charCountSpan = document.getElementById('charCount');
  
  const btnPin = document.getElementById('btnPin');
  const btnSave = document.getElementById('btnSave');
  const badge = document.getElementById('winningBadge');
  
  let productData = null;
  const LEGAL_TAGS = " #musthaves #viralgadgets #affiliate #ad";

  // 1. Load Settings
  chrome.storage.local.get(['trackingId', 'linkRouting', 'bridgeUrl'], (result) => {
    if (result.trackingId) trackingIdInput.value = result.trackingId;
    if (result.linkRouting) {
      linkRoutingSelect.value = result.linkRouting;
      bridgeLinkGroup.style.display = result.linkRouting === 'bridge' ? 'block' : 'none';
    }
    if (result.bridgeUrl) bridgeUrlInput.value = result.bridgeUrl;
  });

  // 2. Routing Selector Behavior
  linkRoutingSelect.addEventListener('change', () => {
    bridgeLinkGroup.style.display = linkRoutingSelect.value === 'bridge' ? 'block' : 'none';
    generateFinalLink();
  });

  // 3. Save Settings Action
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

  // 4. Character Counter and Tag Enforcement
  const updateCharCount = () => {
    const len = pinDescInput.value.length;
    charCountSpan.textContent = `${len}/500`;
    charCountSpan.style.color = len >= 500 ? '#E60023' : '#666';
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

  // 5. Link Generation Engine
  function generateFinalLink() {
    if (!productData) return;
    
    let routingChoice = linkRoutingSelect.value;
    let trackingId = trackingIdInput.value.trim() || '_pz9sEiR'; // Default format
    
    // Auto-extracted s.click link has highest priority if direct link is chosen
    if (routingChoice === 'direct' && productData.sClickUrl) {
      affLinkInput.value = productData.sClickUrl;
      return;
    }
    
    let finalLink = "";
    
    if (routingChoice === 'direct') {
      // Direct Affiliate Link using raw URL append
      try {
        const urlObj = new URL(productData.productUrl);
        urlObj.searchParams.set('aff_platform', 'portals-promotion');
        urlObj.searchParams.set('sk', trackingId);
        finalLink = urlObj.toString();
      } catch(e) {
        finalLink = productData.productUrl + (productData.productUrl.includes('?') ? '&' : '?') + `aff_platform=portals-promotion&sk=${trackingId}`;
      }
    } else {
      // Landing Page / Bridge Link
      let rootUrl = bridgeUrlInput.value.trim();
      if (!rootUrl) rootUrl = "https://linktr.ee/yourprofile"; // Fallback placeholder
      
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

  // 6. Connect to content.js and load product
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.match(/aliexpress\.(com|us|ru)\/(item|i)\//)) {
      // First, try to extract s.click link from ALL frames (in case SiteStripe is an iframe)
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

            // Try to automate clicking the SiteStripe button
            const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
            const getLinkBtn = buttons.find(b => b.innerText && (b.innerText.trim() === 'Get link' || b.innerText.trim() === 'Text'));
            
            if (getLinkBtn) {
              getLinkBtn.click();
              // Poll for the link to generate (up to 3 seconds)
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
          // Override with global s.click if found in any iframe
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
            badge.textContent = `Normal Product (${productData.orders > 0 ? productData.orders.toLocaleString() : 'Few'} Sold)`;
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
      showError("Please open an AliExpress product page to use this tool.");
    }
  } catch (error) {
    showError("Extension Error: " + error.message);
  }

  // 7. Pinterest Dispatcher
  btnPin.addEventListener('click', () => {
    if (!productData) {
      alert("No product data loaded.");
      return;
    }

    // Auto copy board name
    function getBoardName(title) {
        const titleLower = title.toLowerCase();
        if (titleLower.includes('home') || titleLower.includes('kitchen') || titleLower.includes('decor')) return 'Home Decor Finds';
        if (titleLower.includes('gadget') || titleLower.includes('electronic') || titleLower.includes('usb')) return 'Tech Gadgets';
        if (titleLower.includes('beauty') || titleLower.includes('makeup')) return 'Beauty Hacks';
        if (titleLower.includes('toy') || titleLower.includes('baby') || titleLower.includes('kids')) return 'Kids & Mom Life';
        if (titleLower.includes('car') || titleLower.includes('auto')) return 'Car Accessories';
        return 'Viral Finds';
    }
    let rawTitle = prodTitleInput.value;
    // Auto copy Title because Pinterest blocks it via URL
    navigator.clipboard.writeText(rawTitle).catch(e => console.log('Copy failed'));
    
    let combinedDesc = "📌 " + rawTitle + "\n\n" + pinDescInput.value;
    // Force compliance before sending
    combinedDesc = enforceDisclosures(combinedDesc);
    
    let finalLink = affLinkInput.value;
    
    let pinTitle = encodeURIComponent(rawTitle);
    
    let pinLink = encodeURIComponent(finalLink);
    let pinImage = encodeURIComponent(productData.imageUrl);
    let pinDesc = encodeURIComponent(combinedDesc);

    let pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${pinLink}&media=${pinImage}&description=${pinDesc}&title=${pinTitle}`;
    window.open(pinterestUrl, '_blank', 'width=800,height=600');
  });
});