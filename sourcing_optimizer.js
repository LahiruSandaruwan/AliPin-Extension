// AliPin Chrome Extension - Sourcing Optimizer (RAM & CPU Saver)
// Runs at document_start to block heavy media files on automated AliExpress searches.

if (window.location.href.includes('autoProspect=true')) {
  // Inject CSS to hide images/videos immediately — stops them rendering during auto-sourcing scans.
  // (CSP meta tags must be inside <head> so we use CSS instead, which works at document_start.)
  const style = document.createElement('style');
  style.textContent = [
    'img, video, iframe,',
    '[class*="video"], [class*="player"],',
    '[class*="gallery"], [class*="carousel"],',
    '[class*="image"], [class*="thumb"]',
    '{ display: none !important; }'
  ].join(' ');
  document.documentElement.appendChild(style);

  console.log("AliPin Sourcing Optimizer: Media block active. RAM consumption optimized.");
}
