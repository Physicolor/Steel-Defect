// 钢材缺陷检测系统 - 检测记录页面脚本
// 功能：图片卡片浏览 / 筛选分页 / 批量操作 / 模态查看 / 图表统计
(() => {

        // ==================== 动画程序全局控制 ====================
        const ANIMATION_ENABLED_KEY = 'animation_enabled';

        // ==================== 自定义提示弹窗（替代浏览器alert） ====================
        window.showAlert = function(message, title) {
            document.getElementById('alertMessageText').textContent = message;
            document.getElementById('alertTitle').textContent = title || '提示';
            document.getElementById('alertModal').classList.add('active');
        };
        window.closeAlertModal = function(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('alertModal').classList.remove('active');
        };
        
        // 从 localStorage 读取动画状态，默认为 true（开启）
        const isAnimationEnabled = localStorage.getItem(ANIMATION_ENABLED_KEY) !== 'false';
        
        // 根据动画状态更新 body 类
        function updateAnimationState(enabled) {
            if (document.body) {
                if (enabled) {
                    document.body.classList.remove('no-animations');
                } else {
                    document.body.classList.add('no-animations');
                }
            }
        }
        
        // 初始化动画状态（等待 DOM 加载完成）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateAnimationState(isAnimationEnabled);
                console.log('[动画程序] 初始状态:', isAnimationEnabled ? '开启' : '关闭');
            });
        } else {
            // DOM 已经加载完成
            updateAnimationState(isAnimationEnabled);
            console.log('[动画程序] 初始状态:', isAnimationEnabled ? '开启' : '关闭');
        }
        
        // ==================== 高对比度文字全局控制 ====================
        const HIGH_CONTRAST_KEY = 'high_contrast_text';
        
        // 从 localStorage 读取高对比度状态，默认为 false（关闭）
        const isHighContrastEnabled = localStorage.getItem(HIGH_CONTRAST_KEY) === 'true';
        
        // 根据高对比度状态更新 body 类
        function updateHighContrastState(enabled) {
            if (document.body) {
                if (enabled) {
                    document.body.classList.add('high-contrast-text');
                } else {
                    document.body.classList.remove('high-contrast-text');
                }
            }
        }
        
        // 初始化高对比度状态（等待 DOM 加载完成）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateHighContrastState(isHighContrastEnabled);
                console.log('[高对比度文字] 初始状态:', isHighContrastEnabled ? '开启' : '关闭');
            });
        } else {
            // DOM 已经加载完成
            updateHighContrastState(isHighContrastEnabled);
            console.log('[高对比度文字] 初始状态:', isHighContrastEnabled ? '开启' : '关闭');
        }
        
        // ==================== 高斯模糊全局控制 ====================
        const BLUR_ENABLED_KEY = 'blur_enabled';
        
        // 从 localStorage 读取高斯模糊状态，默认为 true（开启）
        const isBlurEnabled = localStorage.getItem(BLUR_ENABLED_KEY) !== 'false';
        
        // 根据高斯模糊状态更新 body 类
        function updateBlurState(enabled) {
            if (document.body) {
                if (enabled) {
                    document.body.classList.remove('no-blur');
                } else {
                    document.body.classList.add('no-blur');
                }
            }
        }
        
        // 初始化高斯模糊状态（等待 DOM 加载完成）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateBlurState(isBlurEnabled);
                console.log('[高斯模糊] 初始状态:', isBlurEnabled ? '开启' : '关闭');
            });
        } else {
            // DOM 已经加载完成
            updateBlurState(isBlurEnabled);
            console.log('[高斯模糊] 初始状态:', isBlurEnabled ? '开启' : '关闭');
        }
        
        function qs(sel) { return document.querySelector(sel); }
        
        // 清理AI输出文本的通用函数
        function cleanAIOutput(text) {
            if (!text) return '';
            
            let lines = text.split('\n');
            
            // 1. 清理每一行：去除首尾空格
            lines = lines.map(line => line.trim());
            
            // 2. 处理【标题】格式，转为 **标题** 格式（保留以便后续格式化）
            lines = lines.map(line => {
                // 将 【标题】 替换为 **标题**
                return line.replace(/^【(.+?)】\s*$/, '**$1**');
            });
            
            // 3. 删除行首的横杠或星号列表标记
            lines = lines.map(line => {
                return line.replace(/^[\-\*]\s+/, '');
            });
            
            // 4. 过滤掉所有空行
            let cleanedLines = lines.filter(line => line !== '');
            
            let result = cleanedLines.join('\n');
            
            // 5. 清理部分 Markdown 格式符号（保留 ** 用于标题识别）
            // 移除 # 标题标记
            result = result.replace(/^#+\s+/gm, '');
            // 移除 > 引用标记
            result = result.replace(/^>\s+/gm, '');
            // 移除 --- 分隔线
            result = result.replace(/^---+$/gm, '');
            // 移除 ` 代码标记
            result = result.replace(/`/g, '');
            
            return result;
        }
        
        // 分页状态
        let allData = [];
        let currentPage = 1;
        const itemsPerPage = 20;
        
        // 选择模式状态
        let selectionMode = false;
        let selectedItems = new Set();
        
        // 类别映射（缺陷名称）
        let classMap = {};
        let availableClasses = new Set(); // 所有可用的缺陷类别
        
        // 模态框批次浏览状态
        let currentBatchId = null;  // 当前批次ID
        let currentImageType = 'original';  // 当前图片类型: original/annotated/heatmap/crop
        let currentCropIndex = 0;  // 当前裁剪图索引
        let currentBatchData = null;  // 当前批次详细数据
        
        function buildQuery() {
            const start = qs('#start').value;
            const end = qs('#end').value;
            const cls = qs('#cls').value;
            const filterType = qs('#filter_type').value;
            const p = new URLSearchParams();
            if (start) p.set('start', start);
            if (end) p.set('end', end);
            if (cls && cls !== 'all') p.set('cls', cls);
            if (filterType && filterType !== 'defect_type') p.set('filter_type', filterType);
            return p.toString() ? ('/captures_data?' + p.toString()) : '/captures_data';
        }
        
        // 前端筛选逻辑（根据缺陷类别、置信度、导入类型筛选）
        function filterByClass(data, className, filterType = 'defect_type') {
            console.log('[类别筛选] 筛选类型:', filterType, '筛选条件:', className, '数据总数:', data.length);
            
            if (!className || className === 'all') {
                console.log('[类别筛选] 显示全部');
                return data;
            }
            
            const filtered = data.filter(batch => {
                if (filterType === 'defect_type') {
                    // 检查缺陷列表中是否包含指定类别
                    if (batch.defects && batch.defects.length > 0) {
                        return batch.defects.some(defect => defect.class_name === className);
                    }
                    // 兼容旧数据：检查crops
                    if (batch.crops && batch.crops.length > 0) {
                        return batch.crops.some(crop => crop.class_name === className);
                    }
                    return false;
                    
                } else if (filterType === 'confidence') {
                    // 置信度区间筛选
                    if (!batch.defects || batch.defects.length === 0) {
                        return false;
                    }
                    
                    // 解析置信度区间
                    const [minConf, maxConf] = className.split('-').map(v => parseInt(v));
                    console.log('[置信度筛选] 区间:', minConf, '-', maxConf);
                    
                    // 检查是否有缺陷在该置信度区间内
                    const hasMatch = batch.defects.some(defect => {
                        let conf = defect.confidence || 0;
                        // 如果置信度是小数形式（0-1），转换为百分比（0-100）
                        if (conf <= 1.0) {
                            conf = conf * 100;
                        }
                        console.log('[置信度筛选] 缺陷置信度:', conf);
                        return conf >= minConf && conf < maxConf;
                    });
                    
                    console.log('[置信度筛选] 是否匹配:', hasMatch);
                    return hasMatch;
                    
                } else if (filterType === 'defect_count') {
                    // 缺陷个数筛选
                    let defectCount = 0;
                    if (batch.defects && batch.defects.length > 0) {
                        defectCount = batch.defects.length;
                    } else if (batch.crops && batch.crops.length > 0) {
                        defectCount = batch.crops.length;
                    }
                    
                    const targetCount = parseInt(className);
                    console.log('[缺陷个数筛选] 目标个数:', targetCount, '实际个数:', defectCount);
                    return defectCount === targetCount;
                    
                } else if (filterType === 'source_type') {
                    // 导入类型筛选
                    const sourceType = batch.source_type || 'legacy';
                    return sourceType === className;
                }
                
                return false;
            });
            
            console.log('[类别筛选] 筛选结果:', filtered.length);
            return filtered;
        }
        
        async function loadCaptures() {
            const url = buildQuery();
            console.log('[加载数据] URL:', url);
            
            // 显示加载提示
            const grid = document.getElementById('grid');
            if (grid) {
                grid.style.opacity = '0.5';
                grid.style.pointerEvents = 'none';
            }
            
            try {
                const startTime = performance.now();
                const res = await fetch(url);
                const result = await res.json();
                const endTime = performance.now();
                
                console.log(`[加载数据] 请求耗时: ${(endTime - startTime).toFixed(0)}ms, 缓存: ${result.cached ? '是' : '否'}`);
                
                // 获取原始数据
                const rawData = result.data || [];
                console.log('[加载数据] 原始数据条数:', rawData.length);
                
                // 先更新类别选项（使用全部数据）
                updateClassOptions(rawData);
                
                // 获取当前选择的类别和筛选类型
                const clsElement = qs('#cls');
                const filterTypeElement = qs('#filter_type');
                const selectedClass = clsElement ? clsElement.value : 'all';
                const filterType = filterTypeElement ? filterTypeElement.value : 'defect_type';
                console.log('[加载数据] cls元素:', clsElement);
                console.log('[加载数据] 当前选择的类别:', selectedClass);
                console.log('[加载数据] 筛选类型:', filterType);
                
                // 应用前端筛选
                allData = filterByClass(rawData, selectedClass, filterType);
                console.log('[加载数据] 筛选后数据条数:', allData.length);
                
                // 先渲染页面，让用户立即看到内容
                currentPage = 1;
                renderPage();
                renderPagination();
                
                // 滚动到grid容器顶部
                if (grid) {
                    grid.scrollTo({ top: 0, behavior: 'smooth' });
                }
                
                // 然后异步更新日期范围（不影响用户体验）
                requestAnimationFrame(() => {
                    if (result.date_range) {
                        updateDateRange(result.date_range);
                    }
                });
            } finally {
                // 恢复交互
                if (grid) {
                    grid.style.opacity = '1';
                    grid.style.pointerEvents = 'auto';
                }
            }
        }
        
        function updateDateRange(range) {
            const startInput = qs('#start');
            const endInput = qs('#end');
            
            if (range.min && range.max) {
                // 转换为本地时间格式 yyyy-mm-ddThh:mm
                const minDate = new Date(range.min * 1000);
                const maxDate = new Date(range.max * 1000);
                
                const formatDate = (date) => {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    return `${year}-${month}-${day}T${hours}:${minutes}`;
                };
                
                const minStr = formatDate(minDate);
                const maxStr = formatDate(maxDate);
                
                // 设置 min/max 属性限制选择范围
                startInput.min = minStr;
                startInput.max = maxStr;
                endInput.min = minStr;
                endInput.max = maxStr;
                
                // 设置默认值：最早时间和最晚时间
                const isFirstSet = !startInput.value && !endInput.value;
                if (!startInput.value) {
                    startInput.value = minStr;
                }
                if (!endInput.value) {
                    endInput.value = maxStr;
                }
                // 首次设置默认日期范围时不单独刷新统计（DOMContentLoaded已统一触发）
            } else {
                // 没有记录时显示横杠
                startInput.placeholder = '—';
                endInput.placeholder = '—';
            }
        }
        
        function updateClassOptions(data) {
            // 获取当前筛选类型
            const filterTypeElement = document.getElementById('filter_type');
            const currentFilterType = filterTypeElement ? filterTypeElement.value : 'defect_type';
            
            // 只有在筛选类型是"缺陷类型"时才更新选项
            if (currentFilterType !== 'defect_type') {
                console.log('[更新类别选项] 当前筛选类型不是缺陷类型，跳过更新');
                return;
            }
            
            const clsSelect = qs('#cls');
            const currentValue = clsSelect.value; // 保存当前选择的值
            console.log('[更新类别选项] 保存的currentValue:', currentValue);
                            
            // 从批次数据中提取缺陷类别（追加模式，不清空已有类别）
            data.forEach(batch => {
                if (batch.defects && batch.defects.length > 0) {
                    batch.defects.forEach(defect => {
                        if (defect.class_name) {
                            availableClasses.add(defect.class_name);
                        }
                    });
                }
                // 兼容旧数据：从crops中提取
                if (batch.crops && batch.crops.length > 0) {
                    batch.crops.forEach(crop => {
                        if (crop.class_name) {
                            availableClasses.add(crop.class_name);
                        }
                    });
                }
            });
            console.log('[更新类别选项] 可用类别:', Array.from(availableClasses));
            
            // 【关键修复】同步更新隐藏select元素的options
            clsSelect.innerHTML = '<option value="all">全部</option>';
            const sortedClasses = Array.from(availableClasses).sort();
            sortedClasses.forEach(clsName => {
                const option = document.createElement('option');
                option.value = clsName;
                option.textContent = clsName;
                clsSelect.appendChild(option);
            });
            console.log('[更新类别选项] ✅ 已更新隐藏select的options');
                            
            // 更新自定义下拉框的选项
            const optionsContainer = document.getElementById('cls-options');
            const optionsInner = optionsContainer.querySelector('.custom-select-options-inner');
            optionsInner.innerHTML = '<div class="custom-option active" data-value="all">全部</div>';
                            
            // 添加动态类别选项
            sortedClasses.forEach(clsName => {
                const option = document.createElement('div');
                option.className = 'custom-option';
                option.setAttribute('data-value', clsName);
                option.textContent = clsName;
                optionsInner.appendChild(option);
            });
                            
            // 恢复之前选择的值（如果该选项还存在）
            console.log('[更新类别选项] 恢复条件检查:');
            console.log('  - currentValue:', currentValue);
            console.log('  - currentValue !== "all":', currentValue !== 'all');
            console.log('  - availableClasses.has(currentValue):', availableClasses.has(currentValue));
            
            if (currentValue && currentValue !== 'all' && availableClasses.has(currentValue)) {
                console.log('[更新类别选项] ✅ 恢复值为:', currentValue);
                clsSelect.value = currentValue;
                updateCustomSelectDisplay(currentValue);
            } else {
                console.log('[更新类别选项] ❌ 不满足恢复条件，重置为all');
                clsSelect.value = 'all';
                updateCustomSelectDisplay('all');
            }
                            
            // 绑定选项点击事件
            const triggerElement = document.getElementById('cls-trigger');
            optionsContainer.querySelectorAll('.custom-option').forEach(option => {
                option.addEventListener('click', function(e) {
                    e.stopPropagation(); // 阻止事件冒泡，避免被全局监听器干扰
                    const value = this.getAttribute('data-value');
                    console.log('[类别筛选] 点击了:', value);
                    
                    // 更新隐藏的select元素
                    clsSelect.value = value;
                    console.log('[类别筛选] clsSelect.value已设置为:', clsSelect.value);
                    
                    // 更新显示
                    updateCustomSelectDisplay(value);
                    
                    // 关闭下拉框
                    optionsContainer.classList.remove('open');
                    if (triggerElement) {
                        triggerElement.classList.remove('open');
                    }
                    
                    console.log('[类别筛选] 开始筛选...');
                    onFilter();
                });
            });
        }
                
        function updateCustomSelectDisplay(value) {
            const trigger = document.getElementById('cls-trigger');
            const span = trigger.querySelector('span');
            span.textContent = value === 'all' ? '全部' : value;
                    
            // 更新active状态
            const options = document.querySelectorAll('#cls-options .custom-option');
            options.forEach(opt => {
                if (opt.getAttribute('data-value') === value) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
        }
        
        function renderPage() {
            const grid = document.getElementById('grid');
            
            if (!allData.length) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <div class="empty-state-icon"></div>
                        <div>暂无符合条件的检测记录</div>
                    </div>
                `;
                return;
            }
            
            // 计算当前页的数据
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageData = allData.slice(startIndex, endIndex);
            
            grid.innerHTML = '';
            
            for (const batch of pageData) {
                const card = document.createElement('div');
                card.className = 'card';
                card.dataset.batchId = batch.batch_id;
                
                // 如果已选中，添加selected类
                if (selectedItems.has(batch.batch_id)) {
                    card.classList.add('selected');
                }
                
                // 优先使用 JSON 中的 timestamp，其次使用 mtime
                let time = '';
                if (batch.timestamp) {
                    if (batch.timestamp.includes('T')) {
                        time = new Date(batch.timestamp).toLocaleString('zh-CN');
                    } else if (batch.timestamp.includes('_')) {
                        const parts = batch.timestamp.split('_');
                        if (parts.length >= 2) {
                            const dateStr = parts[0];
                            const timeStr = parts[1];
                            const year = dateStr.substring(0, 4);
                            const month = dateStr.substring(4, 6);
                            const day = dateStr.substring(6, 8);
                            const hour = timeStr.substring(0, 2);
                            const minute = timeStr.substring(2, 4);
                            const second = timeStr.substring(4, 6);
                            time = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
                        }
                    }
                } else if (batch.mtime) {
                    time = new Date(batch.mtime * 1000).toLocaleString('zh-CN');
                }
                const imageCount = batch.image_count || 1;

                // 构建可读的卡片名称：提取缺陷类型信息
                let cardName = batch.batch_id;
                let cardTitle = batch.batch_id;
                const defectNames = new Set();
                if (batch.defects && batch.defects.length > 0) {
                    batch.defects.forEach(d => { if (d.class_name) defectNames.add(d.class_name); });
                }
                if (batch.crops && batch.crops.length > 0) {
                    batch.crops.forEach(c => { if (c.class_name) defectNames.add(c.class_name); });
                }
                const defectList = Array.from(defectNames).sort();
                const defectCount = (batch.defects && batch.defects.length) || (batch.crops && batch.crops.length) || 0;
                const defectSummary = defectList.length > 0
                    ? defectList.slice(0, 3).join('、') + (defectList.length > 3 ? '等' : '')
                    : '无缺陷';

                if (batch.source_type === 'camera') {
                    cardName = `📷 帧检测 · ${defectSummary}`;
                } else if (batch.source_type === 'ip_camera') {
                    cardName = `🌐 IP检测 · ${defectSummary}`;
                } else if (batch.source_type === 'image') {
                    cardName = `🖼️ 图片检测 · ${defectSummary}`;
                } else if (defectList.length > 0) {
                    cardName = `${defectSummary} (${defectCount}个)`;
                }
                cardTitle = cardName + '\n批次: ' + batch.batch_id;
                
                card.innerHTML = `
                    <div class="select-checkbox" onclick="event.stopPropagation(); toggleSelection('${batch.batch_id}', this)"></div>
                    <div class="thumb">
                        <span class="badge">${defectCount} 个缺陷 · ${imageCount} 张图</span>
                        <img src="/captures/${batch.thumbnail}" alt="${cardName}" loading="lazy" />
                    </div>
                    <div class="card-info">
                        <div class="name" title="${cardTitle.replace(/"/g, '&quot;')}">${cardName}</div>
                        <div class="time">${time}</div>
                    </div>
                `;
                
                // 点击卡片查看大图或切换选择
                card.addEventListener('click', (e) => {
                    if (selectionMode) {
                        // 选择模式下，点击整个卡片切换选择状态
                        const checkbox = card.querySelector('.select-checkbox');
                        toggleSelection(batch.batch_id, checkbox);
                    } else {
                        // 非选择模式，打开大图
                        showBatchModal(batch, e.currentTarget);
                    }
                });
                
                grid.appendChild(card);
            }
        }
        
        // 切换选择模式
        window.toggleSelectionMode = toggleSelectionMode;
        function toggleSelectionMode() {
            selectionMode = !selectionMode;
            // 使用 document.body 作为容器，确保 .selection-mode 类能够应用到全局
            const container = document.body;
            const selectBtn = qs('#selectBtn');
            
            if (!selectBtn) return; // 防御性检查
            
            if (selectionMode) {
                container.classList.add('selection-mode');
                selectBtn.textContent = '✕ 取消选择';
                selectBtn.classList.add('primary');
            } else {
                container.classList.remove('selection-mode');
                selectBtn.textContent = '☑ 选择';
                selectBtn.classList.remove('primary');
                // 清空所有选择
                clearSelection();
            }
        }
        
        // 切换单个项目选择
        window.toggleSelection = toggleSelection;
        function toggleSelection(filename, checkbox) {
            const card = checkbox.closest('.card');
            
            if (selectedItems.has(filename)) {
                selectedItems.delete(filename);
                checkbox.classList.remove('checked');
                card.classList.remove('selected');
            } else {
                selectedItems.add(filename);
                checkbox.classList.add('checked');
                card.classList.add('selected');
            }
            
            updateBatchBar();
        }
        
        // 清空选择
        function clearSelection() {
            selectedItems.clear();
            document.querySelectorAll('.select-checkbox.checked').forEach(cb => {
                cb.classList.remove('checked');
            });
            document.querySelectorAll('.card.selected').forEach(card => {
                card.classList.remove('selected');
            });
            updateBatchBar();
        }
        
        // 更新底部操作栏
        function updateBatchBar() {
            const batchBar = qs('#batchBar');
            
            if (selectedItems.size > 0) {
                batchBar.classList.add('visible');
                // 恢复正常按钮
                restoreBatchButtons();
            } else {
                batchBar.classList.remove('visible');
            }
        }
        
        // 恢复批量操作按钮
        window.restoreBatchButtons = restoreBatchButtons;
        function restoreBatchButtons() {
            const batchBar = qs('#batchBar');
            batchBar.innerHTML = `
                <button class="batch-btn download" onclick="batchDownload()">
                    📥 下载记录 (${selectedItems.size})
                </button>
                <button class="batch-btn delete" onclick="batchDelete()">
                    🗑️ 删除
                </button>
            `;
        }
        
        // 显示警告信息
        function showWarning(message) {
            const batchBar = qs('#batchBar');
            batchBar.innerHTML = `
                <button class="batch-btn warning" onclick="restoreBatchButtons()">
                    ⚠️ ${message}
                </button>
            `;
            
            setTimeout(() => {
                restoreBatchButtons();
            }, 2000);
        }
        
        // 批量下载
        window.batchDownload = batchDownload;
        async function batchDownload() {
            if (selectedItems.size === 0) {
                showWarning('请先选择图片');
                return;
            }
            
            // 逐个下载批次中的所有图片
            for (const batchId of selectedItems) {
                const batch = allData.find(b => b.batch_id === batchId);
                if (batch) {
                    // 下载该批次的所有图片
                    const allFiles = Object.values(batch.images).concat(
                        batch.crops.map(c => c.filename)
                    );
                    for (const filename of allFiles) {
                        const link = document.createElement('a');
                        link.href = `/captures/${filename}`;
                        link.download = filename;
                        link.click();
                        // 添加小延迟避免浏览器阻止多个下载
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
        }
        
        // 批量删除
        window.batchDelete = batchDelete;
        async function batchDelete() {
            if (selectedItems.size === 0) {
                showWarning('请先选择图片');
                return;
            }
            
            // 立即保存选中的批次ID，防止后续操作清除
            window._pendingDeleteItems = Array.from(selectedItems);
            
            // 显示删除确认弹窗
            showDeleteConfirm(selectedItems.size);
        }
        
        // 显示删除确认弹窗
        function showDeleteConfirm(count) {
            const modal = document.getElementById('deleteConfirmModal');
            const messageText = document.getElementById('deleteMessageText');
            messageText.textContent = `确定要删除选中的 ${count} 个批次吗？`;
            modal.classList.add('active');
        }
        
        // 关闭删除确认弹窗
        window.closeDeleteConfirm = closeDeleteConfirm;
        function closeDeleteConfirm() {
            const modal = document.getElementById('deleteConfirmModal');
            const content = modal.querySelector('.confirm-modal-content');
            
            // 添加淡出动画类
            content.classList.add('fadeOut');
            
            // 等待动画完成后隐藏弹窗
            setTimeout(() => {
                modal.classList.remove('active');
                content.classList.remove('fadeOut');
            }, 300);
        }
        
        // 处理删除弹窗点击事件
        window.handleDeleteModalClick = handleDeleteModalClick;
        function handleDeleteModalClick(event) {
            // 如果点击的是弹窗背景(遮罩层),而不是弹窗内容本身,则关闭弹窗
            if (event.target === event.currentTarget) {
                closeDeleteConfirm();
            }
        }
        
        // 确认删除
        window.confirmDelete = confirmDelete;
        async function confirmDelete() {
            // 关闭弹窗
            closeDeleteConfirm();
            
            // 检查是否有来自模态框的删除回调（单批次删除）
            if (window.deleteModalCallback) {
                const callback = window.deleteModalCallback;
                window.deleteModalCallback = null;
                await callback();
                return;
            }
            
            // 批量删除：使用之前保存的批次ID
            const itemsToDelete = window._pendingDeleteItems || [];
            
            if (itemsToDelete.length === 0) {
                showAlert('未选中要删除的文件');
                return;
            }
                    
            try {
                // 收集所有要删除的文件名
                const allFilenames = [];
                for (const batchId of itemsToDelete) {
                    const batch = allData.find(b => b.batch_id === batchId);
                    if (batch) {
                        const files = Object.values(batch.images).concat(
                            batch.crops.map(c => c.filename)
                        );
                        allFilenames.push(...files);
                    }
                }
                        
                if (allFilenames.length === 0) {
                    showAlert('未找到要删除的文件');
                    return;
                }
                        
                const res = await fetch('/batch_delete_captures', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filenames: allFilenames })
                });
                        
                const data = await res.json();
                        
                if (data.success) {
                    // 重新加载数据
                    await loadCaptures();
                            
                    // 清除选择状态并退出选择模式
                    clearSelection();
                    if (selectionMode) {
                        toggleSelectionMode();
                    }
                    
                    // 清理临时存储
                    window._pendingDeleteItems = null;
                } else {
                    showAlert('删除失败: ' + data.error, '删除错误');
                }
            } catch (err) {
                showAlert('删除失败: ' + err.message, '删除错误');
            }
        }
        
        async function deleteCapture(filename) {
            if (!confirm(`确定要删除 "${filename}" 吗？`)) {
                return;
            }
            
            try {
                const res = await fetch(`/delete_capture/${filename}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                
                if (data.success) {
                    allData = allData.filter(item => item.name !== filename);
                    renderPage();
                    renderPagination();
                } else {
                    showAlert('删除失败: ' + data.error, '删除错误');
                }
            } catch (err) {
                showAlert('删除失败: ' + err.message, '删除错误');
            }
        }
        
        function renderPagination() {
            const paginationDiv = document.getElementById('pagination');
            const totalPages = Math.ceil(allData.length / itemsPerPage);
            
            // 【修改】始终显示分页器，即使只有1页
            if (totalPages === 0) {
                paginationDiv.innerHTML = '';
                return;
            }
            
            let html = '';
            
            // 上一页按钮
            html += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>`;
            
            // 页码按钮
            html += '<div class="page-numbers">';
            
            // 显示页码逻辑
            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);
            
            if (endPage - startPage < 4) {
                if (startPage === 1) {
                    endPage = Math.min(totalPages, startPage + 4);
                } else if (endPage === totalPages) {
                    startPage = Math.max(1, totalPages - 4);
                }
            }
            
            if (startPage > 1) {
                html += `<button class="page-number" onclick="changePage(1)">1</button>`;
                if (startPage > 2) {
                    html += `<span class="page-info">...</span>`;
                }
            }
            
            for (let i = startPage; i <= endPage; i++) {
                html += `<button class="page-number ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
            }
            
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    html += `<span class="page-info">...</span>`;
                }
                html += `<button class="page-number" onclick="changePage(${totalPages})">${totalPages}</button>`;
            }
            
            html += '</div>';
            
            // 下一页按钮
            html += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;
            
            // 页码输入框
            html += `<input type="number" class="page-input" min="1" max="${totalPages}" placeholder="页数" onkeypress="if(event.key==='Enter'){jumpToPage(this.value)}" />`;
            
            // 页面信息
            html += `<div class="page-info">第 ${currentPage} / ${totalPages} 页 (共 ${allData.length} 条)</div>`;
            
            paginationDiv.innerHTML = html;
        }
        
        window.changePage = changePage;
        function changePage(page) {
            const totalPages = Math.ceil(allData.length / itemsPerPage);
            if (page < 1 || page > totalPages) return;
            
            currentPage = page;
            renderPage();
            renderPagination();
            
            // 滚动到grid容器顶部
            const grid = document.getElementById('grid');
            if (grid) {
                grid.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
        
        window.jumpToPage = jumpToPage;
        function jumpToPage(pageNum) {
            const page = parseInt(pageNum);
            if (page) {
                changePage(page);
            }
        }
        
        function onFilter() {
            loadCaptures();
            // 延迟刷新统计图表（使用合并端点）
            setTimeout(() => {
                fetchAllStats();
            }, 300);
        }

        window.resetFilters = resetFilters;
        function resetFilters() {
            document.getElementById('start').value = '';
            document.getElementById('end').value = '';
            document.getElementById('filter_type').value = 'defect_type';
            updateFilterTypeDisplay('defect_type');
            updateFirstSelectOptions('defect_type');
            document.getElementById('cls').value = 'all';
            updateCustomSelectDisplay('all');
            onFilter();
        }

        // 筛选类型切换处理
        function onFilterTypeChange() {
            const filterTypeElement = document.getElementById('filter_type');
            const filterType = filterTypeElement ? filterTypeElement.value : 'defect_type';

            console.log('[筛选类型] 切换到:', filterType);

            // 更新显示
            updateFilterTypeDisplay(filterType);

            // 根据筛选类型更新第一个下拉框的选项
            updateFirstSelectOptions(filterType);

            // 重新筛选
            onFilter();
        }
        
        function updateFilterTypeDisplay(value) {
            const trigger = document.getElementById('filter-type-trigger');
            if (!trigger) return;
            
            const span = trigger.querySelector('span');
            const displayText = {
                'defect_type': '缺陷类型',
                'confidence': '置信度区间',
                'defect_count': '缺陷个数',
                'source_type': '导入类型'
            };
            span.textContent = displayText[value] || value;
            
            // 更新active状态
            const options = document.querySelectorAll('#filter-type-options .custom-option');
            options.forEach(opt => {
                if (opt.getAttribute('data-value') === value) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
        }
        
        function updateFirstSelectOptions(filterType) {
            console.log('[更新第一个下拉框] 筛选类型:', filterType);
            const clsSelect = document.getElementById('cls');
            const optionsContainer = document.getElementById('cls-options');
            const optionsInner = optionsContainer.querySelector('.custom-select-options-inner');
            
            // 清空现有选项
            optionsInner.innerHTML = '';
            clsSelect.innerHTML = '';
            
            if (filterType === 'defect_type') {
                // 缺陷类型：显示所有缺陷类别
                const optionAll = document.createElement('div');
                optionAll.className = 'custom-option active';
                optionAll.setAttribute('data-value', 'all');
                optionAll.textContent = '全部';
                optionsInner.appendChild(optionAll);
                
                const optAll = document.createElement('option');
                optAll.value = 'all';
                optAll.textContent = '全部';
                clsSelect.appendChild(optAll);
                
                // 动态添加缺陷类别（从availableClasses）
                const sortedClasses = Array.from(availableClasses).sort();
                sortedClasses.forEach(clsName => {
                    const option = document.createElement('div');
                    option.className = 'custom-option';
                    option.setAttribute('data-value', clsName);
                    option.textContent = clsName;
                    optionsInner.appendChild(option);
                    
                    const opt = document.createElement('option');
                    opt.value = clsName;
                    opt.textContent = clsName;
                    clsSelect.appendChild(opt);
                });
                
                clsSelect.value = 'all';
                updateCustomSelectDisplay('all');
                
            } else if (filterType === 'confidence') {
                // 置信度区间
                const ranges = [
                    {value: 'all', label: '全部'},
                    {value: '0-20', label: '0-20%'},
                    {value: '20-40', label: '20-40%'},
                    {value: '40-60', label: '40-60%'},
                    {value: '60-80', label: '60-80%'},
                    {value: '80-100', label: '80-100%'}
                ];
                
                ranges.forEach(range => {
                    const option = document.createElement('div');
                    option.className = range.value === 'all' ? 'custom-option active' : 'custom-option';
                    option.setAttribute('data-value', range.value);
                    option.textContent = range.label;
                    optionsInner.appendChild(option);
                    
                    const opt = document.createElement('option');
                    opt.value = range.value;
                    opt.textContent = range.label;
                    clsSelect.appendChild(opt);
                });
                
                clsSelect.value = 'all';
                updateCustomSelectDisplay('all');
                
            } else if (filterType === 'defect_count') {
                // 缺陷个数：动态统计所有批次中的缺陷个数
                const countSet = new Set();
                
                // 从 allData 中统计缺陷个数
                if (typeof allData !== 'undefined' && allData && allData.length > 0) {
                    allData.forEach(batch => {
                        let defectCount = 0;
                        if (batch.defects && batch.defects.length > 0) {
                            defectCount = batch.defects.length;
                        } else if (batch.crops && batch.crops.length > 0) {
                            defectCount = batch.crops.length;
                        }
                        if (defectCount > 0) {
                            countSet.add(defectCount);
                        }
                    });
                }
                
                console.log('[缺陷个数] 统计结果:', Array.from(countSet).sort((a, b) => a - b));
                
                // 添加"全部"选项
                const optionAll = document.createElement('div');
                optionAll.className = 'custom-option active';
                optionAll.setAttribute('data-value', 'all');
                optionAll.textContent = '全部';
                optionsInner.appendChild(optionAll);
                
                const optAll = document.createElement('option');
                optAll.value = 'all';
                optAll.textContent = '全部';
                clsSelect.appendChild(optAll);
                
                // 按从小到大排序并添加选项
                const sortedCounts = Array.from(countSet).sort((a, b) => a - b);
                sortedCounts.forEach(count => {
                    const option = document.createElement('div');
                    option.className = 'custom-option';
                    option.setAttribute('data-value', count.toString());
                    option.textContent = `${count}个`;
                    optionsInner.appendChild(option);
                    
                    const opt = document.createElement('option');
                    opt.value = count.toString();
                    opt.textContent = `${count}个`;
                    clsSelect.appendChild(opt);
                });
                
                clsSelect.value = 'all';
                updateCustomSelectDisplay('all');
                
            } else if (filterType === 'source_type') {
                // 导入类型
                const types = [
                    {value: 'all', label: '全部'},
                    {value: 'image', label: '图片'},
                    {value: 'camera', label: '摄像头'},
                    {value: 'ip_camera', label: 'IP摄像头'}
                ];
                
                types.forEach(type => {
                    const option = document.createElement('div');
                    option.className = type.value === 'all' ? 'custom-option active' : 'custom-option';
                    option.setAttribute('data-value', type.value);
                    option.textContent = type.label;
                    optionsInner.appendChild(option);
                    
                    const opt = document.createElement('option');
                    opt.value = type.value;
                    opt.textContent = type.label;
                    clsSelect.appendChild(opt);
                });
                
                clsSelect.value = 'all';
                updateCustomSelectDisplay('all');
            }
            
            // 重新绑定选项点击事件
            const triggerElement = document.getElementById('cls-trigger');
            optionsContainer.querySelectorAll('.custom-option').forEach(option => {
                option.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const value = this.getAttribute('data-value');
                    console.log('[类别筛选] 点击了:', value);
                    
                    clsSelect.value = value;
                    updateCustomSelectDisplay(value);
                    
                    optionsContainer.classList.remove('open');
                    if (triggerElement) {
                        triggerElement.classList.remove('open');
                    }
                    
                    onFilter();
                });
            });
        }
        
        document.addEventListener('DOMContentLoaded', () => {
            // 初始化第一个下拉框的选项（默认为缺陷类型）
            updateFirstSelectOptions('defect_type');
            
            loadCaptures();
            
            // 自定义下拉框交互 - 第一个下拉框（cls）
            const trigger = document.getElementById('cls-trigger');
            const options = document.getElementById('cls-options');
            
            if (trigger && options) {
                // 点击触发器展开/收起
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = options.classList.contains('open');
                    
                    if (isOpen) {
                        options.classList.remove('open');
                        trigger.classList.remove('open');
                    } else {
                        options.classList.add('open');
                        trigger.classList.add('open');
                    }
                });
            }
            
            // 自定义下拉框交互 - 第二个下拉框（filter_type）
            const filterTypeTrigger = document.getElementById('filter-type-trigger');
            const filterTypeOptions = document.getElementById('filter-type-options');
            
            if (filterTypeTrigger && filterTypeOptions) {
                // 点击触发器展开/收起
                filterTypeTrigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = filterTypeOptions.classList.contains('open');
                    
                    if (isOpen) {
                        filterTypeOptions.classList.remove('open');
                        filterTypeTrigger.classList.remove('open');
                    } else {
                        filterTypeOptions.classList.add('open');
                        filterTypeTrigger.classList.add('open');
                    }
                });
                
                // 绑定选项点击事件
                filterTypeOptions.querySelectorAll('.custom-option').forEach(option => {
                    option.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const value = this.getAttribute('data-value');
                        console.log('[筛选类型] 点击了:', value);
                        
                        // 更新隐藏的select元素
                        const filterTypeSelect = document.getElementById('filter_type');
                        filterTypeSelect.value = value;
                        
                        // 更新显示
                        updateFilterTypeDisplay(value);
                        
                        // 关闭下拉框
                        filterTypeOptions.classList.remove('open');
                        filterTypeTrigger.classList.remove('open');
                        
                        // 根据筛选类型更新第一个下拉框的选项
                        updateFirstSelectOptions(value);
                        
                        // 重新筛选
                        onFilter();
                    });
                });
            }
            
            // 点击其他地方关闭下拉框
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.custom-select-wrapper')) {
                    if (options) options.classList.remove('open');
                    if (trigger) trigger.classList.remove('open');
                    if (filterTypeOptions) filterTypeOptions.classList.remove('open');
                    if (filterTypeTrigger) filterTypeTrigger.classList.remove('open');
                }
            });
            
            // 点击其他地方退出选择模式
            const selectionModeClickListener = (e) => {
                // 如果在卡片上点击，不要退出选择模式（卡片点击会触发toggleSelection）
                // 如果在删除确认弹窗上点击，也不要退出选择模式
                // 如果点击的是选择按钮或删除按钮，也不要退出选择模式
                if (selectionMode && 
                    !e.target.closest('.select-checkbox') && 
                    !e.target.closest('#selectBtn') && 
                    !e.target.closest('.card') && 
                    !e.target.closest('#deleteConfirmModal') &&
                    !e.target.closest('#deleteBtn')) { // 新增：排除删除按钮
                    toggleSelectionMode();
                }
            };
            
            // 保存监听器引用到window对象
            window._selectionModeClickListener = selectionModeClickListener;
            
            document.addEventListener('click', selectionModeClickListener);
        });
        
        // 模态框功能 - iOS风格FLIP动画
        let currentModalItem = null;
        let animationInProgress = false;
        let originalCardRect = null; // 保存原始卡片位置
        
        // 显示批次模态框（新）
        async function showBatchModal(batch, triggerElement) {
            // 如果在选择模式下，不打开模态框
            if (selectionMode) return;
            
            currentBatchId = batch.batch_id;
            
            // 根据优先级设置默认显示的图片类型：annotated(带缺陷框) > heatmap > original > crops
            if (batch.images && batch.images.annotated) {
                currentImageType = 'annotated';
            } else if (batch.images && batch.images.heatmap) {
                currentImageType = 'heatmap';
            } else if (batch.images && batch.images.original) {
                currentImageType = 'original';
            } else if (batch.crops && batch.crops.length > 0) {
                currentImageType = 'crop';
                currentCropIndex = 0;
            } else {
                currentImageType = 'original'; // 默认值
            }
            
            animationInProgress = true;
            
            // 获取批次详细信息
            try {
                // 对于摄像头会话，使用第一帧的batch_id
                let detailBatchId = batch.batch_id;
                if (batch.is_camera_session && batch.frames && batch.frames.length > 0) {
                    detailBatchId = batch.frames[0].batch_id;
                }
                
                const res = await fetch(`/batch_detail/${detailBatchId}`);
                currentBatchData = await res.json();
            } catch (err) {
                console.error('获取批次详情失败:', err);
                currentBatchData = batch;
            }
            
            const modal = document.getElementById('imageModal');
            const modalContent = qs('.modal-content');
            
            // 记录小图卡片的精确位置和尺寸（使用Math.round避免亚像素）
            const cardRect = triggerElement.getBoundingClientRect();
            originalCardRect = {
                left: Math.round(cardRect.left),
                top: Math.round(cardRect.top),
                width: Math.round(cardRect.width),
                height: Math.round(cardRect.height)
            };
            
            // 先渲染批次内容，并设置为小卡片布局
            renderBatchContent();
            const innerContainer = modalContent.querySelector('.modal-inner');
            if (innerContainer) {
                innerContainer.classList.add('compact-layout');
            }
            
            // 设置初始状态：将模态框定位到小图卡片的位置
            modalContent.style.left = `${originalCardRect.left}px`;
            modalContent.style.top = `${originalCardRect.top}px`;
            modalContent.style.width = `${originalCardRect.width}px`;
            modalContent.style.height = `${originalCardRect.height}px`;
            modalContent.style.borderRadius = 'var(--radius-lg)';
            modalContent.style.clipPath = 'inset(0 round var(--radius-lg))';
            modalContent.style.transform = 'none';
            
            // 显示模态框背景
            modal.classList.add('active');
            document.body.classList.add('modal-open'); // 添加页面缩放效果
            
            // 锁定滚动但保持页面宽度不变（防止背景元素移动）
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = `${scrollbarWidth}px`;
            
            // 检查动画是否被禁用
            const isAnimationDisabled = document.body.classList.contains('no-animations');
            
            if (isAnimationDisabled) {
                // 动画禁用时，立即显示完整大小的模态框
                const targetWidth = Math.round(Math.min(window.innerWidth * 0.85, 1200));
                const targetHeight = Math.round(Math.min(window.innerHeight * 0.75, 700));
                const targetLeft = Math.round((window.innerWidth - targetWidth) / 2);
                const targetTop = Math.round((window.innerHeight - targetHeight) / 2);
                
                // 直接设置为目标状态
                if (innerContainer) {
                    innerContainer.classList.remove('compact-layout');
                }
                modalContent.style.borderRadius = 'var(--radius-xl)';
                modalContent.style.clipPath = 'inset(0 round var(--radius-xl))';
                modalContent.style.left = `${targetLeft}px`;
                modalContent.style.top = `${targetTop}px`;
                modalContent.style.width = `${targetWidth}px`;
                modalContent.style.height = `${targetHeight}px`;
                
                animationInProgress = false;
            } else {
                // 等待一小段时间后执行动画
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        const targetWidth = Math.round(Math.min(window.innerWidth * 0.85, 1200));
                        const targetHeight = Math.round(Math.min(window.innerHeight * 0.75, 700));
                        const targetLeft = Math.round((window.innerWidth - targetWidth) / 2);
                        const targetTop = Math.round((window.innerHeight - targetHeight) / 2);
                        
                        // 同时触发布局切换和尺寸放大，所有过渡都是平滑的
                        if (innerContainer) {
                            innerContainer.classList.remove('compact-layout');
                        }
                        modalContent.style.borderRadius = 'var(--radius-xl)';
                        modalContent.style.clipPath = 'inset(0 round var(--radius-xl))';
                        modalContent.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                        modalContent.style.left = `${targetLeft}px`;
                        modalContent.style.top = `${targetTop}px`;
                        modalContent.style.width = `${targetWidth}px`;
                        modalContent.style.height = `${targetHeight}px`;
                        
                        setTimeout(() => {
                            animationInProgress = false;
                            modalContent.style.transition = '';
                        }, 300);
                    });
                }, 50);
            }
        }
        
        // 渲染批次内容（包含图片类型标签和导航箭头）
        function renderBatchContent() {
            const modalContent = qs('.modal-content');
            if (!currentBatchData) return;
            
            const batch = currentBatchData;
            
            // 优先使用 JSON 中的 timestamp，其次使用 mtime
            let time = '未知';
            if (batch.timestamp) {
                // timestamp 格式: 20260430_222827_530 或 ISO 格式
                if (batch.timestamp.includes('T')) {
                    // ISO 格式: 2026-04-30T22:28:27.530
                    time = new Date(batch.timestamp).toLocaleString('zh-CN');
                } else if (batch.timestamp.includes('_')) {
                    // 短格式: 20260430_222827_530
                    const parts = batch.timestamp.split('_');
                    if (parts.length >= 2) {
                        const dateStr = parts[0];
                        const timeStr = parts[1];
                        const year = dateStr.substring(0, 4);
                        const month = dateStr.substring(4, 6);
                        const day = dateStr.substring(6, 8);
                        const hour = timeStr.substring(0, 2);
                        const minute = timeStr.substring(2, 4);
                        const second = timeStr.substring(4, 6);
                        time = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
                    }
                }
            } else if (batch.mtime) {
                time = new Date(batch.mtime * 1000).toLocaleString('zh-CN');
            }
            
            // 构建所有可浏览的图片列表（按优先级：annotated(带缺陷框) > heatmap > original > crops）
            const allImages = [];
            if (batch.images && batch.images.annotated) allImages.push({type: 'annotated', label: '缺陷框选图', filename: batch.images.annotated});
            if (batch.images && batch.images.heatmap) allImages.push({type: 'heatmap', label: '热力图', filename: batch.images.heatmap});
            if (batch.images && batch.images.original) allImages.push({type: 'original', label: '原图', filename: batch.images.original});
            if (batch.crops && batch.crops.length > 0) {
                batch.crops.forEach((crop, idx) => {
                    allImages.push({type: 'crop', label: `缺陷${idx + 1}: ${crop.class_name}`, filename: crop.filename, index: idx});
                });
            }
            
            // 找到当前图片在列表中的索引
            let currentIndex = -1;
            if (currentImageType === 'crop') {
                currentIndex = allImages.findIndex(img => img.type === 'crop' && img.index === currentCropIndex);
            } else {
                currentIndex = allImages.findIndex(img => img.type === currentImageType);
            }
            
            // 获取当前图片URL
            let imageUrl = '';
            let currentLabel = '';
            if (currentIndex >= 0) {
                imageUrl = `/captures/${allImages[currentIndex].filename}`;
                currentLabel = allImages[currentIndex].label;
            }
            
            // 创建内部布局容器
            const innerContainer = document.createElement('div');
            innerContainer.className = 'modal-inner';
            
            // 图片区域（带左右箭头和关闭按钮）
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'modal-image-wrapper';
            
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = currentLabel;
            imageWrapper.appendChild(img);
            
            // 右上角关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close-btn';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = closeBatchModal;
            imageWrapper.appendChild(closeBtn);
            
            // 左右箭头
            const arrowsDiv = document.createElement('div');
            arrowsDiv.className = 'nav-arrows';
            
            const hasPrev = currentIndex > 0;
            const hasNext = currentIndex < allImages.length - 1;
            
            arrowsDiv.innerHTML = `
                <button class="nav-arrow" onclick="navigateToImage(${currentIndex - 1})" ${!hasPrev ? 'disabled' : ''}>❮</button>
                <button class="nav-arrow" onclick="navigateToImage(${currentIndex + 1})" ${!hasNext ? 'disabled' : ''}>❯</button>
            `;
            imageWrapper.appendChild(arrowsDiv);
            
            // 信息区域
            const infoDiv = document.createElement('div');
            infoDiv.className = 'modal-info';
            
            // 缺陷详情标题（固定在顶部，不随内容滚动）
            const title = document.createElement('h3');
            title.className = 'defect-detail-title';
            title.textContent = '缺陷详情';
            infoDiv.appendChild(title);
            
            // 可滚动的内容区域
            const contentDiv = document.createElement('div');
            contentDiv.className = 'info-content';
            
            // 卡片1：批次信息
            const card1 = document.createElement('div');
            card1.className = 'info-card';
            
            // 获取检测参数
            const detectionParams = batch.detection_params || {};
            const confThreshold = detectionParams.conf_threshold !== undefined ? (detectionParams.conf_threshold * 100).toFixed(0) + '%' : 'N/A';
            const iouThreshold = detectionParams.iou_threshold !== undefined ? (detectionParams.iou_threshold * 100).toFixed(0) + '%' : 'N/A';
            
            card1.innerHTML = `
                <h4>基本信息</h4>
                <div class="info-row">
                    <span class="label">批次ID:</span>
                    <span class="value" style="word-break: break-all;">${batch.batch_id}</span>
                </div>
                <div class="info-row">
                    <span class="label">检测时间:</span>
                    <span class="value">${time}</span>
                </div>
                <div class="info-row">
                    <span class="label">置信度阈值:</span>
                    <span class="value">${confThreshold}</span>
                </div>
                <div class="info-row">
                    <span class="label">IOU阈值:</span>
                    <span class="value">${iouThreshold}</span>
                </div>
            `;
            contentDiv.appendChild(card1);
            
            // 新增: 截图详情卡片 (仅摄像头会话显示)
            if (batch.is_camera_session && batch.frames && batch.frames.length > 0) {
                const cardFrames = document.createElement('div');
                cardFrames.className = 'info-card';
                cardFrames.id = 'framesDetailCard';
                cardFrames.innerHTML = `
                    <h4>截图详情</h4>
                    <div class="frame-selector">
                        <label style="font-size: 13px; color: var(--text-secondary); font-weight: 500; margin-right: 8px;">选择帧:</label>
                        <input type="range" id="frameSlider" min="0" max="${batch.frames.length - 1}" value="0" style="flex: 1; margin: 0 8px;" />
                        <span id="frameNumber" style="font-size: 13px; font-weight: 600; min-width: 60px;">1 / ${batch.frames.length}</span>
                    </div>
                `;
                contentDiv.appendChild(cardFrames);
            }
                        
            // 卡片2：缺陷信息
            const card2 = document.createElement('div');
            card2.className = 'info-card';
            
            // 优先使用batch.defects（从JSON读取），兼容旧数据batch.crops
            const defects = batch.defects && batch.defects.length > 0 ? batch.defects : (batch.crops || []);
            
            // 统计缺陷类型和数量
            const defectStats = {};
            defects.forEach(defect => {
                const clsName = defect.class_name || '未知';
                if (!defectStats[clsName]) {
                    defectStats[clsName] = { count: 0, confidences: [] };
                }
                defectStats[clsName].count++;
                // 从缺陷数据中获取置信度
                if (defect.confidence !== undefined) {
                    defectStats[clsName].confidences.push(defect.confidence);
                } else {
                    defectStats[clsName].confidences.push(0.85); // 兼容旧数据
                }
            });
            
            const totalDefects = defects.length;
            const defectTypes = Object.keys(defectStats).length;
            
            card2.innerHTML = `
                <h4>缺陷统计</h4>
                <div class="info-row">
                    <span class="label">缺陷类型:</span>
                    <span class="value">${defectTypes} 种</span>
                </div>
                <div class="info-row">
                    <span class="label">缺陷个数:</span>
                    <span class="value">${totalDefects} 个</span>
                </div>
                ${totalDefects > 0 ? `
                <div style="margin-top: var(--spacing-sm); margin-bottom: var(--spacing-xs);">
                    <strong style="font-size: 13px; color: var(--text-secondary); font-weight: 600;">缺陷列表：</strong>
                </div>
                <div class="defect-list">
                    ${defects.map((defect, idx) => {
                        const clsName = defect.class_name || '未知';
                        const conf = defect.confidence !== undefined ? (defect.confidence * 100).toFixed(1) : 'N/A';
                        const bbox = defect.bbox || [];
                        const bboxStr = bbox.length === 4 ? `(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]})` : 'N/A';
                        return `
                            <div class="defect-item" style="flex-direction: column; align-items: flex-start; padding: var(--spacing-sm); background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-xs); border-bottom: none;">
                                <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: var(--spacing-xs); align-items: center;">
                                    <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">缺陷 #${defect.index !== undefined ? defect.index : idx}</span>
                                    <span style="font-size: 13px; font-weight: 600; color: var(--primary);">${conf}%</span>
                                </div>
                                <div style="font-size: 13px; color: var(--text-primary); width: 100%;">
                                    <div style="margin-bottom: 2px;">
                                        <span style="color: var(--text-secondary); font-weight: 500;">类型：</span> 
                                        <span style="color: var(--text-primary); font-weight: 500;">${clsName}</span>
                                    </div>
                                    <div>
                                        <span style="color: var(--text-secondary); font-weight: 500;">位置：</span> 
                                        <span style="color: var(--text-primary); font-weight: 500; font-family: 'HarmonyOS Sans', 'HarmonyOS Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px;">${bboxStr}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ` : ''}
            `;
            contentDiv.appendChild(card2);
                        
            // 卡片3：AI分析建议
            const card3 = document.createElement('div');
            card3.className = 'info-card';
            
            // 先获取AI分析结果（从后端API返回的currentBatchData中获取）
            console.log('[检测记录详情] 批次数据:', batch);
            console.log('[检测记录详情] ai_analysis字段:', batch.ai_analysis);
            let aiAnalysis = batch.ai_analysis ? batch.ai_analysis.analysis : null;
            
            // 清理AI输出文本
            if (aiAnalysis) {
                aiAnalysis = cleanAIOutput(aiAnalysis);
                // 将Markdown加粗标记**转换为HTML的<strong>标签
                aiAnalysis = aiAnalysis
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');
            }
            
            console.log('[检测记录详情] 提取的AI分析文本:', aiAnalysis ? '有内容' : '无内容');
            
            // 添加卡片头部（标题 + 按钮）
            const cardHeader = document.createElement('div');
            cardHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-sm);';
            
            const cardTitle = document.createElement('h4');
            cardTitle.textContent = 'AI检测建议';
            cardTitle.style.cssText = 'margin: 0;';
            
            // 创建“开始AI分析”按钮
            const analyzeBtn = document.createElement('button');
            analyzeBtn.className = 'btn primary';
            analyzeBtn.textContent = '开始AI分析';
            analyzeBtn.style.cssText = 'padding: 6px 12px; font-size: 12px;';
            
            // 如果已有AI分析结果，隐藏按钮
            if (aiAnalysis) {
                analyzeBtn.style.display = 'none';
            }
            
            // 按钮点击事件
            analyzeBtn.addEventListener('click', async () => {
                // 检查是否有图片和缺陷数据
                console.log('[AI分析] 检查数据 - batch.images:', batch.images);
                console.log('[AI分析] 检查数据 - batch.defects:', batch.defects);
                console.log('[AI分析] 检查数据 - batch.detection_params:', batch.detection_params);
                
                const defects = batch.defects || batch.detections || [];
                console.log('[AI分析] 使用的缺陷数据长度:', defects.length);
                
                if (defects.length === 0 || !batch.images || !batch.images.annotated) {
                    console.error('[AI分析] 数据检查失败:', {
                        hasDefects: defects.length > 0,
                        hasImages: !!batch.images,
                        hasAnnotated: !!(batch.images && batch.images.annotated)
                    });
                    showAlert('该批次缺少检测数据，无法进行AI分析');
                    return;
                }
                
                // 禁用按钮
                analyzeBtn.disabled = true;
                analyzeBtn.textContent = '分析中...';
                
                try {
                    // 加载标注图片并转换为base64
                    const imageUrl = `/captures/${batch.images.annotated}`;
                    const imgResponse = await fetch(imageUrl);
                    const imgBlob = await imgResponse.blob();
                    const reader = new FileReader();
                    
                    const imageBase64 = await new Promise((resolve, reject) => {
                        reader.onloadend = () => {
                            // 去掉data:image/jpeg;base64,前缀
                            const base64 = reader.result.split(',')[1];
                            resolve(base64);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(imgBlob);
                    });
                    
                    console.log('[AI分析] 图片加载完成，开始调用API');
                    
                    // 调用图片理解API（与首页一致）
                    const analysisRes = await fetch('/analyze_with_llm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image_base64: imageBase64,
                            detections: defects,  // 使用上面已获取的defects变量
                            model_type: 'yolo',
                            conf_threshold: parseFloat(batch.detection_params?.conf_threshold) || 0.25,
                            iou_threshold: parseFloat(batch.detection_params?.iou_threshold) || 0.45,
                            batch_id: batch.batch_id || null
                        })
                    });
                    
                    const analysisData = await analysisRes.json();
                    
                    if (analysisData.success) {
                        // 清理并格式化AI输出
                        const cleanedText = cleanAIOutput(analysisData.analysis);
                        const formattedHtml = cleanedText
                            .replace(/\n/g, '<br>')
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>');
                        
                        // 更新卡片内容
                        const aiSuggestionDiv = card3.querySelector('.ai-suggestion-container');
                        if (aiSuggestionDiv) {
                            const now = new Date().toLocaleString('zh-CN');
                            aiSuggestionDiv.innerHTML = `
                                <div class="ai-suggestion" style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
                                    ${formattedHtml}
                                </div>
                                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-secondary);">
                                    分析时间: ${now}
                                </div>
                            `;
                        }
                        
                        // 隐藏按钮
                        analyzeBtn.style.display = 'none';
                        
                        // 更新本地数据，保存分析结果
                        batch.ai_analysis = {
                            timestamp: new Date().toISOString(),
                            analysis: analysisData.analysis
                        };
                        
                        console.log('[AI分析] ✅ 分析完成并已保存');
                    } else {
                        throw new Error(analysisData.error || '分析失败');
                    }
                } catch (error) {
                    console.error('[AI分析] ❌ 错误:', error);
                    showAlert('AI分析失败: ' + error.message, 'AI分析错误');
                } finally {
                    // 恢复按钮状态
                    analyzeBtn.disabled = false;
                    analyzeBtn.textContent = '开始AI分析';
                }
            });
            
            cardHeader.appendChild(cardTitle);
            cardHeader.appendChild(analyzeBtn);
                        
            card3.innerHTML = `
                <div class="ai-suggestion-container">
                    ${aiAnalysis ? `
                        <div class="ai-suggestion" style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
                            ${aiAnalysis.replace(/\n/g, '<br>')}
                        </div>
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-secondary);">
                            分析时间: ${batch.ai_analysis.timestamp ? new Date(batch.ai_analysis.timestamp).toLocaleString('zh-CN') : '未知'}
                        </div>
                    ` : `
                        <div class="no-ai-message">
                            <div style="font-size: 32px; margin-bottom: var(--spacing-sm);"></div>
                            <div>暂未进行AI智能分析</div>
                            <div style="font-size: 12px; margin-top: var(--spacing-xs);">点击"开始AI分析"按钮获取建议</div>
                        </div>
                    `}
                </div>
            `;
                        
            // 将头部和内容添加到卡片
            card3.prepend(cardHeader);
            contentDiv.appendChild(card3);
                        
            // 将内容区域添加到infoDiv
            infoDiv.appendChild(contentDiv);
            
            // 新增: 帧选择器事件监听 (仅摄像头会话)
            if (batch.is_camera_session && batch.frames && batch.frames.length > 0) {
                const frameSlider = document.getElementById('frameSlider');
                const frameNumber = document.getElementById('frameNumber');
                
                // 存储当前批次数据到全局变量,供帧切换时使用
                window.currentCameraBatch = batch;
                
                frameSlider.addEventListener('input', async (e) => {
                    const frameIndex = parseInt(e.target.value);
                    frameNumber.textContent = `${frameIndex + 1} / ${batch.frames.length}`;
                    
                    // 加载对应帧的详细信息
                    const frameData = batch.frames[frameIndex];
                    await loadFrameDetail(frameData.batch_id);
                });
            }
            
            innerContainer.appendChild(imageWrapper);
            innerContainer.appendChild(infoDiv);
            
            // 添加操作按钮
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'modal-actions';
            actionsDiv.innerHTML = `
                <button class="modal-btn download" onclick="downloadCurrentImage()">下载</button>
                <button class="modal-btn delete" onclick="deleteFromModal()">删除</button>
            `;
            infoDiv.appendChild(actionsDiv);
            
            // 清空并添加新结构
            modalContent.innerHTML = '';
            modalContent.appendChild(innerContainer);
        }
        
        // 导航到指定索引的图片
        window.navigateToImage = navigateToImage;
        function navigateToImage(index) {
            if (animationInProgress || !currentBatchData) return;
            
            // 构建所有可浏览的图片列表（按优先级：annotated(带缺陷框) > heatmap > original > crops）
            const batch = currentBatchData;
            const allImages = [];
            if (batch.images.annotated) allImages.push({type: 'annotated'});
            if (batch.images.heatmap) allImages.push({type: 'heatmap'});
            if (batch.images.original) allImages.push({type: 'original'});
            if (batch.crops && batch.crops.length > 0) {
                batch.crops.forEach((crop, idx) => {
                    allImages.push({type: 'crop', index: idx});
                });
            }
            
            // 边界检查
            if (index < 0 || index >= allImages.length) return;
            
            const targetImage = allImages[index];
            currentImageType = targetImage.type;
            if (targetImage.type === 'crop') {
                currentCropIndex = targetImage.index;
            }
            
            renderBatchContent();
        }
        
        // 新增: 加载帧详情 (用于摄像头会话的帧切换)
        async function loadFrameDetail(batchId) {
            try {
                const res = await fetch(`/batch_detail/${batchId}`);
                const frameData = await res.json();
                
                if (frameData.error) {
                    console.error('加载帧详情失败:', frameData.error);
                    return;
                }
                
                // 更新缺陷统计
                updateDefectStats(frameData);
                
            } catch (err) {
                console.error('加载帧详情失败:', err);
            }
        }
        
        // 新增: 更新缺陷统计 (提取为独立函数,支持帧切换)
        function updateDefectStats(data) {
            // 查找缺陷统计卡片
            const card2 = document.querySelector('.info-card:nth-child(2)');
            if (!card2) return;
            
            const defects = data.defects && data.defects.length > 0 ? data.defects : (data.crops || []);
            
            // 统计缺陷类型和数量
            const defectStats = {};
            defects.forEach(defect => {
                const clsName = defect.class_name || '未知';
                if (!defectStats[clsName]) {
                    defectStats[clsName] = { count: 0, confidences: [] };
                }
                defectStats[clsName].count++;
                if (defect.confidence !== undefined) {
                    defectStats[clsName].confidences.push(defect.confidence);
                } else {
                    defectStats[clsName].confidences.push(0.85);
                }
            });
            
            const totalDefects = defects.length;
            const defectTypes = Object.keys(defectStats).length;
            
            // 重新渲染缺陷统计卡片
            card2.innerHTML = `
                <h4>缺陷统计</h4>
                <div class="info-row">
                    <span class="label">缺陷类型:</span>
                    <span class="value">${defectTypes} 种</span>
                </div>
                <div class="info-row">
                    <span class="label">缺陷个数:</span>
                    <span class="value">${totalDefects} 个</span>
                </div>
                ${totalDefects > 0 ? `
                <div style="margin-top: var(--spacing-sm); margin-bottom: var(--spacing-xs);">
                    <strong style="font-size: 13px; color: var(--text-secondary); font-weight: 600;">缺陷列表：</strong>
                </div>
                <div class="defect-list">
                    ${defects.map((defect, idx) => {
                        const clsName = defect.class_name || '未知';
                        const conf = defect.confidence !== undefined ? (defect.confidence * 100).toFixed(1) + '%' : 'N/A';
                        return `
                            <div class="defect-item">
                                <span class="defect-index">#${idx + 1}</span>
                                <span class="defect-name">${clsName}</span>
                                <span class="defect-conf">${conf}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ` : '<div style="text-align: center; padding: var(--spacing-md); color: var(--text-secondary);">无缺陷</div>'}
            `;
        }
        
        function showModal(item, triggerElement) {
            // 如果在选择模式下，不打开模态框
            if (selectionMode) return;
            
            currentModalItem = item;
            animationInProgress = true;
            
            const modal = document.getElementById('imageModal');
            const modalImg = document.getElementById('modalImage');
            const modalInfo = document.getElementById('modalInfo');
            const modalContent = qs('.modal-content');
            
            // 记录小图卡片的精确位置和尺寸（使用Math.round避免亚像素）
            const cardRect = triggerElement.getBoundingClientRect();
            originalCardRect = {
                left: Math.round(cardRect.left),
                top: Math.round(cardRect.top),
                width: Math.round(cardRect.width),
                height: Math.round(cardRect.height)
            };
            
            const cls = item.class_name || (item.cls !== null ? `类别 ${item.cls}` : '未知');
            const time = item.ts ? new Date(item.mtime * 1000).toLocaleString('zh-CN') : '未知';
            
            // 设置内容
            modalImg.src = item.url;
            modalImg.alt = item.name;
            
            modalInfo.innerHTML = `
                <div class="detail-row">
                    <span class="label">文件名:</span>
                    <span class="value">${item.name}</span>
                </div>
                <div class="detail-row">
                    <span class="label">缺陷类别:</span>
                    <span class="value">${cls}</span>
                </div>
                <div class="detail-row">
                    <span class="label">检测时间:</span>
                    <span class="value">${time}</span>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn download" onclick="downloadCurrentImage()">📥 下载</button>
                    <button class="modal-btn delete" onclick="deleteFromModal()">🗑️ 删除</button>
                </div>
            `;
            
            // 显示模态框背景
            modal.classList.add('active');
            document.body.classList.add('modal-open'); // 添加页面缩放效果
            
            // 锁定滚动但保持页面宽度不变（防止背景元素移动）
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = `${scrollbarWidth}px`;
            
            // 初始状态：将模态框定位到小图卡片的位置
            modalContent.style.left = `${originalCardRect.left}px`;
            modalContent.style.top = `${originalCardRect.top}px`;
            modalContent.style.width = `${originalCardRect.width}px`;
            modalContent.style.height = `${originalCardRect.height}px`;
            modalContent.style.borderRadius = 'var(--radius-lg)';
            modalContent.style.transform = 'none';
            
            // 创建内部布局容器
            const innerContainer = document.createElement('div');
            innerContainer.className = 'modal-inner';
            
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'modal-image-wrapper';
            imageWrapper.appendChild(modalImg.cloneNode(false));
            imageWrapper.querySelector('img').src = item.url;
            
            const infoDiv = document.createElement('div');
            infoDiv.id = 'modalInfo';
            infoDiv.className = 'modal-info';
            infoDiv.innerHTML = modalInfo.innerHTML;
            
            innerContainer.appendChild(imageWrapper);
            innerContainer.appendChild(infoDiv);
            
            // 清空并添加新结构
            modalContent.innerHTML = '';
            modalContent.appendChild(innerContainer);
            
            // 等待图片加载
            const img = innerContainer.querySelector('img');
            img.onload = () => {
                // 计算目标尺寸和位置（缩小到70%，使用Math.round确保整数像素）
                requestAnimationFrame(() => {
                    const targetWidth = Math.round(Math.min(window.innerWidth * 0.7, 900)); // 最大900px
                    const targetHeight = Math.round(Math.min(window.innerHeight * 0.7, 600)); // 最大600px
                    const targetLeft = Math.round((window.innerWidth - targetWidth) / 2);
                    const targetTop = Math.round((window.innerHeight - targetHeight) / 2);
                    
                    // 应用过渡动画
                    modalContent.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    modalContent.style.left = `${targetLeft}px`;
                    modalContent.style.top = `${targetTop}px`;
                    modalContent.style.width = `${targetWidth}px`;
                    modalContent.style.height = `${targetHeight}px`;
                    modalContent.style.borderRadius = 'var(--radius-xl)';
                    
                    setTimeout(() => {
                        animationInProgress = false;
                        modalContent.style.transition = '';
                    }, 400);
                });
            };
        }
        
        function closeModal() {
            if (animationInProgress || !originalCardRect) return;
            
            animationInProgress = true;
            
            const modal = document.getElementById('imageModal');
            const modalContent = qs('.modal-content');
            
            // 检查动画是否被禁用
            const isAnimationDisabled = document.body.classList.contains('no-animations');
            
            if (isAnimationDisabled) {
                // 动画禁用时，立即隐藏模态框
                modal.classList.remove('active');
                document.body.classList.remove('modal-open'); // 移除页面缩放效果
                modal.style.visibility = 'hidden';
                
                document.body.style.overflow = 'auto';
                document.body.style.paddingRight = '';
                currentModalItem = null;
                originalCardRect = null;
                animationInProgress = false;
                
                // 重置样式
                setTimeout(() => {
                    modalContent.style.background = 'transparent';
                    modalContent.style.left = '-9999px';
                    modalContent.style.top = '-9999px';
                    modalContent.innerHTML = '<div class="modal-image-wrapper"><img id="modalImage" src="" alt="" /></div><div id="modalInfo" class="modal-info"></div>';
                    modalContent.style.width = '';
                    modalContent.style.height = '';
                    modalContent.style.borderRadius = '';
                    modalContent.style.opacity = '';
                    modalContent.style.transition = '';
                    modal.style.backgroundColor = '';
                    modal.style.backdropFilter = '';
                    modal.style.webkitBackdropFilter = '';
                    modal.style.visibility = '';
                    setTimeout(() => {
                        modalContent.style.background = '';
                        modalContent.style.left = '';
                        modalContent.style.top = '';
                    }, 10);
                }, 50);
            } else {
                // FLIP动画: 直接从当前位置动画到小图卡片位置
                modalContent.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                modalContent.style.left = `${originalCardRect.left}px`;
                modalContent.style.top = `${originalCardRect.top}px`;
                modalContent.style.width = `${originalCardRect.width}px`;
                modalContent.style.height = `${originalCardRect.height}px`;
                modalContent.style.borderRadius = 'var(--radius-lg)';
                
                // 立即移除页面缩放效果，让背景与卡片关闭动画同步进行
                document.body.classList.remove('modal-open');
                
                // 背景色渐变 + 模糊度渐变
                modal.style.backgroundColor = 'rgba(0, 0, 0, 0)';
                modal.style.backdropFilter = 'blur(0px)';
                modal.style.webkitBackdropFilter = 'blur(0px)';
                
                // 动画结束后清理
                setTimeout(() => {
                    // 隐藏模态框
                    modal.classList.remove('active');
                    modal.style.visibility = 'hidden';
                    
                    document.body.style.overflow = 'auto';
                    document.body.style.paddingRight = '';
                    currentModalItem = null;
                    originalCardRect = null;
                    animationInProgress = false;
                    
                    // 重置样式(在隐藏状态下进行)
                    setTimeout(() => {
                        modalContent.style.background = 'transparent';
                        modalContent.style.left = '-9999px';
                        modalContent.style.top = '-9999px';
                        modalContent.innerHTML = '<div class="modal-image-wrapper"><img id="modalImage" src="" alt="" /></div><div id="modalInfo" class="modal-info"></div>';
                        modalContent.style.width = '';
                        modalContent.style.height = '';
                        modalContent.style.borderRadius = '';
                        modalContent.style.opacity = '';
                        modalContent.style.transition = '';
                        modal.style.backgroundColor = '';
                        modal.style.backdropFilter = '';
                        modal.style.webkitBackdropFilter = '';
                        modal.style.visibility = '';
                        setTimeout(() => {
                            modalContent.style.background = '';
                            modalContent.style.left = '';
                            modalContent.style.top = '';
                        }, 10);
                    }, 50);
                }, 400);
            }
        }
        
        window.closeModalOnBackground = closeModalOnBackground;
        function closeModalOnBackground(event) {
            // 只有点击背景（modal本身）才关闭，点击内容不关闭
            if (event.target === event.currentTarget) {
                closeBatchModal();
            }
        }
        
        // 下载当前批次的所有图片
        async function downloadCurrentBatch() {
            if (!currentBatchData) return;
            
            const allFiles = Object.values(currentBatchData.images).concat(
                currentBatchData.crops.map(c => c.filename)
            );
            
            for (const filename of allFiles) {
                const link = document.createElement('a');
                link.href = `/captures/${filename}`;
                link.download = filename;
                link.click();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // 删除当前批次
        async function deleteCurrentBatch() {
            if (!currentBatchData || !confirm(`确定要删除整个批次 "${currentBatchData.batch_id}" 吗？`)) {
                return;
            }
            
            try {
                const allFilenames = Object.values(currentBatchData.images).concat(
                    currentBatchData.crops.map(c => c.filename)
                );
                
                const res = await fetch('/batch_delete_captures', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filenames: allFilenames })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    // 直接从后端重新加载数据，页面自然刷新
                    await loadCaptures();
                    
                    // 关闭模态框
                    closeBatchModal();
                } else {
                    showAlert('删除失败: ' + data.error, '删除错误');
                }
            } catch (err) {
                showAlert('删除失败: ' + err.message, '删除错误');
            }
        }
        
        // 立即关闭模态框（不播放动画）
        function hideBatchModalImmediately() {
            const modal = document.getElementById('imageModal');
            modal.classList.remove('active');
            document.body.classList.remove('modal-open'); // 移除页面缩放效果
            modal.style.visibility = 'hidden';
            modal.style.backgroundColor = '';
            modal.style.backdropFilter = '';
            modal.style.webkitBackdropFilter = '';
            
            document.body.style.overflow = 'auto';
            document.body.style.paddingRight = '';
            currentBatchId = null;
            currentBatchData = null;
            currentImageType = 'original';
            currentCropIndex = 0;
            originalCardRect = null;
            animationInProgress = false;
            
            // 重置模态框内容样式
            const modalContent = qs('.modal-content');
            if (modalContent) {
                modalContent.style = '';
                const innerContainer = modalContent.querySelector('.modal-inner');
                if (innerContainer) {
                    innerContainer.classList.remove('compact-layout');
                }
            }
        }
        
        // 关闭批次模态框
        function closeBatchModal() {
            if (animationInProgress || !originalCardRect) return;
            
            animationInProgress = true;
            
            const modal = document.getElementById('imageModal');
            const modalContent = qs('.modal-content');
            const innerContainer = modalContent.querySelector('.modal-inner');
            
            // 检查动画是否被禁用
            const isAnimationDisabled = document.body.classList.contains('no-animations');
            
            if (isAnimationDisabled) {
                // 动画禁用时，立即隐藏模态框
                modal.classList.remove('active');
                document.body.classList.remove('modal-open'); // 移除页面缩放效果
                modal.style.visibility = 'hidden';
                
                document.body.style.overflow = 'auto';
                document.body.style.paddingRight = '';
                currentBatchId = null;
                currentBatchData = null;
                currentImageType = 'original';
                currentCropIndex = 0;
                originalCardRect = null;
                animationInProgress = false;
                
                // 重置样式
                setTimeout(() => {
                    modalContent.style.background = 'transparent';
                    modalContent.style.left = '-9999px';
                    modalContent.style.top = '-9999px';
                    modalContent.innerHTML = '<div class="modal-image-wrapper"><img id="modalImage" src="" alt="" /></div><div id="modalInfo" class="modal-info"></div>';
                    modalContent.style.width = '';
                    modalContent.style.height = '';
                    modalContent.style.borderRadius = '';
                    modalContent.style.opacity = '';
                    modalContent.style.transition = '';
                    modalContent.style.clipPath = '';
                    modal.style.backgroundColor = '';
                    modal.style.backdropFilter = '';
                    modal.style.webkitBackdropFilter = '';
                    modal.style.visibility = '';
                    setTimeout(() => {
                        modalContent.style.background = '';
                        modalContent.style.left = '';
                        modalContent.style.top = '';
                    }, 10);
                }, 50);
            } else {
                // 同时触发布局切换和尺寸缩小，所有过渡都是平滑的
                if (innerContainer) {
                    innerContainer.classList.add('compact-layout');
                }
                modalContent.style.borderRadius = 'var(--radius-lg)';
                modalContent.style.clipPath = 'inset(0 round var(--radius-lg))';
                modalContent.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                modalContent.style.left = `${originalCardRect.left}px`;
                modalContent.style.top = `${originalCardRect.top}px`;
                modalContent.style.width = `${originalCardRect.width}px`;
                modalContent.style.height = `${originalCardRect.height}px`;
                
                // 立即移除页面缩放效果，让背景与卡片关闭动画同步进行
                document.body.classList.remove('modal-open');
                
                // 背景色渐变 + 模糊度渐变
                modal.style.backgroundColor = 'rgba(0, 0, 0, 0)';
                modal.style.backdropFilter = 'blur(0px)';
                modal.style.webkitBackdropFilter = 'blur(0px)';
                
                // 动画结束后清理
                setTimeout(() => {
                    // 隐藏模态框
                    modal.classList.remove('active');
                    modal.style.visibility = 'hidden';
                    
                    document.body.style.overflow = 'auto';
                    document.body.style.paddingRight = '';
                    currentBatchId = null;
                    currentBatchData = null;
                    currentImageType = 'original';
                    currentCropIndex = 0;
                    originalCardRect = null;
                    animationInProgress = false;
                    
                    // 重置样式(在隐藏状态下进行)
                    setTimeout(() => {
                        modalContent.style.background = 'transparent';
                        modalContent.style.left = '-9999px';
                        modalContent.style.top = '-9999px';
                        modalContent.innerHTML = '<div class="modal-image-wrapper"><img id="modalImage" src="" alt="" /></div><div id="modalInfo" class="modal-info"></div>';
                        modalContent.style.width = '';
                        modalContent.style.height = '';
                        modalContent.style.borderRadius = '';
                        modalContent.style.opacity = '';
                        modalContent.style.transition = '';
                        modalContent.style.clipPath = '';
                        modal.style.backgroundColor = '';
                        modal.style.backdropFilter = '';
                        modal.style.webkitBackdropFilter = '';
                        modal.style.visibility = '';
                        setTimeout(() => {
                            modalContent.style.background = '';
                            modalContent.style.left = '';
                            modalContent.style.top = '';
                        }, 10);
                    }, 50);
                }, 300);
            }
        }
        
        // 新增: 下载当前显示的图片（单张）
        window.downloadCurrentImage = downloadCurrentImage;
        async function downloadCurrentImage() {
            if (!currentBatchData || !currentImageType) return;
            
            try {
                let filename = '';
                
                if (currentImageType === 'crop') {
                    // 下载裁剪图
                    if (currentBatchData.crops && currentBatchData.crops[currentCropIndex]) {
                        filename = currentBatchData.crops[currentCropIndex].filename;
                    }
                } else {
                    // 下载原图/标注图/热力图
                    if (currentBatchData.images && currentBatchData.images[currentImageType]) {
                        filename = currentBatchData.images[currentImageType];
                    }
                }
                
                if (!filename) {
                    showAlert('当前图片不存在');
                    return;
                }
                
                // 创建下载链接
                const link = document.createElement('a');
                link.href = `/captures/${filename}`;
                link.download = filename;
                link.click();
            } catch (err) {
                console.error('下载失败:', err);
                showAlert('下载失败: ' + err.message, '下载错误');
            }
        }
        
        // 新增: 从模态框删除当前批次
        window.deleteFromModal = deleteFromModal;
        async function deleteFromModal() {
            if (!currentBatchData) return;
            
            // 显示确认弹窗
            const confirmModal = document.getElementById('deleteConfirmModal');
            const messageText = document.getElementById('deleteMessageText');
            
            messageText.textContent = `确定要删除批次 "${currentBatchData.batch_id}" 吗？`;
            confirmModal.classList.add('active'); // 使用active class而不是style.display
            
            // 存储删除回调
            window.deleteModalCallback = async () => {
                try {
                    // 获取所有文件
                    const allFilenames = [];
                    if (currentBatchData.images) {
                        allFilenames.push(...Object.values(currentBatchData.images));
                    }
                    if (currentBatchData.crops) {
                        allFilenames.push(...currentBatchData.crops.map(c => c.filename));
                    }
                    
                    const res = await fetch('/batch_delete_captures', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filenames: allFilenames })
                    });
                    
                    const data = await res.json();
                    
                    if (data.success) {
                        // 直接从后端重新加载数据，页面自然刷新
                        await loadCaptures();
                        
                        // 关闭模态框
                        closeBatchModal();
                    } else {
                        showAlert('删除失败: ' + data.error, '删除错误');
                    }
                } catch (err) {
                    console.error('删除失败:', err);
                    showAlert('删除失败: ' + err.message, '删除错误');
                }
            };
        }
        
        // 点击模态框外部关闭
        document.addEventListener('click', (e) => {
            const modal = document.getElementById('imageModal');
            if (e.target === modal) {
                closeBatchModal();
            }
        });
        
        // ESC键关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeBatchModal();
            }
            // 左右箭头键导航（仅在批次模态框打开时）
            if (currentBatchData && !animationInProgress) {
                if (e.key === 'ArrowLeft') {
                    // 找到当前索引（按优先级：annotated(带缺陷框) > heatmap > original > crops）
                    const batch = currentBatchData;
                    const allImages = [];
                    if (batch.images.annotated) allImages.push({type: 'annotated'});
                    if (batch.images.heatmap) allImages.push({type: 'heatmap'});
                    if (batch.images.original) allImages.push({type: 'original'});
                    if (batch.crops && batch.crops.length > 0) {
                        batch.crops.forEach((crop, idx) => {
                            allImages.push({type: 'crop', index: idx});
                        });
                    }
                    
                    let currentIndex = -1;
                    if (currentImageType === 'crop') {
                        currentIndex = allImages.findIndex(img => img.type === 'crop' && img.index === currentCropIndex);
                    } else {
                        currentIndex = allImages.findIndex(img => img.type === currentImageType);
                    }
                    
                    if (currentIndex > 0) {
                        navigateToImage(currentIndex - 1);
                    }
                } else if (e.key === 'ArrowRight') {
                    // 找到当前索引（按优先级：annotated(带缺陷框) > heatmap > original > crops）
                    const batch = currentBatchData;
                    const allImages = [];
                    if (batch.images.annotated) allImages.push({type: 'annotated'});
                    if (batch.images.heatmap) allImages.push({type: 'heatmap'});
                    if (batch.images.original) allImages.push({type: 'original'});
                    if (batch.crops && batch.crops.length > 0) {
                        batch.crops.forEach((crop, idx) => {
                            allImages.push({type: 'crop', index: idx});
                        });
                    }
                    
                    let currentIndex = -1;
                    if (currentImageType === 'crop') {
                        currentIndex = allImages.findIndex(img => img.type === 'crop' && img.index === currentCropIndex);
                    } else {
                        currentIndex = allImages.findIndex(img => img.type === currentImageType);
                    }
                    
                    if (currentIndex < allImages.length - 1) {
                        navigateToImage(currentIndex + 1);
                    }
                }
            }
        });
        
        // ==================== 设置面板控制 ====================
        // 使用DOMContentLoaded确保所有DOM元素都已加载
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
            const settingsBtn = document.querySelector('.settings-btn');
            const settingsPanel = document.getElementById('settingsPanel');
            const settingsOverlay = document.getElementById('settingsOverlay');
            let isSettingsOpen = false;
            
            if (!settingsBtn || !settingsPanel || !settingsOverlay) {
                console.error('[设置面板] 初始化失败：找不到必要的DOM元素');
                return;
            }
            
            console.log('[设置面板] ✅ 初始化成功');
            
            // 打开设置面板
            function openSettings() {
                isSettingsOpen = true;
                document.body.classList.add('settings-open');
                settingsPanel.classList.add('active');
                settingsOverlay.classList.add('active');
                settingsBtn.classList.add('active');
            }
            
            // 关闭设置面板
            function closeSettings() {
                isSettingsOpen = false;
                document.body.classList.remove('settings-open');
                settingsPanel.classList.remove('active');
                settingsOverlay.classList.remove('active');
                settingsBtn.classList.remove('active'); // 关闭时移除设置按钮的激活状态
            }
            
            // 切换设置面板
            settingsBtn.addEventListener('click', () => {
                if (isSettingsOpen) {
                    closeSettings();
                } else {
                    openSettings();
                }
            });
            
            // 点击遮罩层关闭设置面板
            settingsOverlay.addEventListener('click', () => {
                closeSettings();
            });
            
            // ESC键关闭设置面板
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && isSettingsOpen) {
                    closeSettings();
                }
            });
            
            // 文件夹按钮缓存加载指示器
            const folderBtn = document.querySelector('.folder-btn');
            if (folderBtn) {
                // 添加缓存状态指示圆点
                const indicator = document.createElement('span');
                indicator.className = 'cache-indicator';
                folderBtn.appendChild(indicator);

                // 轮询缓存预热状态
                let cachePollCount = 0;
                const MAX_CACHE_POLL = 60; // 最多轮询60次（约60秒）

                async function checkCacheStatus() {
                    try {
                        const res = await fetch('/captures_cache_status');
                        const data = await res.json();

                        if (data.status === 'loading') {
                            indicator.className = 'cache-indicator loading';
                            indicator.title = `正在预加载检测记录...`;
                        } else if (data.status === 'ready') {
                            indicator.className = 'cache-indicator ready';
                            indicator.title = `检测记录已就绪 (${data.total_files} 个文件)`;
                            return true; // 已完成，停止轮询
                        } else {
                            // idle 或 error，可能是首次访问
                            if (cachePollCount < 3) {
                                indicator.className = 'cache-indicator loading';
                            } else {
                                indicator.className = '';
                            }
                        }
                    } catch (e) {
                        indicator.className = '';
                    }
                    cachePollCount++;
                    return cachePollCount >= MAX_CACHE_POLL;
                }

                // 启动轮询（每秒检查一次）
                const pollInterval = setInterval(async () => {
                    const done = await checkCacheStatus();
                    if (done) clearInterval(pollInterval);
                }, 1000);
                checkCacheStatus(); // 立即检查一次

                // 点击行为保持不变
                folderBtn.addEventListener('click', () => {
                    if (window.parent !== window) {
                        window.parent.postMessage({ action: 'navigateToHome' }, window.location.origin);
                    } else {
                        window.location.href = '/';
                    }
                });
            }
            
            // ==================== 动画程序全局控制 ====================
            const ANIMATION_ENABLED_KEY = 'animation_enabled';
            const animationToggle = document.getElementById('animationToggle');
            
            if (animationToggle) {
                const isAnimationEnabled = localStorage.getItem(ANIMATION_ENABLED_KEY) !== 'false';
                animationToggle.checked = isAnimationEnabled;
                updateAnimationState(isAnimationEnabled);
                
                animationToggle.addEventListener('change', (e) => {
                    const enabled = e.target.checked;
                    localStorage.setItem(ANIMATION_ENABLED_KEY, enabled);
                    updateAnimationState(enabled);
                                    
                    // 圆环图动画已完全禁用，无需更新
                                    
                    console.log('[动画程序]', enabled ? '✅ 已开启' : '❌ 已关闭');
                });
                
                console.log('[动画程序] 初始状态:', isAnimationEnabled ? '开启' : '关闭');
            }
            
            function updateAnimationState(enabled) {
                if (enabled) {
                    document.body.classList.remove('no-animations');
                } else {
                    document.body.classList.add('no-animations');
                }
            }
            
            // ==================== 高对比度文字控制 ====================
            const HIGH_CONTRAST_KEY = 'high_contrast_enabled';
            const highContrastToggle = document.getElementById('highContrastToggle');
            
            if (highContrastToggle) {
                const isHighContrastEnabled = localStorage.getItem(HIGH_CONTRAST_KEY) === 'true';
                highContrastToggle.checked = isHighContrastEnabled;
                updateHighContrastState(isHighContrastEnabled);
                
                highContrastToggle.addEventListener('change', (e) => {
                    const enabled = e.target.checked;
                    localStorage.setItem(HIGH_CONTRAST_KEY, enabled);
                    updateHighContrastState(enabled);
                    console.log('[高对比度]', enabled ? '✅ 已开启' : '❌ 已关闭');
                });
            }
            
            function updateHighContrastState(enabled) {
                if (enabled) {
                    document.body.classList.add('high-contrast-text');
                } else {
                    document.body.classList.remove('high-contrast-text');
                }
            }
            
            // ==================== 高斯模糊控制 ====================
            const BLUR_ENABLED_KEY = 'blur_enabled';
            const blurToggle = document.getElementById('blurToggle');
            const blurOverlay = document.querySelector('.blur-overlay');
            
            if (blurToggle) {
                const isBlurEnabled = localStorage.getItem(BLUR_ENABLED_KEY) !== 'false';
                blurToggle.checked = isBlurEnabled;
                updateBlurState(isBlurEnabled);
                
                blurToggle.addEventListener('change', (e) => {
                    const enabled = e.target.checked;
                    localStorage.setItem(BLUR_ENABLED_KEY, enabled);
                    updateBlurState(enabled);
                    console.log('[高斯模糊]', enabled ? '✅ 已开启' : '❌ 已关闭');
                });
            }
            
            function updateBlurState(enabled) {
                if (enabled) {
                    if (blurOverlay) blurOverlay.style.display = 'block';
                    document.body.classList.remove('no-blur');
                } else {
                    if (blurOverlay) blurOverlay.style.display = 'none';
                    document.body.classList.add('no-blur');
                }
            }
            
            // ==================== AI分析开关控制 ====================
            const AI_ANALYSIS_KEY = 'ai_analysis_enabled';
            const aiAnalysisSwitch = document.getElementById('aiAnalysisSwitch');
            const aiAnalysisContent = document.getElementById('aiAnalysisContent');
            const aiAnalysisPlaceholder = document.getElementById('aiAnalysisPlaceholder');
            const aiAnalysisLoading = document.getElementById('aiAnalysisLoading');
            const aiAnalysisResult = document.getElementById('aiAnalysisResult');
            
            // 全局函数：切换AI分析开关
            window.toggleAIAnalysis = function() {
                if (!aiAnalysisSwitch) return;
                
                const isAIEnabled = localStorage.getItem(AI_ANALYSIS_KEY) === 'true';
                const newState = !isAIEnabled;
                
                // 更新localStorage
                localStorage.setItem(AI_ANALYSIS_KEY, newState);
                
                // 更新UI状态
                updateAIAnalysisUI(newState);
                
                console.log('[AI分析]', newState ? '✅ 已开启' : '❌ 已关闭');
            };
            
            // 更新AI分析UI状态
            function updateAIAnalysisUI(enabled) {
                if (!aiAnalysisSwitch) return;
                
                if (enabled) {
                    aiAnalysisSwitch.classList.add('active');
                    aiAnalysisContent.style.display = 'block';
                    aiAnalysisPlaceholder.style.display = 'none';
                    // 自动触发一次分析
                    performAIAnalysis();
                } else {
                    aiAnalysisSwitch.classList.remove('active');
                    aiAnalysisContent.style.display = 'none';
                    aiAnalysisPlaceholder.style.display = 'block';
                }
            }
            
            // 初始化AI分析状态
            if (aiAnalysisSwitch) {
                const isAIEnabled = localStorage.getItem(AI_ANALYSIS_KEY) === 'true';
                updateAIAnalysisUI(isAIEnabled);
            }
            
            // 执行AI分析
            async function performAIAnalysis() {
                if (!aiAnalysisLoading || !aiAnalysisResult) return;

                // 显示加载状态
                aiAnalysisLoading.style.display = 'flex';
                aiAnalysisResult.style.display = 'none';

                try {
                    // 使用合并端点一次性获取所有数据
                    const allStatsRes = await fetch('/api/captures/all_stats');
                    const allStatsData = await allStatsRes.json();
                    const statsData = allStatsData.data || {};

                    const defectStats = statsData.defects || {};
                    const dailyStats = statsData.daily_stats || {};
                    const damageRatio = statsData.damage_ratio || {};
                    const confidenceDistribution = statsData.distribution || [];
                    const totalDefects = statsData.total_defects || 0;
                    
                    console.log('[AI分析] 请求数据:', {
                        defectStats,
                        dailyStatsCount: Object.keys(dailyStats).length,
                        damageRatioTypes: Object.keys(damageRatio).length,
                        confidenceDistribution,
                        totalDefects
                    });
                    
                    // 调用后端API
                    const analysisRes = await fetch('/analyze_defect_data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            defect_stats: defectStats,
                            daily_stats: dailyStats,
                            damage_ratio: damageRatio,
                            confidence_distribution: confidenceDistribution,
                            total_defects: totalDefects
                        })
                    });
                    
                    const analysisData = await analysisRes.json();
                    
                    if (analysisData.success) {
                        // 清理并显示结果
                        const cleanedText = cleanAIOutput(analysisData.analysis);
                        aiAnalysisResult.innerHTML = formatAIAnalysis(cleanedText);
                        aiAnalysisResult.style.display = 'block';
                        console.log('[AI分析] ✅ 分析完成');
                    } else {
                        throw new Error(analysisData.error || '分析失败');
                    }
                } catch (error) {
                    console.error('[AI分析] ❌ 错误:', error);
                    aiAnalysisResult.innerHTML = `<div style="color: var(--danger); padding: 12px;">分析失败: ${error.message}</div>`;
                    aiAnalysisResult.style.display = 'block';
                } finally {
                    aiAnalysisLoading.style.display = 'none';
                }
            }
            
            // 格式化AI分析结果（将文本转换为HTML）
            function formatAIAnalysis(text) {
                if (!text) return '';
                
                // 按段落分割
                const paragraphs = text.split('\n').filter(p => p.trim());
                
                let html = '';
                paragraphs.forEach(para => {
                    para = para.trim();
                    
                    // 检测标题（以【】包裹的文本）
                    if (para.startsWith('【') && para.includes('】')) {
                        const title = para.replace(/【|】/g, '');
                        html += `<h4>${title}</h4>`;
                    }
                    // 检测 **标题** 格式（Markdown加粗作为标题）
                    else if (/^\*\*.+\*\*$/.test(para)) {
                        const title = para.replace(/^\*\*|\*\*$/g, '');
                        html += `<h4 style="color: var(--primary);">${title}</h4>`;
                    }
                    // 检测列表项（以 - 或 • 开头）
                    else if (para.startsWith('- ') || para.startsWith('• ')) {
                        const content = para.substring(2);
                        html += `<p>• ${content}</p>`;
                    }
                    // 普通段落
                    else {
                        html += `<p>${para}</p>`;
                    }
                });
                
                return html;
            }
            });
        });
        // ==================== 缺陷圆环图 ====================
        let defectChart = null;
        
        // ==================== 最近统计柱状图 ====================
        let recentStatsChart = null;
        
        // 初始化圆环图
        function initDefectChart() {
            const ctx = document.getElementById('defectDoughnutChart');
            if (!ctx) return;
            
            defectChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#3B82F6', // 蓝色
                            '#EF4444', // 红色
                            '#10B981', // 绿色
                            '#F59E0B', // 黄色
                            '#8B5CF6', // 紫色
                            '#EC4899', // 粉色
                            '#06B6D4', // 青色
                            '#F97316'  // 橙色
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    animation: false,  // 完全禁用动画
                    plugins: {
                        legend: {
                            display: false // 隐藏默认图例，使用自定义图例
                        },
                        tooltip: {
                            enabled: false, // 禁用默认tooltip
                            external: function(context) {
                                // 自定义tooltip：高亮对应图例项
                                const tooltipModel = context.tooltip;
                                
                                // 清除所有图例项的active状态
                                const legendItems = document.querySelectorAll('.legend-item');
                                legendItems.forEach(item => item.classList.remove('active'));
                                
                                if (tooltipModel.dataPoints && tooltipModel.dataPoints.length > 0) {
                                    const dataIndex = tooltipModel.dataPoints[0].dataIndex;
                                    // 高亮对应的图例项
                                    const activeItem = document.querySelector(`.legend-item[data-index="${dataIndex}"]`);
                                    if (activeItem) {
                                        activeItem.classList.add('active');
                                    }
                                }
                            }
                        }
                    },
                    cutout: '60%', // 圆环宽度
                    onHover: function(event, elements) {
                        // 鼠标离开圆环时清除所有active状态
                        if (elements.length === 0) {
                            const legendItems = document.querySelectorAll('.legend-item');
                            legendItems.forEach(item => item.classList.remove('active'));
                        }
                    }
                }
            });
        }
        
        // 更新圆环图数据
        function updateDefectChart(defectData) {
            if (!defectChart) {
                initDefectChart();
            }
            
            // 按缺陷数量从高到低排序
            const sortedEntries = Object.entries(defectData).sort((a, b) => b[1] - a[1]);
            const labels = sortedEntries.map(entry => entry[0]);
            const data = sortedEntries.map(entry => entry[1]);
            
            defectChart.data.labels = labels;
            defectChart.data.datasets[0].data = data;
            defectChart.update();
            
            // 更新图例（传入排序后的数据）
            const sortedData = {};
            sortedEntries.forEach(([key, value]) => {
                sortedData[key] = value;
            });
            updateDefectLegend(sortedData);
        }
        
        // 更新图例
        function updateDefectLegend(defectData) {
            const legendContainer = document.getElementById('defectLegend');
            if (!legendContainer) return;
            
            const labels = Object.keys(defectData);
            const data = Object.values(defectData);
            const total = data.reduce((a, b) => a + b, 0);
            
            const colors = [
                '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
                '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'
            ];
            
            legendContainer.innerHTML = labels.map((label, index) => {
                const value = data[index];
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                const color = colors[index % colors.length];
                
                return `
                    <div class="legend-item" data-index="${index}" data-label="${label}">
                        <div class="legend-color" style="background-color: ${color}"></div>
                        <span class="legend-label">${label}</span>
                        <span class="legend-value">${percentage}%</span>
                    </div>
                `;
            }).join('');
            
            // 添加悬浮交互
            const legendItems = legendContainer.querySelectorAll('.legend-item');
            legendItems.forEach((item, index) => {
                // 鼠标进入图例项
                item.addEventListener('mouseenter', () => {
                    // 高亮对应的圆环扇区
                    if (defectChart) {
                        const meta = defectChart.getDatasetMeta(0);
                        meta.data.forEach((element, i) => {
                            element.active = i === index;
                        });
                        defectChart.render();
                    }
                });
                
                // 鼠标离开图例项
                item.addEventListener('mouseleave', () => {
                    // 取消所有扇区的高亮
                    if (defectChart) {
                        const meta = defectChart.getDatasetMeta(0);
                        meta.data.forEach(element => {
                            element.active = false;
                        });
                        defectChart.render();
                    }
                });
            });
        }
        
        // ==================== 统计数据缓存系统 ====================
        const statsCache = {};
        const STATS_CACHE_TTL = 60000; // 60秒缓存有效期

        function getCacheKey(apiName, startTime, endTime, filterType, clsFilter) {
            return `${apiName}|${startTime}|${endTime}|${filterType}|${clsFilter}`;
        }

        async function fetchStatsWithCache(apiUrl, cacheKey, updateFn, errorMsg) {
            const now = Date.now();
            const cached = statsCache[cacheKey];

            // 如果有缓存且在有效期，立即使用缓存，但后台刷新
            if (cached && (now - cached.timestamp) < STATS_CACHE_TTL) {
                updateFn(cached.data);
                // 后台静默刷新
                try {
                    const response = await fetch(apiUrl);
                    const result = await response.json();
                    if (result.success && result.data) {
                        statsCache[cacheKey] = { data: result.data, timestamp: Date.now() };
                    }
                } catch (e) { /* 静默失败 */ }
                return;
            }

            // 无缓存或缓存过期，正常请求
            try {
                const response = await fetch(apiUrl);
                const result = await response.json();
                if (result.success && result.data) {
                    statsCache[cacheKey] = { data: result.data, timestamp: Date.now() };
                    updateFn(result.data);
                }
            } catch (error) {
                console.error(`[${errorMsg}] 获取失败:`, error);
            }
        }

        // 清除所有统计缓存
        function clearStatsCache() {
            for (const key in statsCache) {
                delete statsCache[key];
            }
        }

        // 从筛选时间范围获取缺陷统计数据
        // 获取当前筛选参数（供统计API使用）
        function getStatsFilterParams() {
            const startInput = document.getElementById('start');
            const endInput = document.getElementById('end');
            const filterTypeEl = document.getElementById('filter_type');
            const clsEl = document.getElementById('cls');
            const startTime = startInput ? startInput.value : '';
            const endTime = endInput ? endInput.value : '';
            const filterType = filterTypeEl ? filterTypeEl.value : '';
            const clsFilter = clsEl ? clsEl.value : '';
            return { startTime, endTime, filterType, clsFilter };
        }

        async function fetchDefectStats() {
            const { startTime, endTime, filterType, clsFilter } = getStatsFilterParams();
            const cacheKey = getCacheKey('stats', startTime, endTime, filterType, clsFilter);
            const apiUrl = `/api/captures/stats?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&filter_type=${encodeURIComponent(filterType)}&cls=${encodeURIComponent(clsFilter)}`;

            await fetchStatsWithCache(apiUrl, cacheKey,
                (data) => updateDefectChart(data.defects || {}),
                '缺陷统计'
            );
        }
        
        // ==================== 最近统计柱状图 ====================
        
        // 初始化柱状图
        function initRecentStatsChart() {
            const ctx = document.getElementById('recentStatsBarChart');
            if (!ctx) return;
            
            recentStatsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: [],  // 日期
                    datasets: [
                        {
                            label: '有缺陷图片',
                            data: [],
                            backgroundColor: '#EF4444',  // 红色
                            borderRadius: 0,  // 方形，无圆角
                            borderSkipped: false,
                            barPercentage: 1.0,  // 柱子占满分类宽度，紧贴
                            categoryPercentage: 0.9,  // 分类宽度占总宽度的90%
                        },
                        {
                            label: '总导入图片',
                            data: [],
                            backgroundColor: '#3B82F6',  // 蓝色
                            borderRadius: 0,  // 方形，无圆角
                            borderSkipped: false,
                            barPercentage: 1.0,  // 柱子占满分类宽度，紧贴
                            categoryPercentage: 0.9,  // 分类宽度占总宽度的90%
                        }
                    ]
                },
                options: {
                    responsive: false,  // 禁用响应式，使用固定尺寸
                    maintainAspectRatio: false,  // 不保持宽高比
                    animation: false,  // 禁用动画
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                boxWidth: 10,
                                padding: 8,
                                font: {
                                    size: 10
                                }
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: { size: 11 },
                            bodyFont: { size: 10 },
                            padding: 6,
                            cornerRadius: 4,
                        },
                        // 自定义插件：保证panel卡片为正方形（压缩Y轴长度）
                        squarePlotArea: {
                            afterLayout: function(chart) {
                                const chartArea = chart.chartArea;
                                if (!chartArea) return;
                                
                                const canvas = chart.canvas;
                                const container = canvas.parentElement;
                                
                                // 获取容器的实际尺寸（正方形卡片）
                                const containerWidth = container.clientWidth;
                                const containerHeight = container.clientHeight;
                                
                                // 计算绘图区域尺寸
                                const plotWidth = chartArea.right - chartArea.left;
                                const plotHeight = chartArea.bottom - chartArea.top;
                                
                                // 目标：让绘图区域高度 = 绘图区域宽度（在正方形卡片内）
                                // 但需要考虑图例和标签占用的空间
                                const legendHeight = 30;  // 图例高度
                                const xLabelHeight = 20;  // X轴标签高度
                                
                                // 最大可用的绘图区域高度
                                const maxPlotHeight = containerHeight - legendHeight - xLabelHeight - 10;
                                
                                // 如果绘图区域高度超过了最大可用高度，压缩它
                                if (plotHeight > maxPlotHeight || plotHeight > plotWidth) {
                                    const targetHeight = Math.min(plotWidth, maxPlotHeight);
                                    chart.chartArea.bottom = chart.chartArea.top + targetHeight;
                                    
                                    console.log('[正方形卡片插件] 压缩Y轴:', {
                                        containerWidth,
                                        containerHeight,
                                        plotWidth: plotWidth.toFixed(2),
                                        oldPlotHeight: plotHeight.toFixed(2),
                                        newPlotHeight: targetHeight.toFixed(2),
                                        maxPlotHeight
                                    });
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            border: {
                                display: true  // 显示x轴线
                            },
                            ticks: {
                                font: {
                                    size: 10
                                },
                                maxRotation: 0,  // 不旋转，水平显示
                                minRotation: 0
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                display: false  // 移除网格线
                            },
                            border: {
                                display: true  // 显示y轴线
                            },
                            ticks: {
                                font: {
                                    size: 10
                                },
                                stepSize: 1  // 整数步长
                            }
                        }
                    },
                    layout: {
                        padding: {
                            left: 5,
                            right: 5,
                            top: 5,
                            bottom: 5
                        }
                    }
                }
            });
        }
        
        // 更新柱状图数据
        function updateRecentStatsChart(dailyStats) {
            if (!recentStatsChart) return;
            
            const labels = [];
            const defectCounts = [];
            const totalCounts = [];
            
            // 获取时间范围
            const startInput = document.getElementById('start');
            const endInput = document.getElementById('end');
            const startTime = startInput ? startInput.value : '';
            const endTime = endInput ? endInput.value : '';
            
            let startDate, endDate;
            
            if (startTime && endTime) {
                // 解析开始和结束日期
                startDate = new Date(startTime.replace('T', ' '));
                endDate = new Date(endTime.replace('T', ' '));
            } else {
                // 没有时间范围，默认显示最近7天
                endDate = new Date();
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 6);
            }
            
            // 限制最多容纳7天
            const maxDays = 7;
            const diffTime = Math.abs(endDate - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            
            if (diffDays > maxDays) {
                // 如果超过7天，从结束时间往前推6天
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - (maxDays - 1));
            }
            
            // 生成日期序列，跳过无导入数据的日期
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD

                // 获取该日期的数据，没有数据则跳过不显示
                if (dailyStats[dateStr] && dailyStats[dateStr].total > 0) {
                    // 转换为 M.D 格式
                    const month = currentDate.getMonth() + 1;
                    const day = currentDate.getDate();
                    labels.push(`${month}.${day}`);
                    defectCounts.push(dailyStats[dateStr].defect || 0);
                    totalCounts.push(dailyStats[dateStr].total || 0);
                }

                // 下一天
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // 确保结束时间的柱状图始终在图上（即在最右侧）
            // 由于我们是从startDate遍历到endDate，endDate自然在最右侧
            
            recentStatsChart.data.labels = labels;
            recentStatsChart.data.datasets[0].data = defectCounts;
            recentStatsChart.data.datasets[1].data = totalCounts;
            
            // 动态计算y轴最大值，让XY轴长度一致
            const daysCount = labels.length;  // X轴的标签数量
            const maxData = Math.max(...defectCounts, ...totalCounts);
            
            // 关键：让Y轴的最大值等于X轴的标签数量
            // 这样Chart.js会自动让Y轴的刻度数量匹配X轴，XY轴长度就会一致
            const yMax = Math.max(daysCount, maxData, 1);
            
            // 设置Y轴的最大值和步长
            recentStatsChart.options.scales.y.max = yMax;
            recentStatsChart.options.scales.y.ticks.stepSize = Math.max(1, Math.floor(yMax / daysCount));
            
            // 强制Chart.js重新计算布局（插件会自动调整绘图区域为正方形）
            recentStatsChart.update('none');
            
            console.log('[图表更新] 完成:', {
                daysCount,
                yMax,
                yMax设置: yMax,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            });
        }
        
        // 获取最近统计数据
        async function fetchRecentStats() {
            const { startTime, endTime, filterType, clsFilter } = getStatsFilterParams();
            const cacheKey = getCacheKey('recent', startTime, endTime, filterType, clsFilter);
            const apiUrl = `/api/captures/recent_stats?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&filter_type=${encodeURIComponent(filterType)}&cls=${encodeURIComponent(clsFilter)}`;

            await fetchStatsWithCache(apiUrl, cacheKey,
                (data) => updateRecentStatsChart(data.daily_stats || {}),
                '最近统计'
            );
        }
        
        // 获取损伤占比数据
        async function fetchDamageRatio() {
            const { startTime, endTime, filterType, clsFilter } = getStatsFilterParams();
            const cacheKey = getCacheKey('damage', startTime, endTime, filterType, clsFilter);
            const apiUrl = `/api/captures/damage_ratio?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&filter_type=${encodeURIComponent(filterType)}&cls=${encodeURIComponent(clsFilter)}`;

            await fetchStatsWithCache(apiUrl, cacheKey,
                (data) => renderDamageRatio(data.damage_ratio || {}),
                '损伤占比'
            );
        }
        
        // 渲染损伤占比
        function renderDamageRatio(damageData) {
            const container = document.getElementById('damageRatioContent');
            
            if (!damageData || Object.keys(damageData).length === 0) {
                container.innerHTML = '<div class="placeholder-text">暂无数据</div>';
                return;
            }
            
            let html = '';
            
            // 按平均面积占比排序
            const sorted = Object.entries(damageData)
                .sort((a, b) => b[1].avg_area_ratio - a[1].avg_area_ratio);
            
            sorted.forEach(([defectType, stats]) => {
                const avgRatio = stats.avg_area_ratio;
                const count = stats.total_count;
                
                // 根据占比设置颜色（0-33%绿，33-66%黄，66-100%红）
                let color = 'var(--success)';
                if (avgRatio >= 33) color = 'var(--warning)';
                if (avgRatio >= 66) color = 'var(--danger)';
                
                html += `
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 13px; font-weight: 500;">${defectType}</span>
                            <span style="font-size: 13px; color: ${color}; font-weight: 600;">${avgRatio}%</span>
                        </div>
                        <div style="background: var(--bg-secondary); border-radius: 20px; height: 12px; overflow: hidden;">
                            <div style="background: ${color}; height: 100%; width: ${Math.min(avgRatio, 100)}%; border-radius: 20px; transition: width 0.3s ease;"></div>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">共 ${count} 次检测</div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }
        
        // 置信分布图表实例
        let confidenceChart = null;
        
        // 初始化置信分布图表
        function initConfidenceChart() {
            const ctx = document.getElementById('confidenceBarChart');
            if (!ctx) return;
            
            confidenceChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['20%', '40%', '60%', '80%', '100%'],
                    datasets: [{
                        label: '缺陷数量',
                        data: [0, 0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.7)',
                            'rgba(255, 159, 64, 0.7)',
                            'rgba(255, 205, 86, 0.7)',
                            'rgba(75, 192, 192, 0.7)',
                            'rgba(54, 162, 235, 0.7)'
                        ],
                        borderColor: [
                            'rgb(255, 99, 132)',
                            'rgb(255, 159, 64)',
                            'rgb(255, 205, 86)',
                            'rgb(75, 192, 192)',
                            'rgb(54, 162, 235)'
                        ],
                        borderWidth: 2,
                        borderRadius: 0,  // 方形，无圆角
                        borderSkipped: false,  // 从底部开始
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const count = context.raw || 0;
                                    const totalDefects = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const percentage = totalDefects > 0 ? ((count / totalDefects) * 100).toFixed(1) : 0;
                                    return `数量: ${count} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-muted'),
                                font: {
                                    size: 11
                                }
                            },
                            grid: {
                                color: getComputedStyle(document.body).getPropertyValue('--border')
                            }
                        },
                        x: {
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-muted'),
                                font: {
                                    size: 11
                                }
                            },
                            grid: {
                                color: getComputedStyle(document.body).getPropertyValue('--border'),
                                tickLength: 0  // 不显示x轴刻度线
                            }
                        }
                    }
                }
            });
        }
        
        // 获取置信分布数据
        async function fetchConfidenceDistribution() {
            const { startTime, endTime, filterType, clsFilter } = getStatsFilterParams();
            const cacheKey = getCacheKey('confidence', startTime, endTime, filterType, clsFilter);
            const apiUrl = `/api/captures/confidence_distribution?start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&filter_type=${encodeURIComponent(filterType)}&cls=${encodeURIComponent(clsFilter)}`;

            await fetchStatsWithCache(apiUrl, cacheKey,
                (data) => updateConfidenceChart(data.distribution || []),
                '置信分布'
            );
        }
        
        // 更新置信分布图表
        function updateConfidenceChart(distribution) {
            if (!confidenceChart) return;
            
            const counts = distribution.map(item => item.count);
            
            confidenceChart.data.datasets[0].data = counts;
            confidenceChart.update();
        }
        
        // 页面加载时初始化图表（使用合并端点减少请求次数）
        document.addEventListener('DOMContentLoaded', () => {
            initDefectChart();
            initRecentStatsChart();
            initConfidenceChart();
            fetchAllStats();
        });

        // 合并端点：一次性获取所有统计数据
        async function fetchAllStats() {
            try {
                const response = await fetch('/api/captures/all_stats');
                const result = await response.json();
                if (result.success && result.data) {
                    const data = result.data;
                    // 更新所有图表
                    if (data.defects) updateDefectChart(data.defects);
                    if (data.daily_stats) updateRecentStatsChart(data.daily_stats);
                    if (data.damage_ratio) renderDamageRatio(data.damage_ratio);
                    if (data.distribution) updateConfidenceChart(data.distribution);
                    // 更新缓存
                    const now = Date.now();
                    const { startTime, endTime, filterType, clsFilter } = getStatsFilterParams();
                    const cacheKey = getCacheKey('all', startTime, endTime, filterType, clsFilter);
                    statsCache[cacheKey] = { data: data, timestamp: now };
                }
            } catch (error) {
                console.error('[统计数据] 获取失败:', error);
                // 回退到单独请求
                fetchDefectStats();
                fetchRecentStats();
                fetchDamageRatio();
                fetchConfidenceDistribution();
            }
        }
        
        // 导出到全局作用域（HTML onchange 调用）
        window.onFilter = onFilter;
        
        // 返回首页函数：支持iframe和直接访问两种模式
        function navigateToHome() {
            // 如果嵌入在iframe中，通过postMessage通知父页面
            if (window.parent !== window) {
                window.parent.postMessage({ action: 'navigateToHome' }, window.location.origin);
            } else {
                // 直接访问时，正常跳转
                window.location.href = '/';
            }
        }

})();
