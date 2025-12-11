const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow all origins
app.use(express.json({ limit: '50mb' })); // Support large payloads for Base64 images

// Routes
// POST /api/process-image
app.post('/api/process-image', async (req, res) => {
  try {
    const { imageBase64, stylePrompt } = req.body;

    // Note: The user requested image processing, but the available externally compatible model (DALL-E 3) 
    // strictly supports Text-to-Image generation via this API endpoint.
    // The Input Image (imageBase64) acts as context but cannot be directly fed into DALL-E 3 for Style Transfer here.
    // We will use the 'stylePrompt' as the generation prompt.

    const textPrompt = stylePrompt || "A cute pet meme";

    // OpenAI-compatible DALL-E 3 Payload
    const payload = {
      model: "dall-e-3",
      prompt: textPrompt,
      n: 1,
      size: "1024x1024"
    };

    const apiUrl = 'https://aicanapi.com/v1/images/generations';

    console.log(`Sending request to ${apiUrl} with model ${payload.model}`);

    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_KEY}`
      }
    });

    // Forward the data back
    res.json(response.data);

  } catch (error) {
    console.error('Error processing image:', error.message);
    if (error.response) {
      console.error('External API Error Data:', JSON.stringify(error.response.data, null, 2));
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
