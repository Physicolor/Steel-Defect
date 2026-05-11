# 代码规范化改动报告

> 目标：规范化代码架构，清除冗余代码，分离代码混用（CSS/JS 内联在 HTML 中）。

---

## 一、后端 — `app.py`

### 1.1 删除测试数据注入
- **位置**：`captures_recent_stats` 端点（原第1628-1659行）
- **内容**：移除硬编码的5月1日和5月7日假统计数据
- **影响**：该端点现在返回真实的数据库统计，不再包含假数据

### 1.2 精简调试输出
- **位置**：`captures_data` 函数
- **内容**：移除约30条冗余的 `[DEBUG]` 打印语句（每次迭代、每个缺陷、rolled文件等），保留高层状态日志
- **影响**：减少控制台输出噪音，日志更清晰

### 1.3 提取共享筛选函数 `_apply_filters()`
- **位置**：新增辅助函数
- **内容**：缓存分支和非缓存分支中存在约70行完全重复的筛选逻辑，提取为 `_apply_filters(batches, filter_type, cls_filter)` 共享函数
- **影响**：消除代码重复，筛选逻辑统一维护

---

## 二、前端模板 — `templates/index.html`

### 2.1 删除冗余内联样式
- **位置**：原第387-508行
- **内容**：移除约125行内联 `<style>` 块，经比对确认是 `style.css` 中第2783-2939行的完整副本（含相同注释"AI侧栏按钮激活状态"）
- **影响**：消除样式重复定义，无功能变化

### 2.2 删除死函数
- **`changeModel()`**：引用不存在的 `modelSelect` 元素，仅有TODO注释，从未被调用
- **`togglePanel()`**：未被任何元素绑定或调用

### 2.3 删除空 div
- **`<div class="below-video-settings">`**：内部仅有注释，无实际内容

### 2.4 修复选择器 Bug
- **`.mode-option`** → **`.mode-tab`**：修复了选择器名称与实际DOM不匹配的问题，同时修正回调参数 `option` → `tab`，修复内部 `option.addEventListener` → `tab.addEventListener`

---

## 三、前端模板 — `templates/detect.html`

### 3.1 内联样式外移
- **移除**：约240行内联 `<style>` 块
- **重复部分**：大部分规则已在 `style.css` 中定义，直接删除
- **独有部分**：`.nav-header`、`.reset-btn`、`.image-size-control`、`.ai-analysis-section`、`.llm-status-indicator`、`.ai-content code` 等规则追加到 `style.css` 末尾
- **删除冗余 `@font-face`**：`style.css` 已定义完整的 HarmonyOS Sans 字体

### 3.2 内联脚本外移
- **移除**：约360行内联 `<script>` 块
- **新建**：`static/detect.js`，以 IIFE `(() => { ... })()` 封装，避免全局作用域污染
- **替换**：`<script src="{{ url_for('static', filename='detect.js') }}"></script>`

---

## 四、前端模板 — `templates/captures.html`

### 4.1 内联样式外移
- **移除**：约1450行内联 `<style>` 块（原第16-1465行）
- **新建**：`static/captures.css`（1448行纯CSS），包含卡片网格、模态查看器、批量操作栏、分页、自定义下拉选择器等捕获页面独有样式
- **替换**：`<link rel="stylesheet" href="{{ url_for('static', filename='captures.css') }}" />`

### 4.2 内联脚本外移
- **移除**：两段内联 `<script>` 块（原第1467-4211行 + 第4477-5111行，共约3380行）
- **新建**：`static/captures.js`（3382行），以 IIFE 封装，合并动画控制、筛选分页、批量操作、模态查看、Chart.js图表统计等全部逻辑
- **替换**：`<script src="{{ url_for('static', filename='captures.js') }}"></script>`
- **效果**：文件从 5114 行缩减到 286 行（减少94%）

---

## 五、样式表 — `static/style.css`

- 末尾追加 detect.html 独有样式规则约150行（`.nav-header`、`.reset-btn`、`.image-size-control`、`.ai-analysis-section`、`.llm-status-indicator`、`.ai-content code` 等）

