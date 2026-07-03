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
  const LEGAL_TAGS = " #aliexpressfinds #viralgadgets #affiliate #ad";

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
    
    let trackingId = trackingIdInput.value.trim() || '_pz9sEiR'; // Default format
    let routingChoice = linkRoutingSelect.value;
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
    document.body.innerHTML = `<div style="color:#E60023; padding:20px; text-align:center; font-weight:bold;">${msg}</div>`;
  }

  // 6. Connect to content.js and load product
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.match(/aliexpress\.(com|us|ru)\/(item|i)\//)) {
      chrome.tabs.sendMessage(tab.id, { action: "getProductData" }, (response) => {
        if (chrome.runtime.lastError) {
          showError("Connection failed. Please refresh the AliExpress page.");
          return;
        }

        if (response && response.title) {
          productData = response;
          prodTitleInput.value = productData.title;
          
          // Badge Logic
          if (productData.orders >= 500) {
            badge.textContent = `🔥 Winning Product! (${productData.orders.toLocaleString()}+ Sold)`;
            badge.className = "badge winning";
          } else {
            badge.textContent = `Normal Product (${productData.orders > 0 ? productData.orders.toLocaleString() : 'Few'} Sold)`;
            badge.className = "badge";
          }
          
          // Setup initial description
          const initialDesc = `Check out this amazing find on AliExpress! 😍 👇`;
          pinDescInput.value = enforceDisclosures(initialDesc);
          updateCharCount();
          
          generateFinalLink();
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

    // Force compliance before sending
    pinDescInput.value = enforceDisclosures(pinDescInput.value);
    
    let finalLink = affLinkInput.value;
    let pinTitle = encodeURIComponent(productData.title);
    let pinLink = encodeURIComponent(finalLink);
    let pinImage = encodeURIComponent(productData.imageUrl);
    let pinDesc = encodeURIComponent(pinDescInput.value.substring(0, 500));

    let pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${pinLink}&media=${pinImage}&description=${pinDesc}&title=${pinTitle}`;
    window.open(pinterestUrl, '_blank', 'width=800,height=600');
  });
});