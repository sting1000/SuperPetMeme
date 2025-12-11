const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: 'https://aicanapi.com/v1'
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow all origins
app.use(express.json({ limit: '50mb' })); // Support large payloads for Base64 images

// Routes
// POST /api/process-image
app.post('/api/process-image', async (req, res) => {
  try {
    const { imageBase64, stylePrompt } = req.body;

    const textPrompt = stylePrompt || "A cute pet meme";

    // Ensure the image data has the correct prefix
    let imageUrl = imageBase64;
    // Simple check to ensure data URI scheme is present
    if (!imageUrl.trim().startsWith('data:')) {
      // Defaulting to jpeg if missing, though ideally frontend sends it
      imageUrl = `data:image/jpeg;base64,${imageUrl}`;
    }

    console.log(`Sending request to Gemini 2.5 Flash Image...`);

    const response = await client.chat.completions.create({
      model: "gemini-2.5-flash-image",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: textPrompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]
    });

    const content = response.choices[0].message.content;
    console.log('Gemini Response Content:', content);

    // Extract URL (HTTPS or Data URI) from the content
    // Supports markdown format ![image](url) or raw URL
    const urlMatch = content.match(/(https:\/\/[^\s\)]+|data:image\/[a-zA-Z]+;base64,[^\s\)]+)/);

    if (urlMatch && urlMatch[0]) {
      res.json({ url: urlMatch[0] });
    } else {
      // Log truncated content for debugging to avoid massive logs
      console.error('Failed to extract URL from content:', content.substring(0, 200) + '...');
      res.status(500).json({ error: 'Failed to generate image URL' });
    }

  } catch (error) {
    console.error('Error processing image:', error.message);
    if (error.response) {
      console.error('API Error Data:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
