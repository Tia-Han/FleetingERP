#!/bin/bash
# 香氛库存管理系统 - 阿里云部署脚本
# 使用方法: bash deploy.sh

set -e

APP_DIR="/opt/fragrance-inventory"
APP_NAME="fragrance-inventory"
APP_PORT=3000

echo "============================================"
echo "  香氛库存管理系统 - 阿里云部署"
echo "============================================"
echo ""

# 检查是否为root
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 用户或 sudo 执行此脚本"
  exit 1
fi

# 检查Node.js
echo "[1/7] 检查 Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  echo "  Node.js 已安装: $NODE_VERSION"
else
  echo "  Node.js 未安装！请先安装 Node.js 18+:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -"
  echo "  apt-get install -y nodejs"
  exit 1
fi

# 检查npm
echo "[2/7] 检查 npm..."
if ! command -v npm &> /dev/null; then
  echo "  npm 未安装！"
  exit 1
fi
echo "  npm 已安装: $(npm -v)"

# 创建应用目录
echo "[3/7] 创建应用目录..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/db/backups
echo "  目录: $APP_DIR"

# 复制项目文件
echo "[4/7] 复制项目文件..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
if [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
  rsync -av --exclude='node_modules' --exclude='.git' --exclude='logs' \
    --exclude='db/fragrance.db' --exclude='db/backups' \
    "$SCRIPT_DIR/" "$APP_DIR/"
  echo "  文件已复制到 $APP_DIR"
else
  echo "  已在目标目录，跳过复制"
fi

# 安装依赖
echo "[5/7] 安装 npm 依赖..."
cd $APP_DIR
npm install --production 2>&1 | tail -3
echo "  依赖安装完成"

# 创建.env文件
echo "[6/7] 检查环境配置..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  JWT_SECRET=$(openssl rand -hex 24 2>/dev/null || echo "change-me-$(date +%s)")
  sed -i "s/请修改为你的随机密钥_建议使用32位以上随机字符串/$JWT_SECRET/" "$APP_DIR/.env"
  echo "  .env 已生成，JWT密钥已随机化"
else
  echo "  .env 已存在，跳过"
fi

# 安装PM2
echo "[7/7] 配置 PM2 进程管理..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2 2>&1 | tail -2
  echo "  PM2 已安装"
else
  echo "  PM2 已存在: $(pm2 -v)"
fi

# 停止旧进程
pm2 delete $APP_NAME 2>/dev/null || true

# 启动应用
pm2 start ecosystem.config.js
pm2 save
echo "  应用已启动"

# 设置开机自启
pm2 startup systemd -u root --hp /root 2>&1 | grep -v "^$" | tail -2
pm2 save

echo ""
echo "============================================"
echo "  部署完成！"
echo "============================================"
echo ""
echo "  访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '服务器公网IP'):$APP_PORT"
echo ""
echo "  常用命令:"
echo "    查看状态:   pm2 status"
echo "    查看日志:   pm2 logs $APP_NAME"
echo "    重启应用:   pm2 restart $APP_NAME"
echo "    停止应用:   pm2 stop $APP_NAME"
echo ""
echo "  阿里云安全组: 请确保端口 $APP_PORT 已在安全组中放行"
echo "  默认账号: admin / admin123 (登录后请立即修改密码)"
echo ""