---

## 六、新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `static/detect.js` | ~360 | 图片检测页面脚本，IIFE封装 |
| `static/captures.css` | ~1448 | 检测记录页面独有样式 |
| `static/captures.js` | ~3382 | 检测记录页面脚本，IIFE封装 |

---

## 七、未修改的已知情况

### 7.1 UNet 相关代码
- **按用户要求保留不删除**：`segmentation/unet/` 目录下所有文件（含 `unet_model.py` 中不存在的 `unet_parts` 导入问题）

### 7.2 `frontend/` 目录
- 独立的 React 原型项目，不属于 Flask 主系统，未纳入本次改动范围

### 7.3 `static/app.js`
- 识别出 `resizeCanvas()` 的 `setInterval(resizeCanvas, 800)` 轮询（canvas 从未被绘制），但不影响功能，暂未处理

---

## 八、改动统计

| 类别 | 数量 |
|------|------|
| 删除内联CSS（行） | ~1815 |
| 删除内联JS（行） | ~3740 |
| 删除死函数/空元素 | 3处 |
| 修复选择器Bug | 1处 |
| 消除重复筛选逻辑（行） | ~70 |
| 删除假测试数据 | 1处 |
| 删除冗余调试输出（条） | ~30 |
| 新增独立CSS文件 | 2个 |
| 新增独立JS文件 | 2个 |

---

## 九、第二轮清理 — 清除旧系统遗留代码

> 该系统由"野兽预警系统"修改而来，存在部分无关功能和死代码。

### 9.1 删除遗留编译字节码
- **`services/__pycache__/email_service.cpython-310.pyc`**：旧的邮件服务字节码，对应源文件已删除
- **`services/__pycache__/llm_service.cpython-310.pyc`**：旧的 LLM 服务字节码，已拆分为 spark_image_service / spark_lite_service

### 9.2 清理 `model_config.json` 中的旧项目路径
- **`current_model`**：`flask-system-status-lite/best (1).pt` → `best (1).pt`（相对路径）
- **`recent_models`**：移除3条指向 `flask-system-status - 副本` 的旧绝对路径
- **`model_history`**：清空18条全指向旧目录的历史记录

### 9.3 删除死函数：`selectModel()`
- **位置**：`templates/index.html` 原第787-806行
- **内容**：该函数只有 TODO 注释（"调用后端API切换模型"），从未实际调用 API
- **影响**：移除 onclick 绑定，模型切换功能在 detect 页面通过 `/set_model_weights` API 实现

### 9.4 删除死 Canvas 轮询代码
- **位置**：`static/app.js`
- **内容**：删除 `resizeCanvas()` 函数、`setInterval(resizeCanvas, 800)` 轮询、`window resize` 监听器、`ctx` 变量声明（Canvas 从未被绘制）
- **影响**：减少无意义的 800ms 定时器开销

### 9.5 文档清理
- **`钢材缺陷检测系统.md`**：
  - 移除"邮件报警"特性描述
  - 移除"3.1.4 报警通知功能"整节（邮件报警 + 可配置警戒区域）
  - 移除技术栈中的 `smtplib`
  - 移除 `.env` 配置示例中的 SMTP 变量
  - 移除"邮件报警配置"和"警戒区域设置"高级功能说明
  - 移除 FAQ Q5（如何启用邮件报警），Q6→Q5
- **`README.md`**：
  - 移除邮件报警、警戒区域功能描述
  - 移除不存在的文件引用（`check_dependencies.py`、`INSTALL.md`、`SPARK_API_SETUP.md`、`LICENSE`、`llm_service.py`、`unet_parts.py`、`script.js`、`调试用文件/`）
  - 修正 `static/` 目录结构为实际文件
  - 移除不存在的键盘快捷键说明
  - 移除 SMTP 环境变量配置
  - 移除许可证章节

---

## 十、新增启动时数据预加载功能

> 问题：系统首次访问 captures 页面时需要等待大量图片文件扫描，体验较差。

### 10.1 后端改动

