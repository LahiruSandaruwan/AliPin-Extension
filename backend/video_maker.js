const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to download image
function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

// Generate Video using raw FFmpeg command
async function createProductVideo(pinData) {
    return new Promise(async (resolve, reject) => {
        try {
            const tempDir = path.join(__dirname, 'temp_media');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            const pinId = pinData.id || Date.now().toString();
            const imgPath = path.join(tempDir, `${pinId}.jpg`);
            const videoPath = path.join(tempDir, `${pinId}.mp4`);

            let aliVideoUrl = null;
            try {
                // Try to find the default AliExpress video
                console.log(`[VideoMaker] Checking for default video on AliExpress...`);
                const curlCmd = `curl -s -L -A "Mozilla/5.0" "${pinData.productUrl}" | grep -o '"videoUrl":"[^"]*"' | head -1`;
                const curlResult = require('child_process').execSync(curlCmd, { encoding: 'utf8' });
                if (curlResult && curlResult.includes('videoUrl')) {
                    aliVideoUrl = curlResult.split('"videoUrl":"')[1].split('"')[0];
                    console.log(`[VideoMaker] Found default video: ${aliVideoUrl}`);
                }
            } catch(e) {
                // Ignore, means no video found
            }

            if (aliVideoUrl) {
                // Use FFmpeg to download and format the existing video
                console.log(`[VideoMaker] Processing existing AliExpress video...`);
                const cleanTitle = pinData.title.replace(/'/g, "\u2019").replace(/:/g, "\\:");
                const shortTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;
                
                // Crop and scale to 9:16 and add title overlay
                const filterComplex = `
                    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[fg];
                    [fg]drawtext=text='${shortTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h-200:box=1:boxcolor=black@0.6:boxborderw=15
                `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();

                const ffmpegCmd = `ffmpeg -y -i "${aliVideoUrl}" -t 15 -filter_complex "${filterComplex}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${videoPath}"`;

                exec(ffmpegCmd, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[VideoMaker] FFmpeg error on Ali Video: ${error.message}`);
                        reject(error);
                        return;
                    }
                    console.log(`[VideoMaker] Successfully processed Ali video: ${videoPath}`);
                    resolve(videoPath);
                });
                return;
            }

            // Fallback: Generate from Image
            console.log(`[VideoMaker] No video found. Generating from image for ${pinId}...`);
            await downloadImage(pinData.imageUrl, imgPath);

            // 2. Build FFmpeg command for 9:16 vertical video (1080x1920)
            // - Creates blurred background from image
            // - Overlays original image in center
            // - Adds 5 second duration
            // - Very low RAM/CPU usage using ultrafast preset
            console.log(`[VideoMaker] Generating video for ${pinId}...`);
            
            // Clean up title for FFmpeg drawtext (escape single quotes and colons)
            const cleanTitle = pinData.title.replace(/'/g, "\u2019").replace(/:/g, "\\:");
            const shortTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;

            const filterComplex = `
                [0:v]scale=1080:1920:force_original_aspect_ratio=increase,boxblur=20:20,crop=1080:1920[bg];
                [0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];
                [bg][fg]overlay=x=(W-w)/2:y=(H-h)/2[combined];
                [combined]drawtext=text='${shortTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=h-200:box=1:boxcolor=black@0.6:boxborderw=15
            `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();

            const ffmpegCmd = `ffmpeg -y -loop 1 -i "${imgPath}" -t 5 -filter_complex "${filterComplex}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${videoPath}"`;

            exec(ffmpegCmd, (error, stdout, stderr) => {
                // Delete temp image
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);

                if (error) {
                    console.error(`[VideoMaker] FFmpeg error: ${error.message}`);
                    reject(error);
                    return;
                }

                console.log(`[VideoMaker] Successfully generated video: ${videoPath}`);
                resolve(videoPath);
            });

        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { createProductVideo };
