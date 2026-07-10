const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Helper to download image using axios (handles redirects properly)
async function downloadImage(url, dest) {
    const response = await axios.get(url, {
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 30000,
        maxRedirects: 10
    });
    
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Generate Video using raw FFmpeg command
async function createProductVideo(pinData) {
    return new Promise(async (resolve, reject) => {
        try {
            const tempDir = path.join(__dirname, 'temp_media');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            const pinId = pinData.pinId || pinData.id || Date.now().toString();
            const imgPath = path.join(tempDir, `${pinId}_raw`);  // no extension - could be webp or jpg
            const imgConvertedPath = path.join(tempDir, `${pinId}.png`);  // always convert to PNG first
            const videoPath = path.join(tempDir, `${pinId}.mp4`);

            let aliVideoUrl = null;
            try {
                // Try to find the default AliExpress video
                console.log(`[VideoMaker] Checking for default video on AliExpress...`);
                if (pinData.affLink) {
                    const resp = await axios.get(pinData.affLink, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        timeout: 10000,
                        maxRedirects: 5,
                        validateStatus: () => true
                    });
                    const html = (resp.data || '').toString();
                    const videoMatch = html.match(/"videoUrl"\s*:\s*"([^"]+)"/);
                    if (videoMatch) {
                        aliVideoUrl = videoMatch[1];
                        console.log(`[VideoMaker] Found default video: ${aliVideoUrl}`);
                    }
                }
            } catch(e) {
                console.log(`[VideoMaker] AliExpress video check skipped: ${e.message}`);
            }

            if (aliVideoUrl) {
                // Use FFmpeg to download and format the existing video
                console.log(`[VideoMaker] Processing existing AliExpress video...`);
                const cleanTitle = pinData.title.replace(/'/g, "\u2019").replace(/:/g, "\\:");
                const shortTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;
                
                const filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[fg];[fg]drawtext=text='${shortTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h-200:box=1:boxcolor=black@0.6:boxborderw=15`;

                const ffmpegCmd = `ffmpeg -y -i "${aliVideoUrl}" -t 15 -filter_complex "${filterComplex}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${videoPath}"`;

                console.log(`[VideoMaker] Running FFmpeg (Ali video)...`);
                exec(ffmpegCmd, { timeout: 120000 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[VideoMaker] FFmpeg error on Ali Video: ${error.message}`);
                        console.error(`[VideoMaker] FFmpeg stderr: ${(stderr || '').substring(0, 300)}`);
                        reject(error);
                        return;
                    }
                    console.log(`[VideoMaker] ✅ Successfully processed Ali video: ${videoPath}`);
                    resolve(videoPath);
                });
                return;
            }

            // Fallback: Generate from Image
            console.log(`[VideoMaker] No AliExpress video found. Generating from image...`);
            
            // Step 1: Download image
            console.log(`[VideoMaker] Downloading image: ${pinData.imageUrl.substring(0, 80)}...`);
            await downloadImage(pinData.imageUrl, imgPath);
            
            const stats = fs.statSync(imgPath);
            console.log(`[VideoMaker] Image downloaded: ${stats.size} bytes`);
            
            if (stats.size < 1000) {
                throw new Error('Downloaded image is too small, likely a failed download');
            }

            // Step 2: Convert to PNG first (handles WebP, AVIF, etc.)
            console.log(`[VideoMaker] Converting image to PNG...`);
            await new Promise((res, rej) => {
                exec(`ffmpeg -y -i "${imgPath}" "${imgConvertedPath}"`, { timeout: 30000 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[VideoMaker] Image conversion error: ${error.message}`);
                        console.error(`[VideoMaker] FFmpeg stderr: ${(stderr || '').substring(0, 300)}`);
                        rej(error);
                        return;
                    }
                    console.log(`[VideoMaker] Image converted to PNG successfully`);
                    res();
                });
            });

            // Step 3: Build FFmpeg command for 9:16 vertical video (1080x1920)
            console.log(`[VideoMaker] Generating 9:16 video...`);
            
            const cleanTitle = pinData.title.replace(/'/g, "\u2019").replace(/:/g, "\\:");
            const shortTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;

            const filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,boxblur=20:20,crop=1080:1920[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2[combined];[combined]drawtext=text='${shortTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h-200:box=1:boxcolor=black@0.6:boxborderw=15`;

            const ffmpegCmd = `ffmpeg -y -loop 1 -i "${imgConvertedPath}" -t 5 -filter_complex "${filterComplex}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${videoPath}"`;

            console.log(`[VideoMaker] Running FFmpeg...`);
            exec(ffmpegCmd, { timeout: 120000 }, (error, stdout, stderr) => {
                // Cleanup temp files
                try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch(e) {}
                try { if (fs.existsSync(imgConvertedPath)) fs.unlinkSync(imgConvertedPath); } catch(e) {}

                if (error) {
                    console.error(`[VideoMaker] ❌ FFmpeg error: ${error.message}`);
                    console.error(`[VideoMaker] FFmpeg stderr: ${(stderr || '').substring(0, 500)}`);
                    reject(error);
                    return;
                }

                if (!fs.existsSync(videoPath)) {
                    console.error(`[VideoMaker] ❌ Video file not created at ${videoPath}`);
                    reject(new Error('Video file was not created'));
                    return;
                }

                const videoStats = fs.statSync(videoPath);
                console.log(`[VideoMaker] ✅ Video generated: ${videoPath} (${(videoStats.size / 1024).toFixed(0)} KB)`);
                resolve(videoPath);
            });

        } catch (error) {
            console.error(`[VideoMaker] ❌ Fatal error: ${error.message}`);
            reject(error);
        }
    });
}

module.exports = { createProductVideo };
