const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const TEMP_DIR = '/tmp';

// Helper: download file from URL
async function downloadFile(url, filepath) {
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  const writer = fs.createWriteStream(filepath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

app.post('/merge', async (req, res) => {
  const { videoUrls, audioUrl } = req.body;

  if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0 || !audioUrl) {
    return res.status(400).json({ error: 'videoUrls (array) and audioUrl are required' });
  }

  const jobId = uuidv4();
  const outputPath = path.join(TEMP_DIR, `${jobId}_output.mp4`);
  const concatListPath = path.join(TEMP_DIR, `${jobId}_list.txt`);
  const localPaths = [];

  try {
    // Download each video locally (concat demuxer needs local files)
    for (let i = 0; i < videoUrls.length; i++) {
      const vPath = path.join(TEMP_DIR, `${jobId}_v${i}.mp4`);
      await downloadFile(videoUrls[i], vPath);
      localPaths.push(vPath);
    }

    // Create concat list file
    const listContent = localPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, listContent);

    // Concat videos, then merge with audio (cuts to audio length if videos are longer)
    const command = `ffmpeg -f concat -safe 0 -i ${concatListPath} -i "${audioUrl}" -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 28 -c:a aac -shortest ${outputPath} -y`;

    exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      // Clean up input files
      localPaths.forEach(p => fs.unlink(p, () => {}));
      fs.unlink(concatListPath, () => {});

      if (error) {
        console.error('FFmpeg error:', stderr);
        return res.status(500).json({ error: 'FFmpeg processing failed', details: stderr });
      }

      res.sendFile(outputPath, (err) => {
        fs.unlink(outputPath, () => {});
      });
    });

  } catch (err) {
    localPaths.forEach(p => fs.unlink(p, () => {}));
    res.status(500).json({ error: 'Download failed', details: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg service running on port ${PORT}`);
});
