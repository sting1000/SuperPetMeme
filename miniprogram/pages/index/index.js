Page({
    data: {
        displayImage: '',     // Path to display in UI (original aspect ratio)
        processedImage: '',   // Base64 of the square image
        generatedImage: '',   // Result from backend
        styles: [
            { name: '赛博朋克', value: 'cyberpunk', checked: true },
            { name: '3D 迪士尼', value: '3d-disney', checked: false },
            { name: '油画', value: 'oil-painting', checked: false }
        ],
        selectedStyle: 'cyberpunk',
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

                // 1. Display the image immediately
                this.setData({
                    displayImage: tempFilePath,
                    generatedImage: '' // Clear previous result
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

                // Determine the square size (max of width or height)
                // We limit max size to 1024 to avoid memory issues and ensure performance
                const maxSide = Math.max(imgW, imgH);
                const targetSize = Math.max(1024, maxSide); // Ensure at least 1024 quality or native size

                // Actually, let's fix it to 1024x1024 for consistency with typical API requirements 
                // unless the image is smaller, but DALL-E likes 1024x1024.
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
                    // Scale image to fit within the 1024 format while maintaining aspect ratio
                    const scale = Math.min(size / imgW, size / imgH);
                    const drawW = imgW * scale;
                    const drawH = imgH * scale;
                    const x = (size - drawW) / 2;
                    const y = (size - drawH) / 2;

                    // 3. Draw Image
                    ctx.drawImage(image, x, y, drawW, drawH);

                    // 4. Export to Base64
                    // wx.canvasToTempFilePath does not support direct base64 export easily in all contexts
                    // specific to type="2d", we can use canvas.toDataURL() which is standard web API
                    const base64 = canvas.toDataURL('image/png', 1.0); // Quality 1.0

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

        wx.showToast({ title: '魔法生成中...', icon: 'none' }); // Optional hint
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

                // Check for DALL-E style response (URL) or custom Base64 response
                let result = '';
                if (res.data && res.data.data && res.data.data[0].url) {
                    result = res.data.data[0].url;
                } else if (res.data && res.data.result) {
                    result = res.data.result; // Fallback for other formats
                } else if (typeof res.data === 'string') {
                    result = res.data; // Raw string
                }

                if (!result) {
                    console.error('Backend error:', res);
                    wx.showToast({ title: '生成失败，请重试', icon: 'none' });
                    return;
                }

                // If it looks like Base64 (starts with data:image or is a long string without http)
                if (result.startsWith('data:image') || !result.startsWith('http')) {
                    const fs = wx.getFileSystemManager();
                    // Clean Base64 prefix
                    const base64Data = result.replace(/^data:image\/\w+;base64,/, "");
                    const filePath = wx.env.USER_DATA_PATH + '/result.png';

                    fs.writeFile({
                        filePath: filePath,
                        data: base64Data,
                        encoding: 'base64', // Explicitly 'base64'
                        success: () => {
                            this.setData({ generatedImage: filePath });
                        },
                        fail: (err) => {
                            console.error('Write file failed:', err);
                            wx.showToast({ title: '文件保存失败', icon: 'none' });
                        }
                    });
                } else {
                    // It's a URL (e.g. from DALL-E)
                    this.setData({ generatedImage: result });
                }
            },
            fail: (err) => {
                this.setData({ isLoading: false });
                console.error('Request failed:', err);
                wx.showToast({ title: '网络请求失败', icon: 'none' });
            }
        });
    },

    previewResult() {
        if (this.data.generatedImage) {
            wx.previewImage({
                urls: [this.data.generatedImage]
            });
        }
    },

    saveImage() {
        if (!this.data.generatedImage) return;

        const filePath = this.data.generatedImage;

        // If it's a remote URL, download it first, otherwise save directly
        if (filePath.startsWith('http')) {
            wx.downloadFile({
                url: filePath,
                success: (res) => {
                    wx.saveImageToPhotosAlbum({
                        filePath: res.tempFilePath,
                        success: () => wx.showToast({ title: '保存成功', icon: 'success' }),
                        fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
                    });
                }
            });
        } else {
            // It is already a local file (from base64 write)
            wx.saveImageToPhotosAlbum({
                filePath: filePath,
                success: () => wx.showToast({ title: '保存成功', icon: 'success' }),
                fail: (err) => {
                    console.error('Save failed', err);
                    wx.showToast({ title: '保存失败', icon: 'none' });
                }
            });
        }
    }
});
