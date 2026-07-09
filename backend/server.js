const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { pinToPinterest, startPinnerService } = require('./pinner');
const { createProductVideo } = require('./video_maker');
const { uploadToYouTubeShorts } = require('./youtube_uploader');
const { uploadToTikTok } = require('./tiktok_uploader');
const { uploadToLinktree } = require('./linktree_uploader');

const app = express();
app.use(cors());
app.use(express.json());

const QUEUE_FILE = path.join(__dirname, 'queue.json');

// Initialize queue file if it doesn't exist
if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([]));
}

// Add to queue
app.post('/api/queue', (req, res) => {
    const pinData = req.body;
    
    if (!pinData.affLink || !pinData.imageUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const currentQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        currentQueue.push({
            ...pinData,
            addedAt: Date.now(),
            status: 'pending'
        });
        
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(currentQueue, null, 2));
        console.log(`[Queue] Added new pin to queue: ${pinData.title}`);
        res.status(200).json({ success: true, queueLength: currentQueue.length });
    } catch (error) {
        console.error("Pinterest Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to generate video and upload to TikTok / YouTube
app.post('/api/video-upload', async (req, res) => {
    try {
        const pinData = req.body;
        console.log(`[Server] Received Video Request for: ${pinData.title}`);

        // 1. Generate Video
        const videoPath = await createProductVideo(pinData);

        // 2. Upload to YouTube (if cookie provided)
        if (pinData.youtubeCookie) {
            uploadToYouTubeShorts(pinData, videoPath).catch(e => console.error("YT Error:", e));
        }

        // 3. Upload to TikTok (if cookie provided)
        if (pinData.tiktokCookie) {
            uploadToTikTok(pinData, videoPath).catch(e => console.error("TikTok Error:", e));
        }

        // 4. Update Linktree (if cookie provided)
        if (pinData.linktreeCookie) {
            uploadToLinktree(pinData).catch(e => console.error("Linktree Error:", e));
        }

        // We return success immediately so the extension doesn't hang waiting for long uploads
        res.json({ success: true, message: 'Video generation and uploads started in background.' });
        
    } catch (error) {
        console.error("Video Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get queue status
app.get('/api/queue', (req, res) => {
    try {
        const currentQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        const pending = currentQueue.filter(p => p.status === 'pending').length;
        res.status(200).json({ total: currentQueue.length, pending });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read queue' });
    }
});

const PORT = 3333;
app.listen(PORT, () => {
    console.log(`[Server] AliPin Backend running on http://localhost:${PORT}`);
    
    // Start the background pinner service
    console.log(`[Pinner] Starting background automation service...`);
    startPinnerService(QUEUE_FILE);
});
