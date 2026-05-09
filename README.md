# SteelDefect - 钢材缺陷检测系统

<div align="center">

**基于YOLO/UNet双模的实时钢材缺陷检测系统**

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-red.svg)](https://pytorch.org/)
[![Flask](https://img.shields.io/badge/Flask-2.3+-green.svg)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [使用说明](#使用说明)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

---

## ✨ 功能特性

### 核心功能
- 🎯 **双模检测**: 支持YOLO目标检测和UNet语义分割
- 📹 **实时视频流**: 支持USB摄像头和IP摄像头
- 🔍 **智能分析**: AI大模型辅助缺陷分析（讯飞星火）
- 📊 **检测记录**: 自动保存检测结果和图片组
- 📧 **邮件报警**: 检测到缺陷时自动发送邮件通知
- 🖼️ **批量管理**: 支持图片批次管理和详情查看

### 高级功能
- ⚙️ **参数调节**: 实时调整置信度阈值、IOU阈值
- 🎨 **可视化**: 标注图、热力图、缺陷裁剪图
- 🔐 **警戒区域**: 可设置警戒线和警戒区域
- 📱 **响应式UI**: 适配桌面和移动端

---

## 🛠️ 技术栈

### 后端
- **Flask** - Web框架
- **PyTorch** - 深度学习框架
- **Ultralytics YOLO** - 目标检测
- **OpenCV** - 图像处理
- **WebSocket** - 实时通信

### 前端
- **HTML5/CSS3** - 页面结构和样式
- **JavaScript (ES6+)** - 交互逻辑
- **Canvas API** - 图像绘制

### AI模型
- **YOLOv8** - 钢材缺陷目标检测
- **Channel-UNet** - 钢材缺陷语义分割
- **讯飞星火4.0Ultra** - 智能分析报告

---

## 🚀 快速开始

### 前置要求

- Python 3.10 或更高版本
- NVIDIA GPU（可选，用于加速推理）
- USB摄像头或IP摄像头（用于实时检测）

### 安装步骤

#### 1. 克隆或下载项目

```bash
# 如果从Git仓库获取
git clone <repository-url>
cd SteelDefect
```

#### 2. 安装依赖

```bash
pip install -r requirements.txt
```

或使用国内镜像源加速：
```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

#### 3. 启动系统

**Windows用户**: 双击运行 `start.bat` 或 `start_conda.bat`

**命令行启动**:
```bash
python app.py
```

#### 4. 访问系统

打开浏览器访问: http://localhost:5000

---

## 📁 项目结构

```
SteelDefect/
├── app.py                      # Flask主应用入口
├── requirements.txt            # Python依赖列表
├── model_config.json          # 模型配置文件
├── records.json               # 检测记录数据
├── start.bat                  # Windows启动脚本
├── start_conda.bat            # Conda环境启动脚本
├── check_dependencies.py      # 依赖检查工具
├── INSTALL.md                 # 详细安装指南
│
├── services/                  # 服务层模块
│   ├── model_service.py       # 模型加载与推理服务
│   ├── video_service.py       # 摄像头管理服务
│   ├── record_service.py      # 检测记录服务
│   ├── email_service.py       # 邮件报警服务
│   ├── llm_service.py         # 大模型API服务
│   └── spark_image_service.py # 讯飞图片理解服务
│
├── segmentation/              # UNet分割模型
│   └── unet/
│       ├── channel_unet_models.py  # Channel-UNet模型定义
│       ├── unet_model.py      # 标准UNet模型
│       └── unet_parts.py      # UNet组件
│
├── templates/                 # HTML模板
│   ├── index.html            # 主页
│   ├── detect.html           # 检测页面
│   └── captures.html         # 检测记录页面
│
├── static/                    # 静态资源
│   ├── style.css             # 全局样式
│   └── script.js             # JavaScript脚本
│
├── captures/                  # 截图保存目录
│   ├── *_original.jpg        # 原始图片
│   ├── *_annotated.jpg       # 标注图片
│   ├── *_heatmap.jpg         # 热力图
│   ├── *_crop_*.jpg          # 缺陷裁剪图
│   └── *_info.json           # 批次信息
│
├── uploads/                   # 上传文件目录
│
├── frontend/                  # React前端项目（可选）
│   ├── src/
│   ├── package.json
│   └── ...
│
└── 调试用文件/                 # 调试和测试文件
    ├── test_*.py             # 测试脚本
    └── *.md                  # 开发文档
```

---

## 📖 使用说明

### 基本操作流程

1. **选择摄像头源**
   - 本地摄像头: 输入索引号（0=默认，1=外接）
   - IP摄像头: 输入RTSP/HTTP URL

2. **加载模型**
   - YOLO检测模型: `.pt` 文件
   - UNet分割模型: `.pth` 文件

3. **调整检测参数**
   - 置信度阈值: 控制检测灵敏度（0.0-1.0）
   - IOU阈值: 控制重复框过滤（0.0-1.0）

4. **开始检测**
   - 点击"开始检测"按钮
   - 实时查看检测结果

5. **保存记录**
   - 自动保存到 `captures/` 目录
   - 在"检测记录"页面查看和管理

### 快捷键

- `Space` - 开始/暂停检测
- `S` - 手动截图
- `Esc` - 停止检测

---

## ⚙️ 配置说明

### 环境变量

创建 `.env` 文件或设置系统环境变量：

```bash
# Flask配置
FLASK_DEBUG=false
FLASK_HOST=0.0.0.0
FLASK_PORT=5000

# 设备配置
USE_CUDA=true  # false强制使用CPU

# 邮件报警
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_email@qq.com
SMTP_PASS=your_authorization_code
EMAIL_RECEIVER=receiver@example.com

# 讯飞星火API（文本对话）
SPARK_API_KEY=user_id:api_key
SPARK_MODEL=4.0Ultra

# 讯飞图片理解API（AI分析功能必需）
SPARK_IMAGE_APP_ID=your_app_id
SPARK_IMAGE_API_KEY=your_api_key
SPARK_IMAGE_API_SECRET=your_api_secret
```

**注意**: 如需使用AI智能分析功能，必须配置讯飞图片理解API。详细配置指南请查看 [SPARK_API_SETUP.md](SPARK_API_SETUP.md)。

### 模型配置

编辑 `model_config.json`:

```json
{
  "current_model": "best (1).pt",
  "recent_models": [...],
  "model_history": [...]
}
```

---

## ❓ 常见问题

### Q1: 如何提升检测速度？

**A**: 
- 使用NVIDIA GPU并安装CUDA版PyTorch
- 降低输入分辨率（修改 `IMG_SIZE` 参数）
- 提高置信度阈值减少检测框数量

### Q2: 摄像头无法连接怎么办？

**A**:
- 检查摄像头是否被其他程序占用
- 尝试不同的摄像头索引（0, 1, 2...）
- 对于IP摄像头，确认URL格式正确且网络可达

### Q3: 如何更换检测模型？

**A**:
- 将新的 `.pt` 或 `.pth` 文件放到项目根目录
- 在网页界面选择新模型
- 或在 `model_config.json` 中修改 `current_model`

### Q4: 检测记录保存在哪里？

**A**:
- 图片保存在 `captures/` 目录
- 记录数据保存在 `records.json`
- 每个批次包含原图、标注图、热力图和JSON信息

### Q5: 如何启用邮件报警？

**A**:
- 配置SMTP服务器信息（推荐使用QQ邮箱）
- 获取授权码（不是登录密码）
- 在系统中设置接收邮箱地址

### Q6: 遇到 `'NoneType' object has no attribute 'encode'` 错误怎么办？

**A**:
这是讯飞图片理解API认证信息未配置导致的。解决方法：
1. 在讯飞开放平台注册并创建应用，获取APP ID、API Key和API Secret
2. 在项目根目录创建或编辑 `.env` 文件，填入认证信息
3. 安装依赖：`pip install python-dotenv`
4. 重启应用

详细配置步骤请查看 [SPARK_API_SETUP.md](SPARK_API_SETUP.md)。

更多问题请查看 [INSTALL.md](INSTALL.md) 详细安装指南。

---

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 GitHub Issue
- 发送邮件至: [your-email@example.com]

---

<div align="center">

**Made with ❤️ for Steel Quality Inspection**

</div>
