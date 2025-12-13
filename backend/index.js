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

    // Extract style from the frontend prompt "A cute pet in [style] style"
    let rawStyle = "hand-drawn";
    const styleMatch = (stylePrompt || "").match(/in (.*?) style/i);
    if (styleMatch && styleMatch[1]) {
      rawStyle = styleMatch[1];
    }

    // Map frontend values to descriptive prompt keywords
    const styleMap = {
      'hand-drawn': 'warm colored pencil hand-drawn',
      'ghibli': 'Studio Ghibli detailed anime',
      'doodle': 'Japanese sketchy doodle style, simple black outlines, flat color, no shading, minimal vector art'
    };

    // Default to LINE style if unknown, otherwise use the mapped detailed description
    const effectiveStyle = styleMap[rawStyle] || `${rawStyle} LINE sticker`;

    // Advanced Prompt Template requested by User
    // Changes: 3x3 layout (9 items), No Text, Specific Style Mapping
    const textPrompt = `为我生成图中角色的绘制 Q 版的，LINE 风格的半身像表情包。
风格要求：${effectiveStyle}。
布局要求：3x3 九宫格布局 (9 unique expressions)。
核心需求：不要包含任何文字、气泡或标点符号 (No text, no speech bubbles)。专注于角色表情生动性。
动作参考：开心、疑惑、生气、大笑、哭泣、点赞、惊讶、睡觉、爱心。
生成的图片需为 4K 分辨率 16:9 背景留白。`;

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
