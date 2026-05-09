// 钢材缺陷检测系统 - UI 控制脚本
// 功能：摄像头切换 / 模式切换 / 类别选择 / 状态轮询
(() => {
  // ===== DOM 引用 =====
  const $ = id => document.getElementById(id);
  const cameraSelect   = $('cameraSelect');
  const modeEl         = $('mode');
  const videoFeed      = $('videoFeed');
  const canvas         = $('canvas');
  const ctx            = canvas ? canvas.getContext('2d') : null;
  const redClassList   = $('redClassList');
  const eventsList     = $('eventsList');

  // ===== 状态 =====
  let classOptions = [];
  let currentCameraStatus = 'none';
  let redBoxClasses = new Set();
  
  // 【关键】系统全局状态 - 使用 localStorage 持久化
  const SYSTEM_STATE_KEY = 'steel_detection_system_state';
  
  // 保存系统状态到 localStorage
  function saveSystemState() {
    try {
      const state = {
        cameraStatus: currentCameraStatus,
        mode: modeEl ? modeEl.value : 'image',
        timestamp: Date.now()
      };
      localStorage.setItem(SYSTEM_STATE_KEY, JSON.stringify(state));
      console.log('[系统状态] 已保存:', state);
    } catch (e) {
      console.error('[系统状态] 保存失败:', e);
    }
  }
  
  // 从 localStorage 恢复系统状态
  function loadSystemState() {
    try {
      const saved = localStorage.getItem(SYSTEM_STATE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        console.log('[系统状态] 已恢复:', state);
        return state;
      }
    } catch (e) {
      console.error('[系统状态] 恢复失败:', e);
    }
    return null;
  }

  // ===== 模型路径（相对于项目根目录）=====
  // YOLO 检测模型 和 UNet 分割模型，都在项目根目录下
  const YOLO_PATH = "best (1).pt";
  const UNET_PATH = "myChannelUnet_2_neudet_best.pth";

  // ===== 渲染红框缺陷复选框列表 =====
  function renderRedClassList() {
    if (!redClassList) return;
    redClassList.innerHTML = '';
    
    classOptions.forEach(item => {
      const div = document.createElement('div');
      div.className = 'class-checkbox-item';
      if (redBoxClasses.has(item.id)) {
        div.classList.add('checked');
      }
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `red-class-${item.id}`;
      checkbox.checked = redBoxClasses.has(item.id);
      
      const label = document.createElement('label');
      label.htmlFor = `red-class-${item.id}`;
      label.textContent = `${item.id} - ${item.name}`;
      
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          redBoxClasses.add(item.id);
          div.classList.add('checked');
        } else {
          redBoxClasses.delete(item.id);
          div.classList.remove('checked');
        }
        updateRedClassCount();
        saveRedBoxClasses();
      });
      
      div.appendChild(checkbox);
      div.appendChild(label);
      redClassList.appendChild(div);
    });
    
    updateRedClassCount();
  }

  function updateRedClassCount() {
    const countEl = $('statusRedClassCount');
    if (countEl) countEl.innerText = String(redBoxClasses.size);
  }

  async function saveRedBoxClasses() {
    try {
      await fetch('/set_red_box_classes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ classes: Array.from(redBoxClasses) })
      });
    } catch (e) {
      console.error('保存红框类别失败', e);
    }
  }

  // ===== 加载类别和选中状态 =====
  async function loadClassOptionsAndSelection() {
    try {
      // 重试机制，确保模型已加载
      let retries = 0;
      let opts = [];
      
      while (retries < 5) {
        const optsRes = await fetch('/class_options');
        opts = await optsRes.json();
        
        if (Array.isArray(opts) && opts.length > 0) {
          break;
        }
        
        // 如果没有获取到类别，等待500ms后重试
        console.log(`等待模型加载... (${retries + 1}/5)`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
      
      classOptions = Array.isArray(opts) ? opts : [];
      
      const redRes = await fetch('/red_box_classes');
      const redData = await redRes.json();
      const savedClasses = (redData || {}).classes || [];
      redBoxClasses = new Set(savedClasses.map(Number));
      
      renderRedClassList();
      
      if (classOptions.length === 0) {
        console.warn('未能加载类别选项，请检查模型是否正确加载');
      }
    } catch (e) { 
      console.error('类别加载失败', e);
      classOptions = [];
      redBoxClasses = new Set();
      renderRedClassList();
    }
  }

  // ===== 刷新模型状态 =====
  async function refreshModelStatus() {
    try {
      const data = (await (await fetch('/model_status')).json()) || {};
      if (!data.success || !data.model) return;
      const m = data.model;
      const $ = document.getElementById.bind(document);
      const set = (id, v) => { const e = $(id); if (e) e.innerText = v; };
      set('statusModelType', (m.model_type || '?').toUpperCase());
      set('statusDevice',    m.device || '-');
      set('statusClassTotal', m.class_count !== undefined ? m.class_count : '-');
    } catch (e) { console.error('模型状态刷新失败', e); }
  }

  // ===== 摄像头切换 =====
  async function switchCamera() {
    const type = cameraSelect.value;
    const overlay = $('overlayMessage');
    const statusCam = $('statusCamera');
    const camNames = { 'none': '已关闭', 'local': '电脑摄像头', 'ip': 'IP摄像头' };

    // IP摄像头需要用户输入地址
    if (type === 'ip') {
      const ip = await showIPModal();
      if (!ip) {
        cameraSelect.value = currentCameraStatus;
        // 【关键】触发 change 事件，更新开关状态
        cameraSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      
      let url = ip.trim();
      if (!url.startsWith('http://') && !url.startsWith('rtsp://')) url = 'http://' + url;
      if (!url.includes('/video')) url += '/video';
      if (overlay) { overlay.hidden = false; overlay.textContent = '正在连接IP摄像头...'; }
      
      try {
        const r = await fetch('/set_camera', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ camera_type: 'ip', ip_address: url })
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error((d || {}).error || '连接失败');
        
        currentCameraStatus = 'ip';
        if (statusCam) statusCam.innerText = 'IP摄像头';
        videoFeed.style.display = 'block';
        videoFeed.src = `/video_feed?t=${Date.now()}`;
        // 【关键】成功后隐藏 overlay
        if (overlay) overlay.hidden = true;
      } catch (err) {
        if (overlay) { overlay.textContent = '连接失败: ' + err.message; overlay.hidden = false; }
        cameraSelect.value = currentCameraStatus;
        // 【关键】触发 change 事件，更新开关状态
        cameraSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    // 本地/关闭
    if (overlay) { overlay.hidden = false; overlay.textContent = '正在切换摄像头...'; }
    
    try {
      const r = await fetch('/set_camera', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ camera_type: type })
      });
      
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error((d || {}).error || '切换失败');
      
      // 更新状态
      currentCameraStatus = type;
      if (statusCam) statusCam.innerText = camNames[type] || '未知';
      saveSystemState();
      
      // 更新UI
      if (type === 'none') {
        videoFeed.src = '';
        videoFeed.style.display = 'none';
        // 【关键】关闭摄像头后，隐藏 overlay，不要显示"摄像头已关闭"
        if (overlay) overlay.hidden = true;
      } else {
        videoFeed.style.display = 'block';
        videoFeed.src = `/video_feed?t=${Date.now()}`;
        // 【关键】开启摄像头后，隐藏 overlay
        if (overlay) overlay.hidden = true;
      }
    } catch (err) {
      if (overlay) { overlay.textContent = '切换失败: ' + err.message; overlay.hidden = false; }
      cameraSelect.value = currentCameraStatus;
      // 【关键】触发 change 事件，更新开关状态
      cameraSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ===== 模式切换 =====
  async function setMode() {
    const val = modeEl.value;
    const yoloName = YOLO_PATH.split('\\').pop();
    const unetName = UNET_PATH.split('\\').pop();

    fetch('/set_mode', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ mode: val })
    });

    const statusMode = $('statusMode');
    if (statusMode) statusMode.innerText =
      val === 'detection' ? `检测模式 (${yoloName})` : `分割模式 (${unetName})`;
    
    // 【关键】保存系统状态
    saveSystemState();

    // 自动切换对应模型
    const modelPath = val === 'detection' ? YOLO_PATH : UNET_PATH;
    try {
      await fetch('/set_model_weights', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ weights_path: modelPath })
      });
      await loadClassOptionsAndSelection();
      await refreshModelStatus();
    } catch (e) { console.error('模型切换失败', e); }
  }

  // ===== Canvas 画布（预留，用于未来可能的标注功能）=====
  function resizeCanvas() {
    if (!canvas || !videoFeed) return;
    const w = Math.round(videoFeed.clientWidth  || 0);
    const h = Math.round(videoFeed.clientHeight || 0);
    if (w > 0 && h > 0) { canvas.width = w; canvas.height = h; }
  }
  if (canvas) {
    window.addEventListener('resize', resizeCanvas);
    setInterval(resizeCanvas, 800);
  }
  
  if (videoFeed) {
    ['dragstart', 'gesturestart'].forEach(evt => {
      videoFeed.addEventListener(evt, e => e.preventDefault());
      if (canvas) canvas.addEventListener(evt, e => e.preventDefault());
    });
  }

  // ===== 事件轮询 =====
  let lastEventCount = 0; // 记录上次的事件数量
  let lastLatestEvent = null; // 记录上次的最新事件
  
  function refreshEvents() {
    fetch('/recent_events').then(r => r.json()).then(data => {
      if (!eventsList) return;
      
      // 获取最新的检测记录
      const latestEvent = data.length > 0 ? data[0] : null;
      
      // 如果最新事件发生变化，或者事件数量变化，才更新UI
      const hasNewEvent = !lastLatestEvent || 
                         !latestEvent || 
                         lastLatestEvent.timestamp !== latestEvent.timestamp ||
                         lastLatestEvent.confidence !== latestEvent.confidence ||
                         data.length !== lastEventCount;
      
      if (!hasNewEvent) return;
      
      lastEventCount = data.length;
      lastLatestEvent = latestEvent;
      
      eventsList.innerHTML = '';
      if (!Array.isArray(data) || data.length === 0) {
        eventsList.innerHTML = '<li class="muted">暂无检测记录</li>'; 
        // 清空最新检测状态
        const statusEvent = $('statusEvent');
        if (statusEvent) statusEvent.innerText = '-';
        return;
      }
      
      // 显示最近12条
      data.slice(0, 12).forEach(rec => {
        const li = document.createElement('li');
        const className = rec.class_name || `类别${rec.class}`;
        const timeStr = rec.timestamp ? new Date(rec.timestamp).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }) : '-';
        li.innerHTML = `<strong>${className}</strong><div class="muted" style="font-size:12px">${timeStr} · 置信度:${Number(rec.confidence).toFixed(2)}</div>`;
        eventsList.appendChild(li);
      });
      
      // 更新最新检测状态
      if (latestEvent) {
        const statusEvent = $('statusEvent');
        if (statusEvent) {
          const className = latestEvent.class_name || `类别${latestEvent.class}`;
          statusEvent.innerText = `${className} (${Number(latestEvent.confidence).toFixed(2)})`;
        }
      }
    }).catch(() => {
      if (eventsList) eventsList.innerHTML = '<li class="muted">暂无检测记录</li>';
    });
  }

  // ===== 事件绑定 =====
  if (cameraSelect) cameraSelect.addEventListener('change', switchCamera);
  
  // 【关键】监听下拉框变化，同步开关状态
  if (cameraSelect) {
    cameraSelect.addEventListener('change', () => {
      const cameraSwitch = document.querySelector('.camera-switch');
      if (cameraSwitch) {
        if (cameraSelect.value === 'local' || cameraSelect.value === 'ip') {
          cameraSwitch.classList.add('active');
        } else {
          cameraSwitch.classList.remove('active');
        }
      }
    });
  }
  
  if (modeEl) modeEl.addEventListener('change', setMode);

  // 红框缺陷按钮
  const selectAllBtn = $('selectAllRedClassesBtn');
  const clearAllBtn = $('clearRedClassesBtn');
  
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      redBoxClasses = new Set(classOptions.map(x => x.id));
      renderRedClassList();
      saveRedBoxClasses();
    });
  }
  
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      redBoxClasses = new Set();
      renderRedClassList();
      saveRedBoxClasses();
    });
  }

  // ===== 初始化 =====
  async function init() {
    resizeCanvas();
    
    // 【关键】尝试恢复系统状态
    const savedState = loadSystemState();
    if (savedState) {
      console.log('[系统状态] 检测到保存的状态，准备恢复...');
      // 恢复模式
      if (savedState.mode && modeEl) {
        modeEl.value = savedState.mode;
        console.log('[系统状态] 恢复模式:', savedState.mode);
      }
      // 注意：摄像头状态由 syncCameraStatus 从服务器同步，不直接使用保存的值
    } else {
      // 默认设置为检测模式
      modeEl.value = 'detection';
    }
    
    // 先加载模型和类别选项
    await Promise.all([
      loadClassOptionsAndSelection(),
      refreshModelStatus()
    ]);
    
    // 然后获取摄像头状态并同步UI（从服务器获取真实状态）
    await syncCameraStatus();
    
    // 每2秒刷新检测日志（更实时）
    setInterval(refreshEvents, 2000);
    // 每5秒同步一次摄像头状态
    setInterval(syncCameraStatus, 5000);
    refreshEvents();
  }
  
  // 同步摄像头状态
  async function syncCameraStatus() {
    try {
      const d = await (await fetch('/get_camera_status')).json();
      console.log('[摄像头状态同步]', d);
      
      if (d.is_running) {
        // 摄像头正在运行
        let newStatus = 'local';
        // 判断是本地摄像头还是IP摄像头
        if (typeof d.camera_source === 'string' && (d.camera_source.startsWith('http://') || d.camera_source.startsWith('rtsp://'))) {
          newStatus = 'ip';
        }
        
        console.log('[摄像头状态] 当前:', currentCameraStatus, '服务器:', newStatus);
        
        if (currentCameraStatus !== newStatus) {
          currentCameraStatus = newStatus;
          cameraSelect.value = newStatus;
          const statusCam = $('statusCamera');
          if (statusCam) statusCam.innerText = newStatus === 'local' ? '电脑摄像头' : 'IP摄像头';
          videoFeed.style.display = 'block';
          if (!videoFeed.src || videoFeed.src === '') {
            videoFeed.src = `/video_feed?t=${Date.now()}`;
          }
          console.log('[摄像头状态] 已更新为:', newStatus);
          
          // 【关键】触发 change 事件，同步开关按钮状态
          cameraSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // 摄像头关闭
        if (currentCameraStatus !== 'none') {
          currentCameraStatus = 'none';
          cameraSelect.value = 'none';
          const statusCam = $('statusCamera');
          if (statusCam) statusCam.innerText = '已关闭';
          videoFeed.style.display = 'none';
          if ($('overlayMessage')) {
            $('overlayMessage').textContent = '请选择摄像头源';
            $('overlayMessage').hidden = false;
          }
          console.log('[摄像头状态] 已关闭');
          
          // 【关键】触发 change 事件，同步开关按钮状态
          cameraSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } catch (e) { 
      console.error('摄像头状态同步失败', e);
    }
  }
  
  // ===== IP地址输入弹窗 =====
  let ipModalResolve = null;
  
  // 显示IP地址输入弹窗
  function showIPModal() {
    return new Promise((resolve) => {
      ipModalResolve = resolve;
      const modal = $('ipAddressModal');
      const input = $('ipAddressInput');
      const errorMessage = $('ipModalErrorMessage');
      
      if (modal && input) {
        input.value = '';
        // 清除错误状态
        input.classList.remove('error');
        if (errorMessage) errorMessage.classList.remove('show');
        
        modal.classList.add('active');
        // 自动聚焦输入框
        setTimeout(() => input.focus(), 100);
        
        // 监听输入事件,清除错误状态
        input.oninput = () => {
          input.classList.remove('error');
          if (errorMessage) errorMessage.classList.remove('show');
        };
      }
    });
  }
  
  // 关闭IP地址输入弹窗
  function closeIPModal() {
    const modal = $('ipAddressModal');
    const content = modal.querySelector('.ip-modal-content');
    
    // 添加淡出动画类
    content.classList.add('fadeOut');
    
    // 等待动画完成后隐藏弹窗
    setTimeout(() => {
      modal.classList.remove('active');
      content.classList.remove('fadeOut');
      if (ipModalResolve) {
        ipModalResolve(null);
        ipModalResolve = null;
      }
    }, 300);
  }
  
  // 处理IP弹窗点击事件
  function handleIPModalClick(event) {
    // 如果点击的是弹窗背景(遮罩层),而不是弹窗内容本身,则关闭弹窗
    if (event.target === event.currentTarget) {
      closeIPModal();
    }
  }
  
  // 确认IP地址输入
  function confirmIPModal() {
    const input = $('ipAddressInput');
    const errorMessage = $('ipModalErrorMessage');
    const value = input ? input.value.trim() : '';
    
    if (!value) {
      // 如果输入为空,显示错误提示
      if (input) {
        input.classList.add('error');
        input.focus();
      }
      if (errorMessage) {
        errorMessage.classList.add('show');
      }
      return;
    }
    
    // 清除错误状态
    if (input) input.classList.remove('error');
    if (errorMessage) errorMessage.classList.remove('show');
    
    const modal = $('ipAddressModal');
    const content = modal.querySelector('.ip-modal-content');
    
    // 添加淡出动画类
    content.classList.add('fadeOut');
    
    // 等待动画完成后隐藏弹窗并返回值
    setTimeout(() => {
      modal.classList.remove('active');
      content.classList.remove('fadeOut');
      if (ipModalResolve) {
        ipModalResolve(value);
        ipModalResolve = null;
      }
    }, 300);
  }
  
  // 将函数暴露到全局作用域
  window.closeIPModal = closeIPModal;
  window.handleIPModalClick = handleIPModalClick;
  window.confirmIPModal = confirmIPModal;
  window.switchCamera = switchCamera; // 暴露摄像头切换函数
  
  init();
})();
