# CLAUDE.md

## 用户称呼

- 称呼用户为 **车仔面大王**
- 每次对话开头都要带上这个称呼

## 项目信息

- 项目名称：面向工业质检的钢材缺陷轻量级检测系统
- YOLO版本：YOLO26
- 后端：FastAPI (Python)
- 前端：Jinja2 模板 + 原生 JavaScript（当前使用）
- 前端（备用）：React 19 + TypeScript（在 `_archived/frontend-react/`，未来前后端分离考虑使用）
- 数据库：SQLite
- AI服务：讯飞星火（图片理解 + 文本对话）

## 目录结构

```
SteelDefect/
├── main.py              # FastAPI 主入口
├── config.py            # 配置管理
├── start.py             # 启动脚本
├── services/            # 业务服务层
├── database/            # 数据访问层
├── segmentation/        # UNet 分割模型
├── static/              # 前端静态资源 (JS/CSS/字体)
├── templates/           # HTML 模板
├── models/              # AI 模型权重 (不进 git)
├── data/                # SQLite 数据库 (不进 git)
├── captures/            # 检测截图 (不进 git)
├── uploads/             # 上传文件 (不进 git)
├── logs/                # 日志 (不进 git)
├── scripts/             # 工具脚本
├── docker/              # Docker 部署配置
├── docs/                # 项目文档
└── _archived/           # 归档代码 (React 前端备用)
```

## 注意事项

- 所有路径引用基于项目根目录（main.py 所在目录）
- 配置通过 `.env` 文件管理，参考 `.env.example`
- 工具脚本在 `scripts/` 目录下，运行时需要从项目根目录执行
- React 前端代码已归档到 `_archived/frontend-react/`，当前不参与运行
