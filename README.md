# 萌宠表情包工坊 (Pet Meme Maker)

这是一个简单有趣的微信小程序，用户可以上传宠物照片，通过后端调用 AI 服务自动生成可爱的表情包。

## 技术栈

- **Frontend**: WeChat MiniProgram (Native)
- **Backend**: Node.js, Express, Axios
- **AI Service**: Nano Banana API

## 快速开始 (Quick Start)

### 后端启动

1. 进入后端目录：
   ```bash
   cd backend
   ```
2. 安装依赖：
   ```bash
   npm install
   ```
3. 配置环境变变：
   复制 `.env.example` 为 `.env`，并填入你的 Nano Banana API Key。
   ```bash
   cp .env.example .env
   # 编辑 .env 文件
   ```
4. 启动服务：
   ```bash
   node index.js
   ```
   服务默认运行在 `http://localhost:3000`。

### 前端启动

1. 打开 **微信开发者工具**。
2. 点击导入项目，选择 `miniprogram` 目录。
3. 在详情设置中，勾选 **“不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书”**。
4. 编译并运行，即可体验。

## 注意事项

- 请确保本地开发时后端服务（`localhost:3000`）已开启，并且手机预览时手机与电脑处于同一局域网（或使用真机调试/内网穿透）。
