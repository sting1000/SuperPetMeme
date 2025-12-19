Page({
    data: {
        // === Core State ===
        originalImage: '',      // User's uploaded original image temp path
        processedImage: '',     // Base64 of square image (for API)
        currentStyle: 'hand-drawn',  // Currently selected style key
        styleCache: {},         // Cache: { 'hand-drawn': 'path', 'ghibli': 'path', ... }

        // === Computed Display State ===
        displayImage: '',       // Current image to display (computed from cache/original)
        hasGenerated: false,    // Whether current style has generated result

        // === UI State ===
        styles: [
            { name: '治愈手绘', value: 'hand-drawn' },
            { name: '宫崎骏风', value: 'ghibli' },
            { name: '日系涂鸦', value: 'doodle' }
        ],
        isGenerating: false,
        loadingText: '处理中...'
    },

    onLoad() {
        // No special initialization needed
    },

    // === Core: Update Display Image ===
    // Call this whenever originalImage, currentStyle, or styleCache changes
    updateDisplayImage() {
        const { styleCache, currentStyle, originalImage } = this.data;
        const cachedImage = styleCache[currentStyle];
        const displayImage = cachedImage || originalImage || '';
        const hasGenerated = !!cachedImage;

        console.log('[updateDisplayImage]', {
            currentStyle,
            cachedImage: cachedImage ? 'exists' : 'none',
            originalImage: originalImage ? 'exists' : 'none',
            displayImage: displayImage ? 'set' : 'empty'
        });

        this.setData({ displayImage, hasGenerated });
    },

    // === Event Handlers ===

    // Hero area tap - only trigger upload if no image yet
    onHeroTap() {
        if (!this.data.originalImage) {
            this.chooseImage();
        }
    },

    // Floating swap button tap
    onSwapTap() {
        this.chooseImage();
    },

    // Style tag tap - switch style, update display (NO auto-generation)
    onStyleTap(e) {
        const style = e.currentTarget.dataset.style;
        if (style === this.data.currentStyle) return;
        if (this.data.isGenerating) return;

        console.log('[onStyleTap] Switching to style:', style);

        // Update current style and display image
        // Do NOT auto-trigger generation - user must click generate button
        this.setData({ currentStyle: style }, () => {
            this.updateDisplayImage();

            if (this.data.styleCache[style]) {
                console.log('[onStyleTap] Cache hit, instant display');
            } else {
                console.log('[onStyleTap] Cache miss, waiting for user to click generate');
            }
        });
    },

    // Choose and upload new image
    chooseImage() {
        if (this.data.isGenerating) return;

        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFilePath = res.tempFiles[0].tempFilePath;
                console.log('[chooseImage] Selected:', tempFilePath);

                // ⚠️ Critical: Clear cache when uploading NEW image
                this.setData({
                    originalImage: tempFilePath,
                    displayImage: tempFilePath,  // Immediately show the new image
                    styleCache: {},              // Reset cache - old generated images are stale
                    processedImage: '',          // Clear until processing complete
                    hasGenerated: false
                });

                // Get image info for canvas processing
                wx.getImageInfo({
                    src: tempFilePath,
                    success: (imgInfo) => {
                        this.processImageToSquare(tempFilePath, imgInfo.width, imgInfo.height);
                    },
                    fail: (err) => {
                        console.error('[chooseImage] Failed to get image info', err);
                        wx.showToast({ title: '无法读取图片', icon: 'none' });
                    }
                });
            }
        });
    },

    // Process image to 1024x1024 square with white padding
    processImageToSquare(path, imgW, imgH) {
        this.setData({ isGenerating: true, loadingText: '正在给主子拍照...' });

        const query = wx.createSelectorQuery();
        query.select('#processCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res[0] || !res[0].node) {
                    this.setData({ isGenerating: false });
                    wx.showToast({ title: 'Canvas 初始化失败', icon: 'none' });
                    return;
                }

                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');
                const size = 1024;

                canvas.width = size;
                canvas.height = size;

                const image = canvas.createImage();
                image.src = path;

                image.onload = () => {
                    // Fill white background
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, size, size);

                    // Calculate center position
                    const scale = Math.min(size / imgW, size / imgH);
                    const drawW = imgW * scale;
                    const drawH = imgH * scale;
                    const x = (size - drawW) / 2;
                    const y = (size - drawH) / 2;

                    // Draw image
                    ctx.drawImage(image, x, y, drawW, drawH);

                    // Export to Base64
                    const base64 = canvas.toDataURL('image/png', 1.0);

                    this.setData({ processedImage: base64, isGenerating: false });
                    console.log('[processImageToSquare] Complete, base64 length:', base64.length);
                    wx.showToast({ title: '准备就绪', icon: 'success' });
                };

                image.onerror = (err) => {
                    console.error('[processImageToSquare] Canvas image load failed', err);
                    this.setData({ isGenerating: false });
                    wx.showToast({ title: '图片加载失败', icon: 'none' });
                };
            });
    },

    // Generate meme with current style
    generateMeme() {
        if (!this.data.processedImage) {
            wx.showToast({ title: '请先上传图片', icon: 'none' });
            return;
        }
        if (this.data.isGenerating) return;

        const currentStyle = this.data.currentStyle;
        console.log('[generateMeme] Starting for style:', currentStyle);

        this.setData({ isGenerating: true, loadingText: 'AI 正在疯狂绘图中...' });

        wx.request({
            url: 'http://localhost:3000/api/process-image',
            method: 'POST',
            data: {
                imageBase64: this.data.processedImage,
                stylePrompt: `A cute pet in ${currentStyle} style`
            },
            header: {
                'content-type': 'application/json'
            },
            success: (res) => {
                console.log('[generateMeme] Backend response:', res.data);

                let result = '';
                if (res.data && res.data.url) {
                    result = res.data.url;
                } else if (res.data && res.data.data && res.data.data[0].url) {
                    result = res.data.data[0].url;
                } else if (res.data && res.data.result) {
                    result = res.data.result;
                } else if (typeof res.data === 'string') {
                    result = res.data;
                }

                if (!result) {
                    console.error('[generateMeme] No result in response:', res);
                    this.setData({ isGenerating: false });
                    wx.showToast({ title: '生成失败，请重试', icon: 'none' });
                    return;
                }

                // Handle Base64 or URL
                if (result.startsWith('data:image') || !result.startsWith('http')) {
                    const fs = wx.getFileSystemManager();
                    const base64Data = result.replace(/^data:image\/\w+;base64,/, "");
                    const filePath = `${wx.env.USER_DATA_PATH}/result_${currentStyle}_${Date.now()}.png`;

                    fs.writeFile({
                        filePath: filePath,
                        data: base64Data,
                        encoding: 'base64',
                        success: () => {
                            console.log('[generateMeme] Saved to:', filePath);
                            this.saveToCache(currentStyle, filePath);
                        },
                        fail: (err) => {
                            console.error('[generateMeme] Write file failed:', err);
                            this.setData({ isGenerating: false });
                            wx.showToast({ title: '文件保存失败', icon: 'none' });
                        }
                    });
                } else {
                    // It's a URL - write directly to cache
                    console.log('[generateMeme] Using URL:', result);
                    this.saveToCache(currentStyle, result);
                }
            },
            fail: (err) => {
                this.setData({ isGenerating: false });
                console.error('[generateMeme] Request failed:', err);
                wx.showToast({ title: '网络请求失败', icon: 'none' });
            }
        });
    },

    // Helper: Save result to cache and update display
    saveToCache(style, imagePath) {
        const newCache = { ...this.data.styleCache };
        newCache[style] = imagePath;

        this.setData({
            styleCache: newCache,
            isGenerating: false
        }, () => {
            // Update display if this is still the current style
            if (this.data.currentStyle === style) {
                this.updateDisplayImage();
            }
            wx.showToast({ title: '生成成功', icon: 'success' });
        });
    },

    // Restart: Clear current style result
    onRestartTap() {
        const currentStyle = this.data.currentStyle;
        const newCache = { ...this.data.styleCache };
        delete newCache[currentStyle]; // Remove from cache

        this.setData({
            styleCache: newCache,
            processedImage: '', // Prepare for re-upload if needed? Actually, we might keep the original processed square image.
            // Wait, the requirement says "Click clear result, back to initial state".
            // Initial state means showing the original image and the "Start" button.
            hasGenerated: false // This will show the "Start" button
        }, () => {
            if (this.data.processedImage) {
                // If we have the source image processed, we just need to re-enable the button
                // But wait, `processedImage` is the input to the API (the square crop).
                // It should be preserved if we want to regenerate without re-uploading.
                // The `hasGenerated` flag controls the button state.
                // updateDisplayImage will see no cache and show originalImage.
            }
            this.updateDisplayImage();
        });
    },

    // Save current displayed image to album
    saveImage() {
        const currentStyle = this.data.currentStyle;
        const cachedPath = this.data.styleCache[currentStyle];

        if (!cachedPath) return;

        // Strip any query parameters
        const filePath = cachedPath.split('?')[0];

        if (filePath.includes(wx.env.USER_DATA_PATH) || !filePath.startsWith('http')) {
            // Local file
            wx.saveImageToPhotosAlbum({
                filePath: filePath,
                success: () => wx.showToast({ title: '保存成功', icon: 'success' }),
                fail: (err) => {
                    console.error('[saveImage] Save failed', err);
                    if (err.errMsg && err.errMsg.includes('auth deny')) {
                        wx.showModal({
                            title: '权限提示',
                            content: '保存图片需要访问相册，请在设置中开启权限',
                            success: (res) => {
                                if (res.confirm) wx.openSetting();
                            }
                        });
                    } else {
                        wx.showToast({ title: '保存失败', icon: 'none' });
                    }
                }
            });
        } else {
            // Remote URL
            wx.downloadFile({
                url: filePath,
                success: (res) => {
                    wx.saveImageToPhotosAlbum({
                        filePath: res.tempFilePath,
                        success: () => wx.showToast({ title: '保存成功', icon: 'success' }),
                        fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
                    });
                },
                fail: (err) => {
                    console.error('[saveImage] Download failed', err);
                    wx.showToast({ title: '下载失败', icon: 'none' });
                }
            });
        }
    }
});