- **`app.py` — `SystemState.captures_cache`**：新增 `status`（idle/loading/ready/error）、`progress`（0-100）、`total_files` 字段
- **`app.py` — `captures_data()`**：缓存构建时同步更新 `status` 和 `progress`
- **`app.py` — `/captures_cache_status`**：新增 API 端点，返回缓存预热状态
- **`app.py` — `clear_captures_cache()`**：清除缓存时同步重置 `status`
- **`app.py` — 启动入口**：`app.run()` 前启动后台线程，1.5 秒后通过 Flask test client 触发首次 `/captures_data` 扫描，预热缓存

### 10.2 前端改动

- **`static/captures.css`**：新增 `.cache-indicator` 样式——文件夹按钮右上角圆点，黄色脉冲=加载中，绿色=就绪
- **`static/captures.js`**：文件夹按钮上追加缓存状态指示圆点，每秒轮询 `/captures_cache_status`，缓存就绪后圆点淡出

### 10.3 效果

- 系统启动后自动在后台扫描 captures 目录并缓存
- 用户打开检测记录页时，数据已就绪，无需等待
- 文件夹图标右上角黄色脉冲圆点 = 正在预加载，绿色消失 = 已就绪

---

## 十一、Bug 修复 — `match` 变量未定义

- **问题**：`captures_data()` 中第1209行 `match.group(1)`，在 `new_batch_match` 或 `image_match` 匹配的代码路径中 `match` 变量未定义，导致 `[读取批次信息失败]` 错误
- **修复**：`match.group(1)` → `timestamp_str`（该变量在所有代码路径中均已正确赋值）
- **附加修复**：添加预加载并发保护——`captures_data()` 检测到已有后台预加载正在进行时，等待其完成后直接使用缓存，避免重复扫描

---

## 十二、Bug 修复 — IIFE 封装导致 onclick 引用报错

- **问题**：`captures.js` 使用 IIFE `(() => { ... })()` 封装后，`captures.html` 中 7 个 `onclick` 属性引用的函数（`resetFilters`、`toggleSelectionMode`、`toggleAIAnalysis`、`closeModalOnBackground`、`handleDeleteModalClick`、`closeDeleteConfirm`、`confirmDelete`）变为局部作用域，导致 `ReferenceError`
- **修复**：在 `captures.js` 中为每个函数定义前添加 `window.xxx = xxx` 导出（`toggleAIAnalysis` 此前已通过 `window.toggleAIAnalysis = function() {...}` 导出）
- **影响文件**：`static/captures.js`

---

## 十三、Bug 修复 — 摄像头/IP摄像头模式下截图间隔滑块不显示

- **问题**：`index.html` 中 `screenshotIntervalControl` 元素带有 `hidden-element` 类（CSS 定义为 `display: none !important`），而 `selectMode()` 使用 `style.display = 'block'` 无法覆盖 `!important`
- **修复**：改用 `classList.remove('hidden-element')` / `classList.add('hidden-element')` 替代 `style.display` 操作
- **影响文件**：`templates/index.html`

---

## 十四、Bug 修复 — `POST /set_camera` 偶发 500 错误

- **问题 1 — 重复调用**：`syncCameraStatus()` 每 5 秒轮询 `/get_camera_status`，当检测到摄像头已运行时更新 `cameraSelect.value` 并触发 `change` 事件，导致 `switchCamera()` 再次调用 `/set_camera` 关闭并重开摄像头，可能因摄像头未就绪而失败
- **修复 1**：`switchCamera()` 开头添加 `if (type === currentCameraStatus) return;` 短路判断
- **问题 2 — 数据解析**：`request.json` 可能为 `None`（非 JSON 请求体），后续 `data.get()` 抛出 `AttributeError`
- **修复 2**：改用 `request.get_json(silent=True)` 并添加 `None` 检查，返回 400 而非 500
- **问题 3 — 摄像头释放**：`state.cap.release()` 可能在摄像头状态异常时抛出异常
- **修复 3**：`release()` 调用包裹 `try/except`
- **影响文件**：`static/app.js`、`app.py`
