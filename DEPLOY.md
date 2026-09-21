# 香氛库存管理系统 - 阿里云部署指南

## 一、前置条件

- 阿里云 ECS 服务器 (Ubuntu/Debian)
- 已安装 Node.js 18+ 和 npm
- 有 root 或 sudo 权限
- 安全组已放行 3000 端口（或你想用的端口）

## 二、上传项目到服务器

### 方法 A: 使用 scp 上传

```bash
# 在本地执行（替换为你的服务器IP）
cd "/Users/tianxiaotian/Library/Application Support/TRAE SOLO CN/ModularData/ai-agent/work-mode-projects/6ab093cad7b097609a1be4c8"
scp -r fragrance-inventory root@你的服务器IP:/opt/
```

### 方法 B: 使用 rsync 上传（推荐，排除不需要的文件）

```bash
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='logs' \
  --exclude='db/fragrance.db' --exclude='db/backups' \
  fragrance-inventory/ root@你的服务器IP:/opt/fragrance-inventory/
```

### 方法 C: 使用 git

```bash
# 服务器上执行
cd /opt
git clone 你的仓库地址 fragrance-inventory
```

## 三、服务器上执行部署

SSH 登录服务器后执行：

```bash
cd /opt/fragrance-inventory

# 1. 安装依赖
npm install --production

# 2. 创建 .env 配置文件
cp .env.example .env

# 3. 修改 .env 中的 JWT_SECRET（重要！）
nano .env
# 将 JWT_SECRET 改为随机字符串，例如：
# JWT_SECRET=a3f8b2c9e7d1f4a6b8c0e2d4f6a8b0c2e4d6f8a0b2c4e6d8f0a2b4c6e8d0f2a4

# 4. 创建必要目录
mkdir -p logs db/backups

# 5. 安装 PM2
npm install -g pm2

# 6. 启动应用
pm2 start ecosystem.config.js

# 7. 保存 PM2 配置（开机自启）
pm2 save
pm2 startup systemd -u root --hp /root
```

## 四、阿里云安全组配置

1. 登录阿里云控制台 → ECS → 安全组
2. 添加入方向规则：
   - 端口范围: 3000/3000
   - 授权对象: 0.0.0.0/0
   - 协议类型: TCP

## 五、验证部署

```bash
# 本机验证
curl http://localhost:3000/api/health

# 浏览器访问
http://你的服务器公网IP:3000
```

默认账号: `admin` / `admin123`（登录后请立即在「设置」中修改密码）

## 六、日常运维命令

```bash
# 查看应用状态
pm2 status

# 查看实时日志
pm2 logs fragrance-inventory

# 重启应用
pm2 restart fragrance-inventory

# 停止应用
pm2 stop fragrance-inventory

# 更新代码后重新部署
cd /opt/fragrance-inventory
git pull          # 或重新上传文件
npm install --production
pm2 restart fragrance-inventory
```

## 七、数据备份

系统已内置自动备份：
- 每次服务启动时自动备份当日数据到 `db/backups/` 目录
- 保留最近 30 天的备份
- 可在「设置 → 数据备份」手动导出
- 可在「设置 → 数据恢复」从备份恢复

## 八、安全建议

1. **修改默认密码** — 登录后立即在「设置」中修改 admin 密码
2. **修改 JWT 密钥** — .env 文件中的 JWT_SECRET 必须改为随机值
3. **限制端口访问** — 如果只在内网使用，安全组中 3000 端口可限制来源 IP
4. **定期备份** — 建议定期从「设置」导出数据库备份到本地
5. **HTTPS** — 如需 HTTPS，可配置 Nginx 反向代理 + Let's Encrypt 证书
