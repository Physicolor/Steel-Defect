// 钢材缺陷检测系统 - 图片检测页面脚本
// 功能：图片上传 / 多图切换 / 缺陷检测 / AI分析
(() => {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const detectBtn = document.getElementById('detectBtn');
    const loading = document.getElementById('loading');
    const statusText = document.getElementById('statusText');
    const resultContent = document.getElementById('resultContent');
    const modelSelect = document.getElementById('modelSelect');
    const applyModelBtn = document.getElementById('applyModelBtn');
    const modelInfo = document.getElementById('modelInfo');

    // 图片显示相关
    const imagesContainer = document.getElementById('imagesContainer');
    const originalImageDisplay = document.getElementById('originalImageDisplay');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const annotatedImageWrapper = document.getElementById('annotatedImageWrapper');
    const annotatedImageDisplay = document.getElementById('annotatedImageDisplay');
    const heatmapImageWrapper = document.getElementById('heatmapImageWrapper');
    const heatmapImageDisplay = document.getElementById('heatmapImageDisplay');
    const detectionDataSection = document.getElementById('detectionDataSection');

    // AI分析相关元素
    const analyzeWithLLMBtn = document.getElementById('analyzeWithLLMBtn');
    const aiAnalysisSection = document.getElementById('aiAnalysisSection');
    const aiAnalysisResult = document.getElementById('aiAnalysisResult');
    const aiAnalysisLoading = document.getElementById('aiAnalysisLoading');
    const aiAnalysisContent = document.getElementById('aiAnalysisContent');
    const closeAIResult = document.getElementById('closeAIResult');
    const llmStatusIndicator = document.getElementById('llmStatusIndicator');
    const emptyState = document.getElementById('emptyState');

    let selectedFile = null;
    let lastResult = null;
    let llmServiceReady = false;
    let uploadedFiles = [];
    let currentImageIndex = 0;
    let detectionResults = {};

    // 从 sessionStorage 恢复状态
    function restoreState() {
        const savedResult = sessionStorage.getItem('detect_lastResult');

        if (savedResult) {
            lastResult = JSON.parse(savedResult);
            if (lastResult.image_base64 && lastResult.original_image_base64) {
                originalImageDisplay.src = `data:image/jpeg;base64,${lastResult.original_image_base64}`;
                annotatedImageDisplay.src = `data:image/jpeg;base64,${lastResult.image_base64}`;
                annotatedImageWrapper.hidden = false;

                if (lastResult.heatmap_base64) {
                    heatmapImageDisplay.src = `data:image/jpeg;base64,${lastResult.heatmap_base64}`;
                    heatmapImageWrapper.hidden = false;
                }

                renderResult(lastResult);
                detectionDataSection.hidden = false;
                emptyState.style.display = 'none';
                detectBtn.hidden = true;

                uploadZone.hidden = true;
                imagesContainer.hidden = false;

                aiAnalysisSection.hidden = false;
            }
        }
    }

    function saveState() {
        if (selectedFile) {
            sessionStorage.setItem('detect_selectedFile', selectedFile.name);
        }
        if (lastResult) {
            sessionStorage.setItem('detect_lastResult', JSON.stringify(lastResult));
        }
    }

    function showOriginalImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            originalImageDisplay.src = e.target.result;
            imagesContainer.hidden = false;
            uploadZone.hidden = true;
            annotatedImageWrapper.hidden = true;
            heatmapImageWrapper.hidden = true;
            detectionDataSection.hidden = true;
            detectBtn.hidden = false;
        };
        reader.readAsDataURL(file);
    }

    function clearImage() {
        selectedFile = null;
        lastResult = null;
        originalImageDisplay.src = '';
        annotatedImageDisplay.src = '';
        heatmapImageDisplay.src = '';
        imagesContainer.hidden = true;
        uploadZone.hidden = false;
        detectBtn.hidden = true;

        detectionDataSection.hidden = true;
        statusText.hidden = true;
        aiAnalysisSection.hidden = true;

        resultContent.innerHTML = '';
        aiAnalysisContent.innerHTML = '';
        aiAnalysisResult.style.display = 'none';
        emptyState.style.display = 'flex';

        sessionStorage.removeItem('detect_selectedFile');
        sessionStorage.removeItem('detect_lastResult');

        showStatus('已清除,请重新上传图片', 'info');
    }

    clearImageBtn.addEventListener('click', clearImage);

    function updateModelInfo(fileName, modelType, device) {
        modelInfo.innerHTML = `
            <div><strong>当前模型：</strong>${fileName}</div>
            <div class="muted" style="margin-top: 2px;">类型: ${modelType.toUpperCase()} | 设备: ${device}</div>
        `;
    }

    async function getModelPath(modelType) {
        try {
            const res = await fetch('/model_status');
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || '获取模型状态失败');
            }

            if (modelType === 'yolo') {
                return data.model.weights_path;
            } else if (modelType === 'unet') {
                return data.model.unet_weights_path;
            }

            return null;
        } catch (err) {
            console.error('获取模型路径失败:', err);
            return null;
        }
    }

    modelSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        const customModelPathContainer = document.getElementById('customModelPathContainer');

        if (selectedValue === 'custom') {
            customModelPathContainer.style.display = 'block';
        } else {
            customModelPathContainer.style.display = 'none';
        }
    });

    async function applyModel(modelType) {
        if (!modelType) {
            showStatus('请先选择模型类型', 'error');
            return;
        }

        applyModelBtn.disabled = true;
        applyModelBtn.textContent = '切换中...';
        modelInfo.innerHTML = '<span style="color: var(--text-muted);">⏳ 正在切换模型...</span>';

        try {
            let weightsPath = '';

            if (modelType === 'custom') {
                const customPath = document.getElementById('customModelPath').value.trim();
                if (!customPath) {
                    showStatus('请输入自定义模型路径', 'error');
                    return;
                }
                weightsPath = customPath;
            } else {
                weightsPath = await getModelPath(modelType);
                if (!weightsPath) {
                    throw new Error('无法获取模型路径');
                }
            }

            const endpoint = '/set_model_weights';
            const paramName = 'weights_path';

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [paramName]: weightsPath })
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || '模型切换失败');
            }

            const rawPath = data.weights_path || data.unet_weights_path;
            const fileName = rawPath ? rawPath.split(/[\\/]/).pop() : '未知模型';
            const typeLabel = modelType === 'yolo' ? '(YOLO)' : modelType === 'unet' ? '(UNet)' : '';

            modelInfo.innerHTML = `
                <div style="color: var(--success);"><strong>✅ 切换成功</strong></div>
                <div><strong>当前模型：</strong>${fileName} <span class="muted">${typeLabel}</span></div>
                <div class="muted" style="margin-top: 2px;">类别数: ${data.class_count || 0}</div>
            `;

            if (modelType === 'yolo') {
                modelSelect.selectedIndex = 0;
            } else if (modelType === 'unet') {
                modelSelect.selectedIndex = 1;
            } else if (modelType === 'custom') {
                modelSelect.selectedIndex = 2;
            }

            showStatus('模型切换成功', 'success');
        } catch (err) {
            modelInfo.innerHTML = '<span style="color: var(--danger);">❌ 切换失败: ' + err.message + '</span>';
            showStatus('模型切换失败: ' + err.message, 'error');
        } finally {
            applyModelBtn.disabled = false;
            applyModelBtn.textContent = '✅ 应用模型';
        }
    }

    applyModelBtn.addEventListener('click', async () => {
        await applyModel(modelSelect.value);
    });

    // 上传事件
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFiles(e.target.files);
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });

    function handleFiles(files) {
        uploadedFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (uploadedFiles.length === 0) {
            showStatus('请上传图片文件', 'error');
            return;
        }

        statusText.hidden = true;
        currentImageIndex = 0;
        detectionResults = {};

        const imageLabel = document.getElementById('imageLabel');
        if (imageLabel) {
            imageLabel.textContent = `已导入 ${uploadedFiles.length} 张图片`;
        }

        showOriginalImage(uploadedFiles[0]);
        updateNavArrows();
        saveState();
    }

    function updateNavArrows() {
        const prevBtn = document.getElementById('prevImageBtn');
        const nextBtn = document.getElementById('nextImageBtn');
        if (uploadedFiles.length > 1) {
            prevBtn.hidden = false;
            nextBtn.hidden = false;
        } else {
            prevBtn.hidden = true;
            nextBtn.hidden = true;
        }
    }

    document.getElementById('prevImageBtn').addEventListener('click', () => {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            showCurrentImage();
        }
    });

    document.getElementById('nextImageBtn').addEventListener('click', () => {
        if (currentImageIndex < uploadedFiles.length - 1) {
            currentImageIndex++;
            showCurrentImage();
        }
    });

    function showCurrentImage() {
        const file = uploadedFiles[currentImageIndex];
        showOriginalImage(file);

        if (detectionResults[currentImageIndex]) {
            const data = detectionResults[currentImageIndex];
            annotatedImageDisplay.src = `data:image/jpeg;base64,${data.image_base64}`;
            annotatedImageWrapper.hidden = false;

            if (data.heatmap_base64) {
                heatmapImageDisplay.src = `data:image/jpeg;base64,${data.heatmap_base64}`;
                heatmapImageWrapper.hidden = false;
            }
            renderResult(data);
            detectionDataSection.hidden = false;
            emptyState.style.display = 'none';
            aiAnalysisSection.hidden = false;
        } else {
            annotatedImageWrapper.hidden = true;
            heatmapImageWrapper.hidden = true;
            detectionDataSection.hidden = true;
            aiAnalysisSection.hidden = true;
        }
        updateNavArrows();
    }

    detectBtn.addEventListener('click', async () => {
        if (uploadedFiles.length === 0) return;

        loading.classList.add('active');
        statusText.hidden = true;
        detectBtn.hidden = true;

        const progressContainer = document.getElementById('progressContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        progressContainer.hidden = false;

        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            currentImageIndex = i;
            showCurrentImage();

            progressText.textContent = `正在检测第 ${i + 1} / ${uploadedFiles.length} 张图片...`;
            progressFill.style.width = `${((i) / uploadedFiles.length) * 100}%`;

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/detect_image', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (!data.success) {
                    showStatus(`图片 ${i + 1} 检测失败: ${data.error}`, 'error');
                    continue;
                }

                detectionResults[i] = data;
                lastResult = data;

                const reader = new FileReader();
                reader.onload = (e) => {
                    lastResult.original_image_base64 = e.target.result.split(',')[1];

                    annotatedImageDisplay.src = `data:image/jpeg;base64,${data.image_base64}`;
                    annotatedImageWrapper.hidden = false;

                    if (data.heatmap_base64) {
                        heatmapImageDisplay.src = `data:image/jpeg;base64,${data.heatmap_base64}`;
                        heatmapImageWrapper.hidden = false;
                    }

                    renderResult(data);
                    detectionDataSection.hidden = false;
                    emptyState.style.display = 'none';
                    aiAnalysisSection.hidden = false;
                };
                reader.readAsDataURL(file);
            } catch (err) {
                showStatus(`图片 ${i + 1} 请求失败: ${err.message}`, 'error');
            }

            progressFill.style.width = `${((i + 1) / uploadedFiles.length) * 100}%`;
        }

        loading.classList.remove('active');
        progressContainer.hidden = true;
        showStatus('所有图片检测完成', 'success');
        updateNavArrows();
    });

    // AI分析功能
    analyzeWithLLMBtn.addEventListener('click', async () => {
        if (!lastResult || !lastResult.image_base64) {
            showStatus('请先进行图片检测', 'error');
            return;
        }

        aiAnalysisResult.style.display = 'block';
        aiAnalysisLoading.hidden = false;
        aiAnalysisContent.innerHTML = '';
        analyzeWithLLMBtn.disabled = true;
        analyzeWithLLMBtn.textContent = '⏳ 分析中...';

        try {
            const response = await fetch('/analyze_with_llm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: lastResult.image_base64,
                    detections: lastResult.detections || [],
                    model_type: lastResult.model_type || 'yolo'
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'AI分析失败');
            }

            renderAIAnalysis(data.analysis);
            showStatus('AI分析完成', 'success');

        } catch (err) {
            aiAnalysisContent.innerHTML = `
                <div style="color: var(--danger); padding: 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">❌</div>
                    <div><strong>分析失败</strong></div>
                    <div style="margin-top: 8px; font-size: 13px;">${err.message}</div>
                </div>
            `;
            showStatus('AI分析失败: ' + err.message, 'error');
        } finally {
            aiAnalysisLoading.hidden = true;
            analyzeWithLLMBtn.disabled = false;
            analyzeWithLLMBtn.textContent = '🤖 AI智能分析';
        }
    });

    closeAIResult.addEventListener('click', () => {
        aiAnalysisContent.innerHTML = '';
        aiAnalysisResult.style.display = 'none';
    });

    async function checkLLMStatus() {
        try {
            const res = await fetch('/llm_status');
            const data = await res.json();

            if (data.available && data.connected) {
                llmServiceReady = true;
                llmStatusIndicator.className = 'llm-status-indicator ready';
                llmStatusIndicator.textContent = '✓ AI服务就绪';
            } else {
                llmServiceReady = false;
                llmStatusIndicator.className = 'llm-status-indicator error';
                llmStatusIndicator.textContent = '✗ AI服务不可用';
            }
        } catch (err) {
            llmServiceReady = false;
            llmStatusIndicator.className = 'llm-status-indicator error';
            llmStatusIndicator.textContent = '✗ 无法连接AI服务';
        }
    }

    function renderAIAnalysis(analysisText) {
        let html = analysisText
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h3>$1</h3>')
            .replace(/^# (.*$)/gim, '<h4>$1</h4>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^\- (.*$)/gim, '<li>$1</li>')
            .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
            .replace(/\n/g, '<br>');

        html = html.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');
        html = html.replace(/<\/ul>\s*<ul>/g, '');

        aiAnalysisContent.innerHTML = html;
    }

    checkLLMStatus();

    function renderResult(data) {
        let html = '';
        const dets = data.detections || [];
        html += `<div style="margin-bottom: 16px;"><strong>检测到 ${dets.length} 个缺陷</strong>`;
        if (data.image_size) {
            html += ` <span class="muted">(图片尺寸: ${data.image_size[0]} × ${data.image_size[1]})</span>`;
        }
        html += `</div>`;

        if (dets.length > 0) {
            html += `<table class="det-table">
                <thead><tr>
                    <th>序号</th><th>缺陷类型</th><th>置信度</th><th>位置</th>
                </tr></thead><tbody>`;

            dets.forEach((det, i) => {
                const confPct = det.confidence != null ? (det.confidence * 100).toFixed(1) : '-';
                const barW = det.confidence ? Math.max(4, det.confidence * 80) : 0;
                const posInfo = det.bbox ? det.bbox.join(', ') : (det.area != null ? `面积: ${det.area}px²` : '-');
                html += `<tr>
                    <td>${i + 1}</td>
                    <td>${det.class_name}</td>
                    <td>${confPct}% <span class="conf-bar" style="width:${barW}px"></span></td>
                    <td class="muted">${posInfo}</td>
                </tr>`;
            });
            html += `</tbody></table>`;
        } else {
            html += `<div class="muted" style="margin-top: 8px;">未检测到缺陷</div>`;
        }

        resultContent.innerHTML = html;
    }

    function showStatus(msg, type) {
        statusText.textContent = msg;
        statusText.className = 'status-text ' + type;
        statusText.hidden = false;
    }

    // 初始化
    modelSelect.selectedIndex = 0;
    restoreState();

    window.addEventListener('beforeunload', saveState);
})();
