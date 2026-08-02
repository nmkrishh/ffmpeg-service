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
  const { videoUrl, audioUrl } = req.body;

  if (!videoUrl || !audioUrl) {
    return res.status(400).json({ error: 'videoUrl and audioUrl are required' });
  }

  const jobId = uuidv4();
  const outputPath = path.join(TEMP_DIR, `${jobId}_output.mp4`);

  const command = `ffmpeg -i "${videoUrl}" -i "${audioUrl}" -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 28 -c:a aac -shortest ${outputPath} -y`;

  exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
    if (error) {
      console.error('FFmpeg error:', stderr);
      return res.status(500).json({ error: 'FFmpeg processing failed', details: stderr });
    }

    res.sendFile(outputPath, (err) => {
      fs.unlink(outputPath, () => {});
    });
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg service running on port ${PORT}`);
});
