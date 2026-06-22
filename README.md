# 钢材缺陷检测系统 v2.0

<div align="center">

**基于 FastAPI + Jinja2 的轻量级工业质检钢材缺陷检测系统**

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![YOLO](https://img.shields.io/badge/YOLO-v8-orange.svg)](https://github.com/ultralytics/ultralytics)

</div>

---

## ✨ 功能特性

### 核心功能
- 🎯 **双模检测**：支持 YOLO 目标检测和 Channel-UNet 语义分割
- 📹 **实时视频流**：支持 USB 摄像头和 IP 摄像头
- 🔍 **智能分析**：讯飞星火大模型辅助缺陷分析
- 📊 **检测记录**：自动保存检测结果、标注图、热力图、裁剪图
- 🖼️ **批量管理**：支持图片批次管理和详情查看

### 用户系统
- 👤 **多用户支持**：个人用户、企业用户、系统管理员
- 🔐 **权限控制**：基于角色的访问控制（RBAC）
- 📊 **数据隔离**：每个用户的检测记录独立存储
- 📈 **管理员看板**：系统统计、用户管理、数据监控

### 高级功能
- ⚙️ **参数调节**：实时调整置信度阈值、IOU 阈值
- 🎨 **可视化**：标注图、热力图、缺陷裁剪图
- 📱 **响应式 UI**：适配桌面和移动端

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **Web 框架** | FastAPI + Uvicorn |
| **前端渲染** | Jinja2 模板 + 原生 JavaScript |
| **AI 模型** | YOLO (目标检测) + Channel-UNet (语义分割) |
| **AI 分析** | 讯飞星火 4.0Ultra (图片理解) + Lite (文本对话) |
| **数据库** | SQLite |
| **用户认证** | JWT (Cookie httponly) |

---

## 🚀 快速开始

### 前置要求

- Python 3.10 或更高版本
- NVIDIA GPU（可选，用于加速推理）

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd SteelDefect

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入讯飞 API 密钥等配置

# 4. 启动系统
python start.py
```

### Windows 快捷启动

```bash
# 双击 start.bat，选择启动后端
start.bat
```

### 访问系统

- 系统首页：http://localhost:8000
- API 文档：http://localhost:8000/docs

---

## 📁 项目结构

```
SteelDefect/
├── main.py                    # FastAPI 主入口
├── config.py                  # 配置管理 (Pydantic Settings)
├── start.py                   # 后端启动脚本
├── requirements.txt           # Python 依赖
├── .env                       # 环境变量（需自行配置）
├── .env.example               # 环境变量示例
│
├── services/                  # 业务服务层
│   ├── model_service.py      #   AI 模型加载与推理
│   ├── record_service.py     #   检测记录管理
│   ├── spark_image_service.py#   讯飞图片理解 API
│   ├── spark_lite_service.py #   讯飞 Lite 文本对话
│   └── video_service.py      #   摄像头/视频流
│
├── database/                  # 数据访问层
│   ├── sqlite_client.py      #   SQLite 数据库客户端
│   └── models.py             #   数据模型定义
│
├── segmentation/              # UNet 语义分割模型
│   └── unet/
│       └── channel_unet_models.py
│
├── static/                    # 前端静态资源
│   ├── app.js                #   主页面脚本
│   ├── style.css             #   全局样式
│   ├── captures.js/css       #   检测记录页脚本/样式
│   ├── detect.js             #   检测页脚本
│   ├── fonts/                #   HarmonyOS 字体
│   └── images/               #   SVG 图标
│
├── templates/                 # HTML 模板
│   ├── index.html            #   主检测页
│   ├── detect.html           #   图片检测页
│   ├── captures.html         #   检测记录页
│   ├── admin.html            #   管理员面板
│   ├── login.html            #   登录/注册页
│   └── profile.html          #   个人中心
│
├── models/                    # AI 模型权重（不进 git）
│   ├── best.pt               #   YOLO 模型
│   └── myChannelUnet_2_neudet_best.pth  #   UNet 模型
│
├── data/                      # 运行时数据（不进 git）
│   └── steel_defect.db       #   SQLite 数据库
│
├── captures/                  # 检测截图（不进 git）
├── uploads/                   # 上传文件（不进 git）
├── logs/                      # 日志文件（不进 git）
│
├── scripts/                   # 工具脚本
│   ├── create_users.py       #   创建测试用户
│   ├── init_db.py            #   数据库初始化
│   ├── batch_import.py       #   批量导入检测记录
│   └── batch_import_isolated.py  #   带用户隔离的批量导入
│
├── docker/                    # Docker 部署配置
├── docs/                      # 项目文档
├── _archived/                 # 归档代码
│   └── frontend-react/       #   React 前端（备用/未来展望）
│
├── start.bat                  # Windows 启动脚本
└── README.md                  # 本文件
```

---

## 📖 使用说明

### 默认账户

| 用户名 | 密码 | 类型 |
|--------|------|------|
| admin | admin123 | 管理员 |
| zhangsan | 123456 | 个人用户 |
| baosteel | 123456 | 企业用户 |

### 基本操作

1. **登录系统**：访问 http://localhost:8000/login
2. **上传检测**：在首页拖拽或点击上传钢材图片
3. **查看结果**：检测完成后查看标注图、热力图、缺陷裁剪
4. **AI 分析**：点击"AI 分析"按钮获取智能分析报告
5. **检测记录**：点击"检测记录"查看历史检测数据
6. **管理员面板**：管理员可查看所有用户数据和系统统计

---

## ⚙️ 配置说明

所有配置在 `.env` 文件中管理，主要配置项：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | 8000 |
| `YOLO_MODEL_PATH` | YOLO 模型路径 | ./models/best.pt |
| `DATABASE_URL` | 数据库路径 | sqlite:///./data/steel_defect.db |
| `SPARK_IMAGE_APP_ID` | 讯飞图片理解 App ID | （需配置） |
| `SPARK_IMAGE_API_KEY` | 讯飞图片理解 API Key | （需配置） |
| `SPARK_IMAGE_API_SECRET` | 讯飞图片理解 API Secret | （需配置） |

---

## 📄 许可证

本项目仅供学习和研究使用。
