#!/bin/bash
# iFlow 公网部署脚本
# 服务器: 139.224.194.221
# 域名: 24h.sivitacraft.com

set -e

echo "🚀 iFlow 部署脚本"
echo "=================="

# 配置
DEPLOY_USER="deploy"
DEPLOY_DIR="/home/$DEPLOY_USER/iflow"
NGINX_CONF="/etc/nginx/sites-available/24h.sivitacraft.com"

# 1. 创建部署目录
echo "📁 创建部署目录..."
sudo mkdir -p $DEPLOY_DIR
sudo chown -R $DEPLOY_USER:$DEPLOY_USER $DEPLOY_DIR

# 2. 同步代码 (假设已经通过 git clone 或 rsync 上传)
echo "📦 请确保代码已上传到 $DEPLOY_DIR"
# rsync -avz --exclude 'node_modules' --exclude 'logs' --exclude 'generated-apps' ./ $DEPLOY_USER@139.224.194.221:$DEPLOY_DIR/

# 3. 安装依赖
echo "📥 安装 Node.js 依赖..."
cd $DEPLOY_DIR
npm install --production

# 4. 配置 Nginx
echo "🌐 配置 Nginx..."
sudo cp $DEPLOY_DIR/deploy/nginx-24h.sivitacraft.com.conf $NGINX_CONF
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 5. 申请 SSL 证书
echo "🔒 申请 Let's Encrypt SSL 证书..."
sudo certbot --nginx -d 24h.sivitacraft.com --non-interactive --agree-tos --email admin@sivitacraft.com

# 6. 启动 PM2
echo "🐂 启动 iFlow 服务..."
cd $DEPLOY_DIR
pm2 delete iflow 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo ""
echo "✅ 部署完成！"
echo "🌐 访问地址: https://24h.sivitacraft.com"
echo "📊 PM2 状态: pm2 status"
echo "📜 查看日志: pm2 logs iflow"
