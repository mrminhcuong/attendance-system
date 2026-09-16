#!/bin/bash
# ============================================
# Script Deploy Hệ Thống Điểm Danh Sinh Viên
# Dành cho Ubuntu/Debian VPS
# ============================================

set -e

echo "=========================================="
echo "  DEPLOY HỆ THỐNG ĐIỂM DANH SINH VIÊN"
echo "=========================================="

# Màu sắc
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Biến cấu hình
APP_DIR="/var/www/attendance"
APP_USER="attendance"
NODE_VERSION="20"
PORT=3000

echo -e "${YELLOW}[1/7] Cập nhật hệ thống...${NC}"
sudo apt update && sudo apt upgrade -y

echo -e "${YELLOW}[2/7] Cài đặt Node.js ${NODE_VERSION}...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo -e "${GREEN}Node.js $(node -v) đã cài đặt${NC}"
echo -e "${GREEN}npm $(npm -v) đã cài đặt${NC}"

echo -e "${YELLOW}[3/7] Cài đặt PM2 & Nginx...${NC}"
sudo npm install -g pm2
sudo apt install -y nginx

echo -e "${YELLOW}[4/7] Tạo user & thư mục ứng dụng...${NC}"
if ! id "$APP_USER" &>/dev/null; then
    sudo useradd -r -m -s /bin/bash $APP_USER
fi
sudo mkdir -p $APP_DIR
sudo chown -R $APP_USER:$APP_USER $APP_DIR

echo -e "${YELLOW}[5/7] Copy source code...${NC}"
# Copy tất cả files trừ node_modules và attendance.db
echo -e "${YELLOW}Hãy upload source code vào ${APP_DIR}${NC}"
echo -e "${YELLOW}Sử dụng scp hoặc rsync từ máy local:${NC}"
echo ""
echo -e "${GREEN}  scp -r ./* user@YOUR_VPS_IP:${APP_DIR}/${NC}"
echo ""
echo -e "${YELLOW}Sau khi upload xong, nhấn Enter để tiếp tục...${NC}"
read -p ""

echo -e "${YELLOW}[6/7] Cài đặt dependencies & cấu hình...${NC}"
cd $APP_DIR

# Tạo .env nếu chưa có
if [ ! -f .env ]; then
    # Tạo JWT secret ngẫu nhiên
    JWT_SECRET=$(openssl rand -hex 32)
    cat > .env << EOF
PORT=${PORT}
JWT_SECRET=${JWT_SECRET}
ADMIN_DEFAULT_PASSWORD=admin123
NODE_ENV=production
EOF
    echo -e "${GREEN}.env đã được tạo với JWT secret ngẫu nhiên${NC}"
fi

# Cài dependencies
sudo -u $APP_USER npm install --production

echo -e "${YELLOW}[7/7] Cấu hình PM2 & Nginx...${NC}"

# Tạo PM2 ecosystem file
sudo -u $APP_USER cat > $APP_DIR/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'attendance-system',
    script: 'server.js',
    cwd: '/var/www/attendance',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/var/www/attendance/logs/error.log',
    out_file: '/var/www/attendance/logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
EOF

# Tạo thư mục logs
sudo -u $APP_USER mkdir -p $APP_DIR/logs

# Khởi động ứng dụng với PM2
sudo -u $APP_USER pm2 start $APP_DIR/ecosystem.config.js
sudo -u $APP_USER pm2 save

# Cấu hình PM2 tự khởi động khi reboot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER
sudo -u $APP_USER pm2 save

# Cấu hình Nginx
sudo tee /etc/nginx/sites-available/attendance << EOF
server {
    listen 80;
    server_name _;

    # Giới hạn upload size (cho import CSV)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }

    # Cache static files
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        proxy_pass http://127.0.0.1:${PORT};
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Kích hoạt site
sudo ln -sf /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test & restart nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# Cấu hình firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw --force enable

echo ""
echo -e "${GREEN}=========================================="
echo -e "  ✅ DEPLOY THÀNH CÔNG!"
echo -e "==========================================${NC}"
echo ""
echo -e "Truy cập: ${GREEN}http://$(curl -s ifconfig.me)${NC}"
echo -e "Admin:    ${GREEN}http://$(curl -s ifconfig.me)/admin/login.html${NC}"
echo -e "Tài khoản: ${YELLOW}admin / admin123${NC}"
echo ""
echo -e "${YELLOW}Lệnh hữu ích:${NC}"
echo "  pm2 status                    # Xem trạng thái app"
echo "  pm2 logs attendance-system    # Xem logs"
echo "  pm2 restart attendance-system # Restart app"
echo "  pm2 monit                     # Monitor realtime"
echo ""
