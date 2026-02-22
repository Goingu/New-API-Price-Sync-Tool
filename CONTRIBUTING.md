# 贡献指南

感谢你考虑为 New API Price Sync Tool 做出贡献！

## 行为准则

请遵守以下基本准则：

- 尊重所有贡献者
- 保持友好和专业
- 接受建设性的批评
- 关注对项目最有利的事情

## 如何贡献

### 报告 Bug

如果你发现了 Bug，请：

1. 检查 [Issues](https://github.com/your-username/new-api-sync/issues) 是否已有相同问题
2. 如果没有，创建新 Issue，包含：
   - 清晰的标题
   - 详细的问题描述
   - 复现步骤
   - 预期行为 vs 实际行为
   - 环境信息（操作系统、Node.js 版本等）
   - 截图（如果适用）

### 提出新功能

如果你有新功能建议：

1. 先创建 Issue 讨论
2. 说明功能的用途和价值
3. 等待维护者反馈
4. 获得批准后再开始开发

### 提交代码

#### 开发流程

1. **Fork 项目**
```bash
# 在 GitHub 上 Fork 项目
# 克隆你的 Fork
git clone https://github.com/your-username/new-api-sync.git
cd new-api-sync
```

2. **创建分支**
```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

3. **开发和测试**
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm test
```

4. **提交代码**
```bash
git add .
git commit -m "feat: add your feature description"
# 或
git commit -m "fix: fix your bug description"
```

提交信息格式：
- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式（不影响功能）
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具相关

5. **推送到 GitHub**
```bash
git push origin feature/your-feature-name
```

6. **创建 Pull Request**
- 在 GitHub 上创建 PR
- 填写 PR 模板
- 等待 Review

#### 代码规范

- 使用 TypeScript
- 遵循 ESLint 规则
- 保持代码简洁易读
- 添加必要的注释
- 编写单元测试（如果适用）

#### 提交前检查清单

- [ ] 代码通过 ESLint 检查
- [ ] 所有测试通过
- [ ] 添加了必要的文档
- [ ] 更新了 CHANGELOG.md（如果是重要变更）
- [ ] 提交信息清晰明确

### 文档贡献

文档同样重要！你可以：

- 修正拼写错误
- 改进说明文字
- 添加使用示例
- 翻译文档

### 其他贡献方式

- ⭐ Star 项目
- 📢 分享给其他人
- 💬 参与 Issue 讨论
- 📝 撰写教程或博客

## 开发环境设置

### 前置要求

- Node.js 20+
- npm 或 pnpm
- Git

### 项目结构

```
new-api-sync/
├── packages/
│   ├── web/          # 前端 React 应用
│   ├── server/       # 后端 Express 服务
│   └── shared/       # 共享类型定义
├── Dockerfile
├── docker-compose.yml
└── README.md
```

### 常用命令

```bash
# 安装依赖
npm install

# 启动开发服务器（前端 + 后端）
npm run dev

# 只启动前端
npm run dev:web

# 只启动后端
npm run dev:server

# 构建项目
npm run build

# 运行测试
npm test

# 代码检查
npm run lint
```

## 许可证

通过贡献代码，你同意你的贡献将在与项目相同的许可证下发布。

本项目采用**非商业使用许可证**，禁止任何商业用途。

## 问题？

如有任何问题，请：

- 查看 [README.md](./README.md)
- 查看 [Issues](https://github.com/your-username/new-api-sync/issues)
- 创建新 Issue

## 致谢

感谢所有贡献者！🎉
