# 部署指南

## Docker 部署（推荐）

### 使用 Docker Compose

1. **克隆项目**
```bash
git clone https://github.com/your-username/new-api-sync.git
cd new-api-sync
```

2. **启动服务**
```bash
docker-compose up -d
```

3. **查看日志**
```bash
docker-compose logs -f
```

4. **停止服务**
```bash
docker-compose down
```

5. **访问应用**
打开浏览器访问 `http://localhost:3001`

### 使用 Docker

```bash
# 构建镜像
docker build -t newapi-sync .

# 运行容器
docker run -d \
  --name newapi-sync \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  newapi-sync
```

## 手动部署

### 前置要求

- Node.js 20+
- npm 或 pnpm

### 部署步骤

1. **克隆项目**
```bash
git clone https://github.com/your-username/new-api-sync.git
cd new-api-sync
```

2. **安装依赖**
```bash
npm install
```

3. **构建项目**
```bash
npm run build
```

4. **启动服务**
```bash
npm start
```

或使用 PM2：
```bash
npm install -g pm2
pm2 start packages/server/dist/index.js --name newapi-sync
pm2 save
pm2 startup
```

## 环境变量

可以通过环境变量配置服务：

```bash
# 端口号（默认 3001）
PORT=3001

# 运行环境
NODE_ENV=production
```

## 数据持久化

数据存储在 `data/` 目录下的 SQLite 数据库中。

**重要**：请定期备份 `data/sync-tool.db` 文件！

```bash
# 备份数据库
cp data/sync-tool.db data/sync-tool.db.backup

# 或使用 Docker volume 备份
docker run --rm -v newapi-sync_data:/data -v $(pwd):/backup alpine tar czf /backup/data-backup.tar.gz /data
```

## 反向代理配置

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy

```
your-domain.com {
    reverse_proxy localhost:3001
}
```

## 安全建议

1. **使用 HTTPS**
   - 配置 SSL 证书（Let's Encrypt）
   - 强制 HTTPS 访问

2. **限制访问**
   - 使用防火墙限制访问 IP
   - 配置 Nginx 基本认证

3. **定期备份**
   - 定期备份数据库文件
   - 使用自动化备份脚本

4. **更新维护**
   - 定期更新依赖包
   - 关注安全公告

## 故障排查

### 服务无法启动

1. 检查端口是否被占用
```bash
lsof -i :3001
```

2. 查看日志
```bash
docker-compose logs
# 或
pm2 logs newapi-sync
```

### 数据库错误

1. 检查数据库文件权限
```bash
ls -la data/
```

2. 删除损坏的数据库（会丢失数据）
```bash
rm data/sync-tool.db*
# 重启服务会自动创建新数据库
```

### 连接 New API 失败

1. 检查 New API 地址是否正确
2. 检查 API Key 是否有效
3. 检查网络连接
4. 查看后端日志

## 性能优化

1. **使用 PM2 集群模式**
```bash
pm2 start packages/server/dist/index.js -i max --name newapi-sync
```

2. **配置 Nginx 缓存**
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g inactive=60m;
```

3. **定期清理日志**
```bash
pm2 flush
```

## 监控

使用 PM2 监控：
```bash
pm2 monit
```

或使用 PM2 Plus（付费）：
```bash
pm2 link <secret> <public>
```

## 更新

### Docker 更新

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```

### 手动更新

```bash
# 拉取最新代码
git pull

# 安装依赖
npm install

# 重新构建
npm run build

# 重启服务
pm2 restart newapi-sync
```

## 卸载

### Docker

```bash
docker-compose down -v
rm -rf data/
```

### 手动部署

```bash
pm2 delete newapi-sync
pm2 save
rm -rf /path/to/new-api-sync
```
