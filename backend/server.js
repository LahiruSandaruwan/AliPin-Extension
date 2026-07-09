const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { startPinnerService } = require('./pinner');

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
        console.error('[Queue] Error writing to queue:', error);
        res.status(500).json({ error: 'Failed to queue pin' });
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
