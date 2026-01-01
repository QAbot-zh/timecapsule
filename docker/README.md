# 时间胶囊 - Docker 部署版

这是时间胶囊服务的 Docker 版本，适合不想使用 Cloudflare Workers 的用户自行部署。

## 与 Cloudflare 版本的区别

| 功能 | Cloudflare 版 | Docker 版 |
|------|--------------|-----------|
| 运行时 | Cloudflare Workers | Node.js + Hono |
| 数据库 | Cloudflare D1 | SQLite |
| 定时任务 | Cron Triggers | node-cron |
| 部署方式 | `wrangler deploy` | `docker compose up` |

## 快速开始

### 方式一：使用预构建镜像（推荐）

```bash
# 1. 创建目录和配置文件
mkdir timecapsule && cd timecapsule
mkdir data

# 2. 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  timecapsule:
    image: ghcr.io/QAbot/timecapsule/timecapsule:latest
    container_name: timecapsule
    restart: unless-stopped
    ports:
      - "21839:21839"
    environment:
      - RESEND_API_KEY=${RESEND_API_KEY}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
      - FROM_EMAIL=${FROM_EMAIL}
      - BASE_URL=${BASE_URL:-}
      - CONTACT_EMAIL=${CONTACT_EMAIL:-}
    volumes:
      - ./data:/app/data
EOF

# 3. 创建 .env 文件并填入配置
cat > .env << 'EOF'
RESEND_API_KEY=re_xxxxxxxxxxxx
ADMIN_PASSWORD=your-secure-password
FROM_EMAIL=Time Capsule <noreply@yourdomain.com>
BASE_URL=https://capsule.yourdomain.com
EOF

# 4. 启动
docker compose up -d
```

### 方式二：自行构建

#### 1. 准备环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

**必填项：**
- `RESEND_API_KEY` - Resend API 密钥
- `ADMIN_PASSWORD` - 管理员密码
- `FROM_EMAIL` - 发件人邮箱（需要在 Resend 验证域名）

#### 2. 启动服务

```bash
docker compose up -d
```

服务启动后访问 http://localhost:21839

#### 3. 配置 Webhook（可选）

如果你需要追踪邮件送达状态，在 Resend 控制台添加 Webhook：
```
https://your-domain.com/api/webhook/resend
```

## 数据持久化

SQLite 数据库文件保存在 `./data/capsules.db`，通过 Docker volume 持久化。

备份数据：
```bash
cp ./data/capsules.db ./backup/capsules_$(date +%Y%m%d).db
```

## 本地开发

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 生产模式运行
npm start
```

## 环境变量说明

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `RESEND_API_KEY` | ✅ | Resend API 密钥 | - |
| `ADMIN_PASSWORD` | ✅ | 管理员密码 | admin123 |
| `FROM_EMAIL` | ✅ | 发件人邮箱 | - |
| `BASE_URL` | 推荐 | 网站域名 | - |
| `CONTACT_EMAIL` | 可选 | 联系邮箱 | - |
| `RESEND_WEBHOOK_SECRET` | 可选 | Webhook 签名密钥 | - |
| `IP_DAILY_LIMIT` | 可选 | IP 每日限额 | 20 |
| `IP_10MIN_LIMIT` | 可选 | IP 10分钟限额 | 5 |
| `DAILY_CREATE_LIMIT` | 可选 | 每日投递上限 | 80 |


## 反向代理配置

### Nginx 示例

```nginx
server {
    listen 80;
    server_name capsule.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:21839;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy 示例

```caddyfile
capsule.yourdomain.com {
    reverse_proxy localhost:21839
}
```

## 目录结构

```
docker/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── schema.sql          # 从项目根目录复制
├── src/
│   ├── index.ts        # 主程序
│   └── pages.ts        # HTML 页面
└── data/
    └── capsules.db     # SQLite 数据库（自动创建）
```
