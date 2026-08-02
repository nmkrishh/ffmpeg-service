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
  const videoPath = path.join(TEMP_DIR, `${jobId}_video.mp4`);
  const audioPath = path.join(TEMP_DIR, `${jobId}_audio.mp3`);
  const outputPath = path.join(TEMP_DIR, `${jobId}_output.mp4`);

  try {
    // Download both files
    await downloadFile(videoUrl, videoPath);
    await downloadFile(audioUrl, audioPath);

    // Run ffmpeg to merge
    const command = `ffmpeg -i ${videoPath} -i ${audioPath} -map 0:v -map 1:a -c:v libx264 -c:a aac -shortest ${outputPath} -y`;

    exec(command, (error, stdout, stderr) => {
      // Clean up input files
      fs.unlink(videoPath, () => {});
      fs.unlink(audioPath, () => {});

      if (error) {
        console.error('FFmpeg error:', stderr);
        return res.status(500).json({ error: 'FFmpeg processing failed', details: stderr });
      }

      // Send output file back
      res.sendFile(outputPath, (err) => {
        // Clean up output file after sending
        fs.unlink(outputPath, () => {});
      });
    });

  } catch (err) {
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
