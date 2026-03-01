# 部署指南

## 方式一: 使用 Docker Compose (推荐)

### 1. 克隆仓库

```bash
git clone https://github.com/Goingu/New-API-Price-Sync-Tool.git
cd New-API-Price-Sync-Tool
```

### 2. 启动服务

```bash
docker-compose up -d
```

### 3. 访问应用

打开浏览器访问: `http://your-server-ip:3001`

### 4. 查看日志

```bash
docker-compose logs -f
```

### 5. 停止服务

```bash
docker-compose down
```

### 6. 更新到最新版本

```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 方式二: 使用 Docker Hub 镜像 (待发布)

### 1. 拉取镜像

```bash
docker pull goingu/newapi-price-sync:latest
```

### 2. 运行容器

```bash
docker run -d \
  --name newapi-sync \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  goingu/newapi-price-sync:latest
```

### 3. 访问应用

打开浏览器访问: `http://your-server-ip:3001`

---

## 方式三: 手动构建和运行

### 1. 克隆仓库

```bash
git clone https://github.com/Goingu/New-API-Price-Sync-Tool.git
cd New-API-Price-Sync-Tool
```

### 2. 构建 Docker 镜像

```bash
docker build -t newapi-sync .
```

### 3. 运行容器

```bash
docker run -d \
  --name newapi-sync \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  newapi-sync
```

---

## 配置说明

### 端口映射

默认端口是 `3001`,可以通过修改 `docker-compose.yml` 或运行命令中的端口映射来更改:

```yaml
ports:
  - "8080:3001"  # 将容器的3001端口映射到主机的8080端口
```

### 数据持久化

数据存储在 `./data` 目录中,包括:
- SQLite 数据库
- 价格历史记录
- 缓存数据

确保该目录有适当的权限:

```bash
mkdir -p data
chmod 755 data
```

### 环境变量

可以通过环境变量配置:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3001
```

---

## 反向代理配置 (可选)

### Nginx 配置示例

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

### Caddy 配置示例

```
your-domain.com {
    reverse_proxy localhost:3001
}
```

---

## 故障排查

### 查看容器状态

```bash
docker ps -a | grep newapi-sync
```

### 查看容器日志

```bash
docker logs newapi-sync
```

### 进入容器调试

```bash
docker exec -it newapi-sync sh
```

### 检查数据目录权限

```bash
ls -la data/
```

### 重启容器

```bash
docker restart newapi-sync
```

---

## 系统要求

- Docker 20.10+
- Docker Compose 1.29+ (如果使用 docker-compose)
- 至少 512MB 可用内存
- 至少 1GB 可用磁盘空间

---

## 安全建议

1. **使用反向代理**: 建议使用 Nginx 或 Caddy 作为反向代理,并配置 HTTPS
2. **防火墙配置**: 只开放必要的端口
3. **定期备份**: 定期备份 `./data` 目录
4. **更新镜像**: 定期更新到最新版本以获取安全补丁

---

## 备份和恢复

### 备份数据

```bash
tar -czf newapi-sync-backup-$(date +%Y%m%d).tar.gz data/
```

### 恢复数据

```bash
tar -xzf newapi-sync-backup-YYYYMMDD.tar.gz
docker restart newapi-sync
```

---

## 监控和维护

### 健康检查

Docker Compose 配置中已包含健康检查,可以通过以下命令查看:

```bash
docker inspect newapi-sync | grep -A 10 Health
```

### 日志轮转

建议配置 Docker 日志轮转:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

添加到 `/etc/docker/daemon.json` 并重启 Docker 服务。
