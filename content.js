// --- 1. ITEM PAGE SCRAPING LOGIC ---
function getProductDetails() {
  const titleSelectors = ['h1[data-buy-box-listing-title]', 'h1.wt-text-body-01', 'h1[data-pl="product-title"]', '.pdp-info-title', '.product-title-text', 'h1', '.product-title'];
  let title = '';
  for (const selector of titleSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim() !== '') {
      title = el.innerText.trim();
      break;
    }
  }
  if (!title) title = document.title.replace(/- AliExpress.*$/i, '').trim();

  let imageUrl = '';
  const ogImg = document.querySelector('meta[property="og:image"]');
  if (ogImg && ogImg.content) {
      imageUrl = ogImg.content;
  }
  
  if (!imageUrl || imageUrl.includes('logo')) {
      const imageSelectors = ['.carousel-image', 'img[data-listing-image]', '.pdp-info-main-img img', '.magnifier-image', '.image-view-magnifier-wrap img', '.item-detail-img', 'img[src*="kf/"]'];
      for (const selector of imageSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          let srcFound = el.getAttribute('srcset') ? el.getAttribute('srcset').split(',')[0].trim().split(' ')[0] : (el.getAttribute('data-src') || el.getAttribute('src'));
          if (srcFound && !srcFound.includes('data:image') && !srcFound.includes('.gif') && !srcFound.includes('logo')) {
            if (srcFound.startsWith('//')) srcFound = 'https:' + srcFound;
            imageUrl = srcFound;
            break;
          }
        }
      }
  }
  
  if (imageUrl) {
      // Remove AliExpress suffixes like _640x640.jpg or _.webp to get the clean original image
      imageUrl = imageUrl.replace(/_[0-9]+x[0-9]+.*\.jpg/i, '');
      
      // Ensure the URL ends exactly at .jpg or .png
      const jpgIndex = imageUrl.toLowerCase().lastIndexOf('.jpg');
      const pngIndex = imageUrl.toLowerCase().lastIndexOf('.png');
      const validIndex = Math.max(jpgIndex, pngIndex);
      
      if (validIndex !== -1) {
          imageUrl = imageUrl.substring(0, validIndex + 4);
      }
      
      if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
      }
  }

  let rating = 0;
  const ratingSelectors = ['.overview-rating-average', 'span[data-pl="product-reviewer"] strong', '.review-title', '.rating-value'];
  for (const selector of ratingSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText) {
      const match = el.innerText.match(/(\d+\.\d+)/);
      if (match) { rating = parseFloat(match[1]); break; }
    }
  }

  let orders = 0;
  const ordersSelectors = ['.product-reviewer-sold', '.format-sold-count', 'span.black-link', 'div[data-pl="product-reviewer"] span', '.product-reviewer span'];
  for (const selector of ordersSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.innerText ? el.innerText.toLowerCase() : '';
      if (text.includes('sold') || text.includes('order')) {
        const match = text.replace(/,/g, '').match(/(\d+)/);
        if (match) {
          orders = parseInt(match[1]);
          if (text.includes('k')) orders *= 1000;
          if (text.includes('m')) orders *= 1000000;
          break;
        }
      }
    }
    if (orders > 0) break;
  }
  let sClickUrl = '';
  const inputs = document.querySelectorAll('input, textarea');
  for (const input of inputs) {
    if (input.value && input.value.includes('s.click.aliexpress.com')) {
      sClickUrl = input.value.trim();
      break;
    }
  }
  if (!sClickUrl) {
     const match = document.body.innerHTML.match(/(https:\/\/s\.click\.aliexpress\.com\/e\/_[a-zA-Z0-9]+)/);
     if (match) sClickUrl = match[1];
  }
  
  const productUrl = window.location.href.split('?')[0].split('#')[0];
  return { title, imageUrl, productUrl, rating, orders, sClickUrl };
}

// Listen for popup messages (used on Item pages)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getProductData") {
    sendResponse(getProductDetails());
  }
  return true; 
});


