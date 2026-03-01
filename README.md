# New API Price Sync Tool

一个用于管理和同步 New API 模型倍率的工具，帮助你快速从多个渠道源同步价格配置。

## ⚠️ 许可证声明

**本项目仅供个人学习和非商业用途使用，禁止任何商业用途。**

详见 [LICENSE](./LICENSE) 文件。

## ✨ 功能特性

- 🔄 **渠道源倍率对比** - 对比多个中转商的倍率，找出最优价格
- 📊 **当前倍率管理** - 查看和管理所有模型的倍率配置
- 💰 **上游价格抓取** - 自动获取 OpenAI、Anthropic 等上游最新价格
- 🔍 **价格对比更新** - 对比当前倍率与上游价格，智能调整
- 📈 **价格历史记录** - 追踪价格变化趋势
- ✅ **自动签到** - 支持渠道源自动签到
- 🏥 **活性检测** - 定期检测模型可用性
- 📱 **现代化 UI** - 基于 Ant Design 的美观界面
<img width="2559" height="1306" alt="8aa7be42-0872-4293-9815-c299382b1e08" src="https://github.com/user-attachments/assets/c4cc1b84-2b18-467f-bd50-81ae508ccd7f" />
<img width="2559" height="1306" alt="image" src="https://github.com/user-attachments/assets/50fdb963-eba7-4dea-8f19-bdaf0ecc5c4d" />
<img width="2559" height="1306" alt="image" src="https://github.com/user-attachments/assets/74d1d9fc-bb26-4439-93bc-cbd144688f6b" />
<img width="2559" height="1306" alt="image" src="https://github.com/user-attachments/assets/02b11c02-e043-4346-979e-61d4b1db6524" />

## 🚀 快速开始

### 方式一: 使用 Docker Compose（推荐）

```bash
# 克隆项目
git clone https://github.com/Goingu/New-API-Price-Sync-Tool.git
cd New-API-Price-Sync-Tool

# 启动服务
docker-compose up -d

# 访问 http://localhost:3001
```

### 方式二: 使用 GitHub Container Registry

```bash
# 拉取最新镜像
docker pull ghcr.io/goingu/new-api-price-sync-tool:latest

# 运行容器
docker run -d \
  --name newapi-sync \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  ghcr.io/goingu/new-api-price-sync-tool:latest

# 访问 http://localhost:3001
```

### 方式三: 手动部署

#### 前置要求

- Node.js 20+
- npm

#### 安装步骤

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 启动服务
npm start
```

服务将在 `http://localhost:3001` 启动。

**详细部署文档**: 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 了解更多部署选项和配置说明。

## 📖 使用指南

### 首次使用流程

1. **配置连接**
   - 进入"设置"页面
   - 填写你的 New API 实例地址、API Key 和用户 ID
   - 点击"测试连接"确保配置正确

2. **添加渠道源**
   - 进入"渠道源管理"页面
   - 添加你找到的中转商（渠道商）信息
   - 包括名称、地址、API Key 等

3. **启用模型**
   - 在你的 New API 后台启用渠道商的新模型
   - 这一步在 New API 管理后台完成

4. **同步倍率**
   - 进入"渠道源倍率对比"页面
   - 选择要对比的渠道源
   - 点击"获取倍率"
   - 开启"只看未设置倍率的模型"开关
   - 选择要同步的模型
   - 点击"应用选中的倍率"，设置加价比例
   - 确认应用

### 日常使用

- **查看倍率** - "当前倍率"页面查看所有已配置的模型倍率
- **更新价格** - "抓取价格"获取上游最新价格，"对比更新"调整倍率
- **对比渠道** - "渠道源倍率对比"找出最便宜的渠道商

## 🏗️ 技术栈

### 前端
- React 18
- TypeScript
- Ant Design
- Vite

### 后端
- Node.js
- Express
- TypeScript
- SQLite

## 📁 项目结构

```
new-api-sync/
├── packages/
│   ├── web/          # 前端应用
│   ├── server/       # 后端服务
│   └── shared/       # 共享类型定义
├── Dockerfile        # Docker 构建文件
├── docker-compose.yml # Docker Compose 配置
└── LICENSE           # 许可证文件
```

## 🔧 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 前端: http://localhost:5173
# 后端: http://localhost:3001
```

## 🐛 问题反馈

如果遇到问题，请在 [Issues](https://github.com/your-username/new-api-sync/issues) 页面提交。

## 📝 更新日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解版本更新历史。

## 🤝 贡献

欢迎提交 Pull Request！

在提交之前，请确保：
- 代码通过 ESLint 检查
- 遵循现有的代码风格
- 添加必要的注释

## ⚖️ 许可证

本项目采用**非商业使用许可证**。

- ✅ 允许个人学习和研究
- ✅ 允许非营利组织使用
- ❌ 禁止任何商业用途

详见 [LICENSE](./LICENSE) 文件。

如需商业使用，请联系作者获取商业许可。

## 📧 联系方式

- GitHub Issues: [提交问题](https://github.com/your-username/new-api-sync/issues)
- Email: your-email@example.com

## 🙏 致谢

感谢所有贡献者和使用者的支持！

---

**免责声明**：本工具仅供学习和个人使用，使用本工具产生的任何后果由使用者自行承担。
