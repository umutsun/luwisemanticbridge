#!/bin/bash
# Luwi Semantic Bridge Sunucu Kurulum Script'i

echo "========================================"
echo "Luwi Semantic Bridge - Sunucu Kurulum"
echo "========================================"

# Gerekli paketleri kontrol et
check_package() {
    if ! command -v $1 &> /dev/null; then
        echo "$1 kurulu değil. Yükleniyor..."
        sudo apt-get update
        sudo apt-get install -y $1
    else
        echo "✓ $1 zaten kurulu"
    fi
}

echo -e "\n1. Gerekli paketler kontrol ediliyor..."
check_package "node"
check_package "npm"
check_package "pm2"
check_package "git"
check_package "redis-server"
check_package "postgresql-client"

# Redis'i başlat
echo -e "\n2. Redis başlatılıyor..."
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Redis durum kontrol
if redis-cli ping | grep -q PONG; then
    echo "✓ Redis çalışıyor"
else
    echo "✗ Redis başlatılamadı"
    exit 1
fi

# Database bağlantı test
echo -e "\n3. Database bağlantısı test ediliyor..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  user: 'postgres',
  password: 'Semsiye!22',
  database: 'asemb'
});
pool.query('SELECT NOW()')
  .then(() => { console.log('✓ Database bağlantısı başarılı'); pool.end(); })
  .catch(err => { console.error('✗ Database hatası:', err.message); pool.end(); process.exit(1); });
"

if [ $? -ne 0 ]; then
    echo "Database bağlantı hatası!"
    exit 1
fi

# Dependencies kurulum
echo -e "\n4. Dependencies kuruluyor..."
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd dashboard && npm install && cd ..

# PM2'i yapılandır
echo -e "\n5. PM2 konfigürasyonu..."
pm2 delete ecosystem.config.js 2>/dev/null
pm2 start ecosystem.config.js --env production

# PM2'i kaydet
pm2 save
pm2 startup

# Nginx kurulum (opsiyonel)
echo -e "\n6. Nginx yapılandırması (opsiyonel)..."
read -p "Nginx kurmak ister misiniz? (e/h): " install_nginx

if [ "$install_nginx" = "e" ] || [ "$install_nginx" = "E" ]; then
    check_package "nginx"

    # Nginx config oluştur
    sudo tee /etc/nginx/sites-available/asemb > /dev/null <<EOF
server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Dashboard
    location /dashboard {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

    # Site'ı aktif et
    sudo ln -sf /etc/nginx/sites-available/asemb /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default

    # Nginx test ve restart
    sudo nginx -t && sudo systemctl restart nginx
    sudo systemctl enable nginx

    echo "✓ Nginx yapılandırıldı"
fi

echo -e "\n========================================"
echo "KURULUM TAMAMLANDI!"
echo "========================================"
echo "Servisler:"
echo "- Frontend: http://$(curl -s ifconfig.me):3000"
echo "- Dashboard: http://$(curl -s ifconfig.me):3001"
echo "- API: http://$(curl -s ifconfig.me):8083"
echo ""
echo "PM2 komutları:"
echo "- Durum: pm2 status"
echo "- Loglar: pm2 logs"
echo "- Restart: pm2 restart all"
echo "- Stop: pm2 stop all"
echo ""