// --- 2. SEARCH PAGE PROSPECTING LOGIC ---
const LEGAL_TAGS = " #musthaves #viralgadgets #affiliate #ad";

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

// Generates an optimized Pinterest Board Name based on product keywords
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

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(err => fallbackCopyTextToClipboard(text));
  } else {
      fallbackCopyTextToClipboard(text);
  }
}

function fallbackCopyTextToClipboard(text) {
  var textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try { document.execCommand('copy'); } catch (err) { console.error('Fallback copy failed', err); }
  document.body.removeChild(textArea);
}

function generateSeoTitle(rawTitle) {
    const words = rawTitle.split(/\s+/);
    let short = words.slice(0, 6).join(' ').replace(/[,|\-].*$/, '').trim();
    short = short.replace(/\b\w/g, l => l.toUpperCase());
    return short.length > 60 ? short.substring(0, 60).trim() : short;
}

function triggerQuickPin(title, imageUrl, productUrl) {
    // 1. Auto-Copy Title to Clipboard (since Pinterest blocks title via URL)
    let rawTitle = generateSeoTitle(title);
    copyToClipboard(rawTitle);

    // 2. Load settings and open Pinterest
    chrome.storage.local.get(['trackingId', 'linkRouting', 'bridgeUrl'], (result) => {
        let trackingId = result.trackingId || '_pz9sEiR'; // Default to a valid format example
        let routingChoice = result.linkRouting || 'direct';
        let finalLink = "";
        
        if (routingChoice === 'direct') {
          // Fix: Use raw URL append method instead of broken s.click placeholder
          try {
            const urlObj = new URL(productUrl);
            urlObj.searchParams.set('aff_platform', 'portals-promotion');
            urlObj.searchParams.set('sk', trackingId);
            finalLink = urlObj.toString();
          } catch(e) {
            finalLink = productUrl + (productUrl.includes('?') ? '&' : '?') + `aff_platform=portals-promotion&sk=${trackingId}`;
          }
        } else {
          let rootUrl = result.bridgeUrl || "https://linktr.ee/yourprofile";
          const match = productUrl.match(/\/(\d+)\.html/);
          const productId = match ? match[1] : 'ali_item';
          finalLink = rootUrl + (rootUrl.includes('?') ? '&' : '?') + `product=${productId}`;
        }
        
        const autoTags = generateHashtags(title);
        
        function generateSmartDescription(productTitle) {
            const words = productTitle.split(/\s+/);
            const shortTitle = words.slice(0, 7).join(' ').replace(/[,|\-].*$/, '').trim();
            const templates = [
                `Looking for the perfect ${shortTitle}? This is one of our absolute favorite finds! 😍 Grab yours today before they sell out! 👇`,
                `You definitely need this ${shortTitle} in your life! 🔥 Amazing quality and super useful. Get the best deal here 👇`,
                `Upgrade your lifestyle with this ${shortTitle}! ✨ We absolutely love this find. Click through to see more details! 👇`,
                `Check out this incredible ${shortTitle}! 🛒 Highly recommended by buyers and currently trending. Don't miss out! 👇`
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }
        
        let rawTitle = title;
        if (rawTitle.length > 95) rawTitle = rawTitle.substring(0, 95) + "...";
        
        const initialDesc = "📌 " + rawTitle + "\n\n" + generateSmartDescription(title) + `\n\n${autoTags}`;
        const pinDesc = enforceDisclosures(initialDesc);
        let pinTitleEnc = encodeURIComponent(rawTitle);
        let pinLinkEnc = encodeURIComponent(finalLink);
        let pinImageEnc = encodeURIComponent(imageUrl);
        let pinDescEnc = encodeURIComponent(pinDesc);

        let pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${pinLinkEnc}&media=${pinImageEnc}&description=${pinDescEnc}&title=${pinTitleEnc}`;
        window.open(pinterestUrl, '_blank', 'width=800,height=600');
    });
}

function processCard(card, itemUrl) {
  const text = card.innerText.toLowerCase();
  let orders = 0;
  
  // Extract sales from card text
  const match = text.match(/(\d+[,.]?\d*[km]?)\+?\s*(sold|orders)/i);
  if (match) {
    let numStr = match[1].replace(/,/g, '');
    let mult = 1;
    if (numStr.includes('k')) { mult = 1000; numStr = numStr.replace('k', ''); }
    if (numStr.includes('m')) { mult = 1000000; numStr = numStr.replace('m', ''); }
    orders = parseFloat(numStr) * mult;
  }
  
  if (orders >= 500) {
    // Highlight Card
    card.style.border = "3px solid #28a745";
    card.style.boxShadow = "0 4px 8px rgba(40,167,69,0.3)";
    card.style.position = "relative";
    
    // Add Badge
    const badge = document.createElement('div');
    badge.innerText = "🔥 Winning Niche";
    badge.style.position = "absolute";
    badge.style.top = "10px";
    badge.style.left = "10px";
    badge.style.backgroundColor = "#28a745";
    badge.style.color = "white";
    badge.style.padding = "4px 8px";
    badge.style.borderRadius = "4px";
    badge.style.fontWeight = "bold";
    badge.style.zIndex = "100";
    badge.style.fontSize = "12px";
    card.appendChild(badge);
    
    // Extract Title & Image from card
    let title = "";
    const titleEl = card.querySelector('h1, h3, [class*="title--"]');
    if (titleEl) title = titleEl.innerText.trim();
    if (!title) {
       const textNodes = Array.from(card.querySelectorAll('*')).map(el => el.innerText ? el.innerText.trim() : "").filter(t => t.length > 20);
       if (textNodes.length > 0) title = textNodes[0];
    }
    
    let imageUrl = "";
    const allImgs = Array.from(card.querySelectorAll('img'));
    
    // First try to find a high-quality product image (usually on kf/ CDN)
    let bestImg = null;
    for (let img of allImgs) {
       let src = img.src || img.dataset.src || "";
       // Skip UI icons, tracking pixels, and lazy loaders
       if (src.includes('data:image') || src.includes('.gif') || src.includes('lazyload') || src.includes('.svg') || src.includes('logo')) {
           continue;
       }
       if (src.includes('kf/')) {
           bestImg = img;
           break; // Found the AliExpress CDN image
       }
       if (!bestImg) bestImg = img;
    }
    
    if (bestImg) {
       imageUrl = bestImg.src || bestImg.dataset.src || "";
       if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
       imageUrl = imageUrl.replace(/_[0-9]+x[0-9]+.*\.jpg/i, '');
    }
    
    // Add "Quick Pin" Button
    const btn = document.createElement('button');
    btn.innerText = "📌 Quick Pin";
    btn.style.position = "absolute";
    btn.style.bottom = "10px";
    btn.style.right = "10px";
    btn.style.backgroundColor = "#E60023";
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.padding = "8px 12px";
    btn.style.borderRadius = "20px";
    btn.style.fontWeight = "bold";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "100";
    btn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
    
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Show visual feedback that it was copied
      const originalText = btn.innerText;
      btn.innerText = "📋 Copied!";
      btn.style.backgroundColor = "#28a745";
      setTimeout(() => { 
        btn.innerText = originalText; 
        btn.style.backgroundColor = "#E60023";
      }, 2000);
      
      triggerQuickPin(title, imageUrl, itemUrl);
    };
    
    card.appendChild(btn);
  }
}

function findProductCards() {
  const itemLinks = document.querySelectorAll('a[href*="/item/"], a[href*="/p/"]');
  
  itemLinks.forEach(link => {
    // Find the main card container
    let card = link.closest('div[class*="outWrapper"], div[class*="list--gallery"], div[class*="search-card-item"]');
    
    if (!card) {
       let parent = link.parentElement;
       for (let i = 0; i < 5; i++) {
           if (parent && parent.innerText && (parent.innerText.toLowerCase().includes('sold') || parent.innerText.toLowerCase().includes('order'))) {
               card = parent;
               break;
           }
           if (parent) parent = parent.parentElement;
       }
    }
    
    if (card && !card.dataset.alipinProcessed) {
       card.dataset.alipinProcessed = "true";
       processCard(card, link.href);
    }
  });

  // Fallback for Portals: Find cards via 'Promote now' buttons
  if (window.location.hostname.includes('portals.aliexpress.com')) {
      const allButtons = document.querySelectorAll('button, a, div[role="button"]');
      allButtons.forEach(btn => {
          if (btn.innerText && btn.innerText.toLowerCase().includes('promote now')) {
              let card = btn;
              // Traverse up to find a container with an image
              for (let i = 0; i < 6; i++) {
                  if (card.parentElement) {
                      card = card.parentElement;
                      if (card.querySelector('img') && card.innerText.includes('sold')) {
                          break;
                      }
                  }
              }
              
              if (card && !card.dataset.alipinProcessed) {
                  card.dataset.alipinProcessed = "true";
                  // Try to find product URL from any link inside the card
                  let productUrl = window.location.href; // default to current page
                  const linksInCard = card.querySelectorAll('a');
                  for (let link of linksInCard) {
                      if (link.href && (link.href.includes('aliexpress') || link.href.includes('item'))) {
                          productUrl = link.href;
                          break;
                      }
                  }
                  processCard(card, productUrl);
              }
          }
      });
  }
}

function extractTrackingIdFromPortals() {
    // Try to find tracking ID from common places in Portals (like text, generated links, etc)
    const pageText = document.body.innerText;
    // Look for standard AliExpress tracking ID pattern like _pz9sEiR
    const match = pageText.match(/\b(_[a-zA-Z0-9]{5,10})\b/);
    if (match) {
        chrome.storage.local.get(['trackingId'], (result) => {
            if (result.trackingId !== match[1]) {
                chrome.storage.local.set({ trackingId: match[1] });
                console.log("AliPin: Auto-saved Tracking ID:", match[1]);
            }
        });
    }
    
    // Also look for generated affiliate links in inputs
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        if (input.value && (input.value.includes('sk=') || input.value.includes('aff_short_key='))) {
            let idMatch = input.value.match(/(?:sk|aff_short_key)=([^&]+)/);
            if (idMatch) {
                chrome.storage.local.get(['trackingId'], (result) => {
                    if (result.trackingId !== idMatch[1]) {
                        chrome.storage.local.set({ trackingId: idMatch[1] });
                        console.log("AliPin: Auto-saved Tracking ID from link:", idMatch[1]);
                    }
                });
            }
        }
    });
}

// Check which page we are on
if (window.location.href.includes('/item/') || window.location.href.includes('/i/') || window.location.hostname.includes('etsy.com')) {
    // Item Page: Do nothing (wait for popup message)
} else {
    // Search/Category/Portals Page: Run Prospecting Mode
    if (window.location.hostname.includes('portals.aliexpress.com')) {
        setInterval(extractTrackingIdFromPortals, 3000);
    }
    setInterval(findProductCards, 2000);

    // Check if autopilot search automation is active
    if (window.location.href.includes('autoProspect=true')) {
        automateSearchScraping();
    }
}

function automateSearchScraping() {
  const urlParams = new URLSearchParams(window.location.search);
  const autoProspect = urlParams.get('autoProspect');
  const keyword = urlParams.get('sourcingKeyword') || '';

  if (autoProspect !== 'true') return;

  console.log(`AliPin Autopilot: Automatically scraping search page for "${keyword}"`);

  // Create an overlay to show status
  const overlay = document.createElement('div');
  overlay.innerText = `AliPin: Auto-sourcing products for "${keyword}"...`;
  overlay.style.position = "fixed";
  overlay.style.top = "15px";
  overlay.style.left = "50%";
  overlay.style.transform = "translateX(-50%)";
  overlay.style.backgroundColor = "#28a745";
  overlay.style.color = "white";
  overlay.style.padding = "12px 24px";
  overlay.style.borderRadius = "30px";
  overlay.style.fontSize = "14px";
  overlay.style.fontWeight = "bold";
  overlay.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
  overlay.style.zIndex = "2147483647";
  overlay.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  document.body.appendChild(overlay);

  // Scroll down slowly to load lazy items (take 3 seconds)
  let scrollY = 0;
  const scrollTimer = setInterval(() => {
    scrollY += window.innerHeight / 3;
    window.scrollTo(0, scrollY);
    if (scrollY >= window.innerHeight * 1.5) {
      clearInterval(scrollTimer);
      
      // Perform extraction
      extractTopProducts();
    }
  }, 400);

  async function extractTopProducts() {
    // Wait a brief moment for images to load after scroll
    await new Promise(r => setTimeout(r, 1200));

    const itemLinks = document.querySelectorAll('a[href*="/item/"], a[href*="/p/"]');
    const matchedProducts = [];

    itemLinks.forEach(link => {
      // Find the main card container
      let card = link.closest('div[class*="outWrapper"], div[class*="list--gallery"], div[class*="search-card-item"]');
      
      if (!card) {
         let parent = link.parentElement;
         for (let i = 0; i < 5; i++) {
             if (parent && parent.innerText && (parent.innerText.toLowerCase().includes('sold') || parent.innerText.toLowerCase().includes('order'))) {
                 card = parent;
                 break;
             }
             if (parent) parent = parent.parentElement;
         }
      }
      
      if (card) {
        const text = card.innerText.toLowerCase();
        let orders = 0;
        
        // Extract sales from card text
        const match = text.match(/(\d+[,.]?\d*[km]?)\+?\s*(sold|orders)/i);
        if (match) {
          let numStr = match[1].replace(/,/g, '');
          let mult = 1;
          if (numStr.includes('k')) { mult = 1000; numStr = numStr.replace('k', ''); }
          if (numStr.includes('m')) { mult = 1000000; numStr = numStr.replace('m', ''); }
          orders = parseFloat(numStr) * mult;
        }

        // We want winning products: orders >= 500
        if (orders >= 500) {
          let title = "";
          const titleEl = card.querySelector('h1, h3, [class*="title--"]');
          if (titleEl) title = titleEl.innerText.trim();
          if (!title) {
             const textNodes = Array.from(card.querySelectorAll('*')).map(el => el.innerText ? el.innerText.trim() : "").filter(t => t.length > 20);
             if (textNodes.length > 0) title = textNodes[0];
          }
          
          let imageUrl = "";
          const allImgs = Array.from(card.querySelectorAll('img'));
          let bestImg = null;
          for (let img of allImgs) {
             let src = img.src || img.dataset.src || "";
             if (src.includes('data:image') || src.includes('.gif') || src.includes('lazyload') || src.includes('.svg') || src.includes('logo')) {
                 continue;
             }
             if (src.includes('kf/')) {
                 bestImg = img;
                 break;
             }
             if (!bestImg) bestImg = img;
          }
          
          if (bestImg) {
             imageUrl = bestImg.src || bestImg.dataset.src || "";
             if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
             imageUrl = imageUrl.replace(/_[0-9]+x[0-9]+.*\.jpg/i, '');
          }

          const productUrl = link.href.split('?')[0].split('#')[0];

          if (title && imageUrl && productUrl) {
            if (!matchedProducts.some(p => p.productUrl === productUrl)) {
              matchedProducts.push({ title, imageUrl, productUrl, orders });
            }
          }
        }
      }
    });

    console.log(`AliPin Autopilot: Found ${matchedProducts.length} winning products for "${keyword}"`);
    
    // Send back to background
    chrome.runtime.sendMessage({
      action: "searchProductsScraped",
      products: matchedProducts,
      keyword: keyword
    });
  }
}