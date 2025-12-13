Page({
    data: {
        displayImage: '',     // The Hero Image (can be original or result)
        processedImage: '',   // Base64 of the square original image (for API)
        isGenerated: false,   // State: true if showing result
        styles: [
            { name: '治愈手绘', value: 'hand-drawn', checked: true },
            { name: '宫崎骏风', value: 'ghibli', checked: false },
            { name: '日系涂鸦', value: 'doodle', checked: false }
        ],
        selectedStyle: 'hand-drawn',
        isLoading: false,
        loadingText: '处理中...'
    },

    onLoad() {
        // Determine the selected style initially
        const style = this.data.styles.find(s => s.checked);
        if (style) {
            this.setData({ selectedStyle: style.value });
        }
    },

    onHeroTap() {
        // Always trigger media selection to upload/replace
        this.chooseImage();
    },

    onStyleChange(e) {
        this.setData({
            selectedStyle: e.detail.value
        });
    },

    chooseImage() {
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFilePath = res.tempFiles[0].tempFilePath;

                // 1. Display the image immediately AND Reset State
                this.setData({
                    displayImage: tempFilePath,
                    isGenerated: false,   // Reset generated state
                    processedImage: ''    // Clear old processed data until ready
                });

                // 2. Get Image Info to guide Canvas resizing
                wx.getImageInfo({
                    src: tempFilePath,
                    success: (imgInfo) => {
                        this.processImageToSquare(tempFilePath, imgInfo.width, imgInfo.height);
                    },
                    fail: (err) => {
                        console.error('Failed to get image info', err);
                        wx.showToast({ title: '无法读取图片', icon: 'none' });
                    }
                });
            }
        });
    },

    processImageToSquare(path, imgW, imgH) {
        this.setData({ isLoading: true, loadingText: '正在给主子拍照...' });

        // Create SelectorQuery to get the canvas node
        const query = wx.createSelectorQuery();
        query.select('#processCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res[0] || !res[0].node) {
                    this.setData({ isLoading: false });
                    wx.showToast({ title: 'Canvas 初始化失败', icon: 'none' });
                    return;
                }

                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');

                // Standardize to 1024x1024
                const size = 1024;

                // Set canvas physical size
                canvas.width = size;
                canvas.height = size;

                // Create an Image object for Canvas
                const image = canvas.createImage();
                image.src = path;

                image.onload = () => {
                    // 1. Fill White Background
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, size, size);

                    // 2. Calculate Center Position
                    const scale = Math.min(size / imgW, size / imgH);
                    const drawW = imgW * scale;
                    const drawH = imgH * scale;
                    const x = (size - drawW) / 2;
                    const y = (size - drawH) / 2;

                    // 3. Draw Image
                    ctx.drawImage(image, x, y, drawW, drawH);

                    // 4. Export to Base64
                    const base64 = canvas.toDataURL('image/png', 1.0);

                    this.setData({ processedImage: base64, isLoading: false });
                    wx.showToast({ title: '准备就绪', icon: 'success' });
                };

                image.onerror = (err) => {
                    console.error('Canvas image load failed', err);
                    this.setData({ isLoading: false });
                    wx.showToast({ title: '图片加载失败', icon: 'none' });
                };
            });
    },

    generateMeme() {
        if (!this.data.processedImage) {
            wx.showToast({ title: '请先上传图片', icon: 'none' });
            return;
        }

        this.setData({ isLoading: true, loadingText: 'AI 正在疯狂绘图中...' });

        wx.request({
            url: 'http://localhost:3000/api/process-image',
            method: 'POST',
            data: {
                imageBase64: this.data.processedImage,
                stylePrompt: `A cute pet in ${this.data.selectedStyle} style`
            },
            header: {
                'content-type': 'application/json'
            },
            success: (res) => {
                this.setData({ isLoading: false });
                console.log('Backend response:', res.data);

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
                    console.error('Backend error:', res);
                    wx.showToast({ title: '生成失败，请重试', icon: 'none' });
                    return;
                }

                // Handle Base64 or URL
                if (result.startsWith('data:image') || !result.startsWith('http')) {
                    const fs = wx.getFileSystemManager();
                    const base64Data = result.replace(/^data:image\/\w+;base64,/, "");
                    const filePath = wx.env.USER_DATA_PATH + '/result.png';

                    fs.writeFile({
                        filePath: filePath,
                        data: base64Data,
                        encoding: 'base64',
                        success: () => {
                            this.setData({
                                displayImage: filePath + '?t=' + new Date().getTime(), // Swap Hero Image with cache busting
                                isGenerated: true      // Mark as generated
                            });
                        },
                        fail: (err) => {
                            console.error('Write file failed:', err);
                            wx.showToast({ title: '文件保存失败', icon: 'none' });
                        }
                    });
                } else {
                    // It's a URL
                    this.setData({
                        displayImage: result, // Swap Hero Image
                        isGenerated: true    // Mark as generated
                    });
                }
            },
            fail: (err) => {
                this.setData({ isLoading: false });
                console.error('Request failed:', err);
                wx.showToast({ title: '网络请求失败', icon: 'none' });
            }
        });
    },

    saveImage() {
        if (!this.data.isGenerated || !this.data.displayImage) return;

        // Strip the query parameter we added for cache busting
        const filePath = this.data.displayImage.split('?')[0];

        // Check if it is the local generated file
        // In DevTools, USER_DATA_PATH (http://usr) looks like a URL, so we must check this first
        // or ensure we don't treat it as a remote download.
        if (filePath.includes(wx.env.USER_DATA_PATH) || !filePath.startsWith('http')) {
            // Local file (either temp file or user data file)
            wx.saveImageToPhotosAlbum({
                filePath: filePath,
                success: () => wx.showToast({ title: '保存成功', icon: 'success' }),
                fail: (err) => {
                    console.error('Save failed', err);
                    // Check for permission issue
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
            // Truly remote URL (e.g. from a legitimate http server)
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
                    console.error('Download failed', err);
                    wx.showToast({ title: '下载失败', icon: 'none' });
                }
            });
        }
    }
});
