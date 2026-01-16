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
        loadingText: '处理中...',

        // === Crop Popup State ===
        showCropPopup: false,        // Whether to show the crop popup
        croppedImages: [],           // Array of 9 cropped image paths
        selectedMap: {},             // Object map: { 0: true, 1: true, ... } for easier template checking
        selectedCount: 0,            // Number of selected images
        isCropping: false            // Whether cropping is in progress
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
            processedImage: '',
            hasGenerated: false
        }, () => {
            this.updateDisplayImage();
        });
    },

    // Open crop popup and start splitting the grid image
    saveImage() {
        const currentStyle = this.data.currentStyle;
        const cachedPath = this.data.styleCache[currentStyle];

        if (!cachedPath) return;

        console.log('[saveImage] Opening crop popup for:', cachedPath);

        // Show loading first to give feedback
        wx.showLoading({ title: '准备中...', mask: true });

        this.setData({
            showCropPopup: true,
            croppedImages: [],
            selectedMap: {},
            selectedCount: 0,
            isCropping: true
        }, () => {
            console.log('[saveImage] Popup setData complete, showCropPopup:', this.data.showCropPopup);
            // Give the popup time to render before starting heavy processing
            setTimeout(() => {
                wx.hideLoading();
                this.splitGridImage(cachedPath);
            }, 300);
        });
    },

    // Close crop popup
    onCloseCropPopup() {
        this.setData({
            showCropPopup: false,
            croppedImages: [],
            selectedMap: {},
            selectedCount: 0
        });
    },

    // Split 3x3 grid image into 9 separate images using Canvas 2D
    // IMPORTANT: Process sequentially to avoid race conditions
    splitGridImage(imagePath) {
        console.log('[splitGridImage] Starting to split:', imagePath);

        const query = wx.createSelectorQuery();
        query.select('#splitCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res[0] || !res[0].node) {
                    console.error('[splitGridImage] Canvas not found');
                    this.setData({ isCropping: false });
                    wx.showToast({ title: 'Canvas 初始化失败', icon: 'none' });
                    return;
                }

                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');
                const image = canvas.createImage();

                // Handle both local file and remote URL
                const loadImage = (src) => {
                    return new Promise((resolve, reject) => {
                        image.onload = () => resolve();
                        image.onerror = (err) => reject(err);
                        image.src = src;
                    });
                };

                // Export single cell with variable size - normalize to square output
                const exportCellVariable = (index, cellInfo, outputSize) => {
                    return new Promise((resolve, reject) => {
                        // Set canvas to output size
                        canvas.width = outputSize;
                        canvas.height = outputSize;

                        // Clear and fill white background
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, outputSize, outputSize);

                        // SAFETY MARGIN: Inflate source area by 10%
                        const inflationW = cellInfo.w * 0.10;
                        const inflationH = cellInfo.h * 0.10;

                        // Safe calculation of source rectangle (CLAMP to image bounds)
                        let rawSx = cellInfo.x - inflationW;
                        let rawSy = cellInfo.y - inflationH;
                        let rawSw = cellInfo.w + inflationW * 2;
                        let rawSh = cellInfo.h + inflationH * 2;

                        const sx = Math.max(0, rawSx);
                        const sy = Math.max(0, rawSy);
                        const right = Math.min(image.width, rawSx + rawSw);
                        const bottom = Math.min(image.height, rawSy + rawSh);
                        const sw = Math.max(0, right - sx);
                        const sh = Math.max(0, bottom - sy);

                        // Calculate aspect-fit scaling based on the SAFELY CLAMPED dimensions
                        // NO PADDING: maximize the image size in the box
                        const padding = 0;
                        const drawAreaSize = outputSize - (padding * 2);

                        const scale = Math.min(drawAreaSize / sw, drawAreaSize / sh);
                        const drawW = sw * scale;
                        const drawH = sh * scale;

                        // Center the content
                        const drawX = (outputSize - drawW) / 2;
                        const drawY = (outputSize - drawH) / 2;

                        // Draw the cell centered in square canvas
                        if (sw > 0 && sh > 0) {
                            ctx.drawImage(
                                image,
                                sx, sy, sw, sh,
                                drawX, drawY, drawW, drawH
                            );
                        }

                        // Export to file
                        wx.canvasToTempFilePath({
                            canvas: canvas,
                            x: 0,
                            y: 0,
                            width: outputSize,
                            height: outputSize,
                            destWidth: outputSize,
                            destHeight: outputSize,
                            fileType: 'png',
                            success: (saveRes) => {
                                resolve(saveRes.tempFilePath);
                            },
                            fail: (err) => {
                                reject(err);
                            }
                        });
                    });
                };

                // Process image: Fast 3x3 split without heavy pixel analysis
                const processImage = async (localPath) => {
                    try {
                        await loadImage(localPath);

                        const fullW = image.width;
                        const fullH = image.height;
                        console.log('[splitGridImage] Full image size:', fullW, 'x', fullH);

                        // Direct 3x3 split based on full image (Trusting AI Prompt)
                        // This is much faster and prevents cutting off edges (ears/tails)
                        const cellW = Math.floor(fullW / 3);
                        const cellH = Math.floor(fullH / 3);
                        const cells = [];
                        for (let row = 0; row < 3; row++) {
                            for (let col = 0; col < 3; col++) {
                                cells.push({
                                    x: col * cellW,
                                    y: row * cellH,
                                    w: cellW,
                                    h: cellH
                                });
                            }
                        }

                        // Determine output size
                        const avgCellSize = Math.max(cellW, cellH);
                        // Ensure good resolution but prevent HUGE canves that stall UI
                        const outputSize = Math.max(300, Math.min(avgCellSize, 600));
                        console.log('[splitGridImage] Output size:', outputSize);

                        // Initial UI update
                        const initialCropped = new Array(9).fill('');
                        this.setData({
                            croppedImages: initialCropped,
                            isCropping: true,
                            showCropPopup: true,
                            selectedMap: {},
                            selectedCount: 0
                        });

                        // Short wait for UI render
                        await new Promise(r => setTimeout(r, 200));

                        const croppedPaths = [...initialCropped];

                        // Process each cell SEQUENTIALLY
                        for (let i = 0; i < 9; i++) {
                            try {
                                const path = await exportCellVariable(i, cells[i], outputSize);
                                croppedPaths[i] = path;

                                // Update UI
                                const updateKey = `croppedImages[${i}]`;
                                this.setData({ [updateKey]: path });

                                // Minimal yield to keep UI responsive but fast
                                await new Promise(resolve => setTimeout(resolve, 10));

                            } catch (err) {
                                console.error(`[splitGridImage] Error processing cell ${i}:`, err);
                            }
                        }

                        console.log('[splitGridImage] All 9 cells cropped successfully');

                        // Select all by default
                        const allSelected = {};
                        for (let i = 0; i < 9; i++) allSelected[i] = true;

                        this.setData({
                            isCropping: false,
                            selectedMap: allSelected,
                            selectedCount: 9
                        }, () => {
                            wx.hideLoading();
                        });

                    } catch (err) {
                        console.error('[splitGridImage] Process error:', err);
                        wx.hideLoading();
                        wx.showToast({
                            title: '切图失败',
                            icon: 'none'
                        });
                        this.setData({ isCropping: false });
                    }
                };

                // Check if remote URL or local file
                if (imagePath.startsWith('http')) {
                    wx.downloadFile({
                        url: imagePath,
                        success: (downloadRes) => {
                            processImage(downloadRes.tempFilePath);
                        },
                        fail: (err) => {
                            console.error('[splitGridImage] Download failed:', err);
                            this.setData({ isCropping: false });
                            wx.showToast({ title: '下载图片失败', icon: 'none' });
                        }
                    });
                } else {
                    processImage(imagePath);
                }
            });
    },

    // Toggle selection of an image
    onToggleImageSelection(e) {
        const index = e.currentTarget.dataset.index;
        const selectedMap = { ...this.data.selectedMap };

        if (selectedMap[index]) {
            delete selectedMap[index];
        } else {
            selectedMap[index] = true;
        }

        const selectedCount = Object.keys(selectedMap).length;
        this.setData({ selectedMap, selectedCount });
    },

    // Save the full AI-generated grid image
    onSaveFullImage() {
        const currentStyle = this.data.currentStyle;
        const cachedPath = this.data.styleCache[currentStyle];

        if (!cachedPath) {
            wx.showToast({ title: '没有找到图片', icon: 'none' });
            return;
        }

        wx.showLoading({ title: '保存中...', mask: true });

        // Handle remote URL vs local file
        if (cachedPath.startsWith('http')) {
            wx.downloadFile({
                url: cachedPath,
                success: (res) => {
                    wx.saveImageToPhotosAlbum({
                        filePath: res.tempFilePath,
                        success: () => {
                            wx.hideLoading();
                            wx.showToast({ title: '大图已保存', icon: 'success' });
                        },
                        fail: (err) => {
                            wx.hideLoading();
                            this.handleSaveError(err);
                        }
                    });
                },
                fail: () => {
                    wx.hideLoading();
                    wx.showToast({ title: '下载失败', icon: 'none' });
                }
            });
        } else {
            wx.saveImageToPhotosAlbum({
                filePath: cachedPath,
                success: () => {
                    wx.hideLoading();
                    wx.showToast({ title: '大图已保存', icon: 'success' });
                },
                fail: (err) => {
                    wx.hideLoading();
                    this.handleSaveError(err);
                }
            });
        }
    },

    // Handle save permission errors
    handleSaveError(err) {
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
    },

    // Select all images
    onSelectAll() {
        this.setData({
            selectedMap: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true },
            selectedCount: 9
        });
    },

    // Save selected images to album
    onSaveSelectedImages() {
        const { croppedImages, selectedMap } = this.data;
        const selectedIndices = Object.keys(selectedMap).map(Number);

        if (selectedIndices.length === 0) {
            wx.showToast({ title: '请选择要保存的图片', icon: 'none' });
            return;
        }

        let savedCount = 0;
        let failedCount = 0;
        const total = selectedIndices.length;

        wx.showLoading({ title: `保存中 (0/${total})`, mask: true });

        selectedIndices.forEach((index) => {
            const filePath = croppedImages[index];
            if (!filePath) {
                failedCount++;
                return;
            }

            wx.saveImageToPhotosAlbum({
                filePath: filePath,
                success: () => {
                    savedCount++;
                    wx.showLoading({ title: `保存中 (${savedCount}/${total})`, mask: true });

                    if (savedCount + failedCount === total) {
                        wx.hideLoading();
                        this.onCloseCropPopup();
                        if (failedCount > 0) {
                            wx.showToast({ title: `成功${savedCount}张,失败${failedCount}张`, icon: 'none' });
                        } else {
                            wx.showToast({ title: `已保存${savedCount}张图片`, icon: 'success' });
                        }
                    }
                },
                fail: (err) => {
                    console.error('[onSaveSelectedImages] Save failed for index', index, err);
                    failedCount++;

                    if (savedCount + failedCount === total) {
                        wx.hideLoading();

                        if (err.errMsg && err.errMsg.includes('auth deny')) {
                            wx.showModal({
                                title: '权限提示',
                                content: '保存图片需要访问相册，请在设置中开启权限',
                                success: (res) => {
                                    if (res.confirm) wx.openSetting();
                                }
                            });
                        } else if (failedCount === total) {
                            wx.showToast({ title: '保存失败', icon: 'none' });
                        } else {
                            wx.showToast({ title: `成功${savedCount}张,失败${failedCount}张`, icon: 'none' });
                        }
                    }
                }
            });
        });
    }
});
