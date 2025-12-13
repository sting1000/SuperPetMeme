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

    // Advanced Prompt Template - Universal Subject Recognition
    // AI will auto-detect subject (human, pet, or any character) and maintain consistency
    const textPrompt = `【任务】将图中主体转绘为 Q 版 LINE 风格表情包。

【主体识别】自动分析图片中的主角（可以是人物、宠物、或任何角色），提取其核心视觉特征。

【一致性要求 - 极其重要】
- 必须在所有 9 格中保持主体的关键特征高度一致
- 人物：保持发型、发色、五官比例、肤色、标志性配饰
- 动物：保持毛色、花纹、耳朵形状、体型特征、独特标记
- 确保每一格都能被识别为同一个角色

【风格要求】${effectiveStyle}

【布局要求】3x3 九宫格布局，共 9 个独立表情

【内容规范】
- 绝对禁止任何文字、气泡、标点符号 (Strictly NO text, NO speech bubbles)
- 专注于表情和肢体语言的表现力

【表情场景参考 - 涵盖日常聊天 & Meme 文化】
1. 开心挥手 - "Hi~打招呼"
2. 委屈巴巴 - 眼泪汪汪求关注
3. 暴怒生气 - 青筋暴起
4. 笑到捶地 - 爆笑停不下来
5. 比心/爱心眼 - "爱你哟"
6. 点赞/OK - 表示认可
7. 震惊吃瓜 - 惊讶得合不拢嘴
8. 困觉摸鱼 - 打瞌睡/躺平
9. 无语翻白眼 - "我真的会谢"

【输出规格】4K 分辨率，16:9 画布，白色/透明背景留白。`;

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
