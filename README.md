# 钢材缺陷检测系统 v2.0

<div align="center">

**基于FastAPI + React + ChromaDB的现代钢材缺陷检测系统**

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-0.4+-purple.svg)](https://www.trychroma.com/)

</div>

---

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [使用说明](#使用说明)
- [配置说明](#配置说明)
- [部署指南](#部署指南)
- [常见问题](#常见问题)

---

## ✨ 功能特性

### 核心功能
- 🎯 **双模检测**: 支持YOLO目标检测和UNet语义分割
- 📹 **实时视频流**: 支持USB摄像头和IP摄像头
- 🔍 **智能分析**: AI大模型辅助缺陷分析（讯飞星火）
- 📊 **检测记录**: 自动保存检测结果和图片组
- 🖼️ **批量管理**: 支持图片批次管理和详情查看

### 用户系统
- 👤 **多用户支持**: 个人用户、企业用户、系统管理员
- 🔐 **权限控制**: 基于角色的访问控制（RBAC）
- 📊 **数据隔离**: 每个用户的检测记录独立存储
- 📈 **管理员看板**: 系统统计、用户管理、数据监控

### 高级功能
- ⚙️ **参数调节**: 实时调整置信度阈值、IOU阈值
- 🎨 **可视化**: 标注图、热力图、缺陷裁剪图
- 📱 **响应式UI**: 适配桌面和移动端
- 🔍 **语义搜索**: 基于向量的相似记录搜索

---

## 🛠️ 技术栈

### 后端
- **FastAPI** - 现代Python Web框架
- **ChromaDB** - 向量数据库
- **PyTorch** - 深度学习框架
- **Ultralytics YOLO** - 目标检测
- **OpenCV** - 图像处理
- **JWT** - 用户认证

### 前端
- **React 18** - 用户界面库
- **TypeScript** - 类型安全
- **Ant Design** - UI组件库
- **ECharts** - 数据可视化
- **Axios** - HTTP客户端

### AI模型
- **YOLOv8** - 钢材缺陷目标检测
- **Channel-UNet** - 钢材缺陷语义分割
- **讯飞星火4.0Ultra** - 智能分析报告

### 部署
- **Docker** - 容器化部署
- **Nginx** - 反向代理
- **Redis** - 缓存（可选）

---

## 🚀 快速开始

### 前置要求

- Python 3.10 或更高版本
- Node.js 18 或更高版本
- Docker 和 Docker Compose（推荐）
- NVIDIA GPU（可选，用于加速推理）

### 方式一：Docker部署（推荐）

#### 1. 克隆项目

```bash
git clone <repository-url>
cd steel-defect-upgrade
```

#### 2. 配置环境变量

```bash
# 复制环境变量模板
cp backend/.env.example backend/.env

# 编辑配置文件
# 修改讯飞API密钥等配置
```

#### 3. 启动服务

```bash
# Windows用户
start_docker.bat dev

# Linux/Mac用户
docker-compose -f docker/docker-compose.dev.yml up -d
```

#### 4. 访问系统

- 前端界面: http://localhost:3000
- 后端API: http://localhost:8000
- API文档: http://localhost:8000/docs
- ChromaDB: http://localhost:8001

### 方式二：本地开发

#### 1. 启动后端

```bash
# Windows用户
start_backend.bat

# Linux/Mac用户
cd backend
pip install -r requirements.txt
python start.py --reload
```

#### 2. 启动前端

```bash
# Windows用户
start_frontend.bat

# Linux/Mac用户
cd frontend
npm install
npm start
```

#### 3. 访问系统

- 前端界面: http://localhost:3000
- 后端API: http://localhost:8000
- API文档: http://localhost:8000/docs

---

## 📁 项目结构

```
steel-defect-upgrade/
├── backend/                    # FastAPI后端
│   ├── api/                   # API路由
│   │   ├── auth.py           # 认证API
│   │   ├── detection.py      # 检测API
│   │   ├── records.py        # 记录API
│   │   └── admin.py          # 管理员API
│   ├── database/              # 数据库层
│   │   ├── chromadb_client.py # ChromaDB客户端
│   │   └── models.py         # 数据模型
│   ├── services/              # 业务服务
│   │   ├── model_service.py  # AI模型服务
│   │   ├── video_service.py  # 视频服务
│   │   └── spark_service.py  # 讯飞服务
│   ├── config.py             # 配置管理
│   ├── main.py               # 主应用入口
│   ├── init_db.py            # 数据库初始化
│   ├── start.py              # 启动脚本
│   └── requirements.txt      # Python依赖
│
├── frontend/                  # React前端
│   ├── src/
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面组件
│   │   ├── services/         # API服务
│   │   ├── store/            # 状态管理
│   │   └── utils/            # 工具函数
│   ├── public/               # 静态资源
│   └── package.json          # Node.js依赖
│
├── docker/                    # Docker配置
│   ├── Dockerfile.backend    # 后端Dockerfile
│   ├── Dockerfile.frontend   # 前端Dockerfile
│   ├── docker-compose.yml    # 生产环境
│   ├── docker-compose.dev.yml # 开发环境
│   └── nginx.conf            # Nginx配置
│
├── data/                      # 数据存储
│   └── chromadb/             # ChromaDB数据
│
├── uploads/                   # 上传文件
├── captures/                  # 检测截图
├── logs/                      # 日志文件
├── models/                    # AI模型文件
├── docs/                      # 项目文档
│
├── start_backend.bat          # 后端启动脚本
├── start_frontend.bat         # 前端启动脚本
├── start_docker.bat           # Docker启动脚本
└── README.md                  # 项目说明
```

---

## 📖 使用说明

### 基本操作流程

1. **注册/登录**
   - 访问系统首页
   - 注册新账户（选择用户类型）
   - 使用用户名和密码登录

2. **图片检测**
   - 进入检测页面
   - 上传钢材图片
   - 调整检测参数
   - 开始检测
   - 查看检测结果

3. **摄像头检测**
   - 选择摄像头源
   - 开启实时检测
   - 查看实时结果
   - 保存检测记录

4. **查看记录**
   - 进入记录页面
   - 查看历史检测记录
   - 查看详细检测结果
   - 下载检测图片

5. **管理员功能**
   - 使用管理员账户登录
   - 查看系统看板
   - 管理用户账户
   - 查看统计数据

### 用户类型说明

| 用户类型 | 权限说明 |
|---------|---------|
| 个人用户 | 图片检测、摄像头检测、查看自己的记录 |
| 企业用户 | 个人用户功能 + 企业信息管理 |
| 系统管理员 | 看板统计、用户管理、查看所有记录 |

---

## ⚙️ 配置说明

### 环境变量配置

创建 `backend/.env` 文件：

```bash
# 应用配置
DEBUG=True
HOST=0.0.0.0
PORT=8000

# 安全配置
SECRET_KEY=your-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ChromaDB配置
CHROMADB_HOST=localhost
CHROMADB_PORT=8001

# AI模型配置
YOLO_MODEL_PATH=./models/best.pt
USE_CUDA=True

# 讯飞API配置
SPARK_API_KEY=user_id:api_key
SPARK_IMAGE_APP_ID=your_app_id
SPARK_IMAGE_API_KEY=your_api_key
SPARK_IMAGE_API_SECRET=your_api_secret
```

### 模型配置

将AI模型文件放到 `models/` 目录：

```
models/
├── best.pt              # YOLO检测模型
└── unet.pth             # UNet分割模型
```

### 数据库配置

ChromaDB数据存储在 `data/chromadb/` 目录，无需额外配置。

---

## 🚀 部署指南

### Docker部署

#### 生产环境部署

```bash
# 构建镜像
docker-compose -f docker/docker-compose.yml build

# 启动服务
docker-compose -f docker/docker-compose.yml up -d

# 查看状态
docker-compose -f docker/docker-compose.yml ps

# 查看日志
docker-compose -f docker/docker-compose.yml logs -f

# 停止服务
docker-compose -f docker/docker-compose.yml down
```

#### 开发环境部署

```bash
# 启动开发环境
docker-compose -f docker/docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker/docker-compose.dev.yml logs -f

# 停止环境
docker-compose -f docker/docker-compose.dev.yml down
```

### 本地部署

#### 后端部署

```bash
# 安装依赖
cd backend
pip install -r requirements.txt

# 初始化数据库
python init_db.py

# 启动服务
python start.py --workers 4
```

#### 前端部署

```bash
# 安装依赖
cd frontend
npm install

# 构建生产版本
npm run build

# 部署到Nginx
# 将build目录复制到Nginx静态文件目录
```

### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| DEBUG | 调试模式 | True |
| HOST | 监听地址 | 0.0.0.0 |
| PORT | 监听端口 | 8000 |
| SECRET_KEY | JWT密钥 | - |
| CHROMADB_HOST | ChromaDB地址 | localhost |
| CHROMADB_PORT | ChromaDB端口 | 8001 |
| YOLO_MODEL_PATH | YOLO模型路径 | ./models/best.pt |
| USE_CUDA | 使用GPU | True |
| SPARK_API_KEY | 讯飞API密钥 | - |
| SPARK_IMAGE_APP_ID | 讯飞图片APP ID | - |

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
- 将新的 `.pt` 或 `.pth` 文件放到 `models/` 目录
- 在网页界面选择新模型
- 或在 `.env` 文件中修改 `YOLO_MODEL_PATH`

### Q4: 检测记录保存在哪里？

**A**:
- 图片保存在 `captures/` 目录
- 记录数据保存在ChromaDB数据库
- 每个批次包含原图、标注图、热力图和JSON信息

### Q5: 如何配置讯飞API？

**A**:
1. 在讯飞开放平台注册并创建应用
2. 获取APP ID、API Key和API Secret
3. 在 `backend/.env` 文件中配置：
   ```bash
   SPARK_IMAGE_APP_ID=your_app_id
   SPARK_IMAGE_API_KEY=your_api_key
   SPARK_IMAGE_API_SECRET=your_api_secret
   ```

### Q6: Docker启动失败怎么办？

**A**:
- 检查Docker是否正常运行
- 检查端口是否被占用
- 查看Docker日志：`docker-compose logs`
- 确保有足够的磁盘空间

### Q7: 如何备份数据？

**A**:
```bash
# 备份ChromaDB数据
cp -r data/chromadb data/chromadb_backup

# 备份上传文件
cp -r uploads uploads_backup

# 备份检测截图
cp -r captures captures_backup
```

### Q8: 如何升级系统？

**A**:
```bash
# 拉取最新代码
git pull

# 重新构建Docker镜像
docker-compose build

# 重启服务
docker-compose up -d
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发规范

1. 代码风格：遵循PEP 8（Python）和ESLint（JavaScript）
2. 提交信息：使用中文，格式为 `类型: 描述`
3. 分支管理：使用feature分支开发，合并到main分支
4. 测试要求：新功能需要添加单元测试

### 提交类型

- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具相关

---

## 📧 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 GitHub Issue
- 发送邮件至: [Sparxiezm@outlook.com]

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

---

<div align="center">

**Made with ❤️ for Steel Quality Inspection**

</div>
