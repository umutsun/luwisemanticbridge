# PM2 Quick Guide - LSEMB

## 🚀 Hızlı Restart Komutları

### Windows Batch Script (Önerilen)
```bash
# Tüm servisleri restart et
restart.bat all

# Sadece backend
restart.bat backend

# Sadece frontend
restart.bat frontend

# Sadece python
restart.bat python

# Logları göster
restart.bat logs

# Status kontrol
restart.bat status
```

### NPM Scripts
```bash
# Tüm servisleri başlat
npm start

# Tüm servisleri restart
npm run restart

# Sadece backend restart
npm run restart:backend

# Sadece frontend restart
npm run restart:frontend

# Sadece python restart
npm run restart:python

# Logları göster
npm run logs

# Sadece backend logs
npm run logs:backend

# Sadece frontend logs
npm run logs:frontend

# Status göster
npm run status

# Real-time monitoring
npm run monit
```

### Direkt PM2 Komutları
```bash
# Restart
pm2 restart all
pm2 restart lsemb-backend
pm2 restart lsemb-frontend
pm2 restart lsemb-python

# Logs
pm2 logs
pm2 logs lsemb-backend --lines 50
pm2 logs lsemb-frontend --lines 50

# Status
pm2 status
pm2 monit

# Stop/Start
pm2 stop all
pm2 start ecosystem.config.js

# Reload (zero-downtime)
pm2 reload all
```

## 📊 Monitoring

```bash
# Real-time dashboard
pm2 monit

# List all processes
pm2 list

# Show process details
pm2 show lsemb-backend
pm2 show lsemb-frontend

# CPU/Memory usage
pm2 status
```

## 🗑️ Cleanup

```bash
# Clear logs
pm2 flush

# Delete all processes
pm2 delete all

# Delete specific process
pm2 delete lsemb-backend
```

## 🔄 Development Workflow

**Genel iş akışı:**
```bash
# 1. Backend değişikliği yaptın
npm run restart:backend

# 2. Frontend değişikliği yaptın
npm run restart:frontend

# 3. Her iki tarafı da değiştirdin
npm run restart

# 4. Loglara bak
npm run logs
```

## 📁 Log Dosyaları

```
backend/logs/backend-out.log     - Backend stdout
backend/logs/backend-error.log   - Backend stderr
frontend/logs/frontend-out.log   - Frontend stdout
frontend/logs/frontend-error.log - Frontend stderr
```

## 🎯 Kısayollar

| Komut | Açıklama |
|-------|----------|
| `restart.bat all` | En hızlı full restart |
| `npm run restart:backend` | Backend değişikliklerinden sonra |
| `npm run restart:frontend` | Frontend değişikliklerinden sonra |
| `npm run logs` | Hızlı log kontrolü |
| `pm2 monit` | Real-time monitoring |

## ⚡ Pro Tips

1. **En hızlı restart**: `restart.bat backend` (veya frontend)
2. **Full restart**: `restart.bat all` veya `npm run restart`
3. **Log takibi**: `npm run logs` ile son 50 satır
4. **Real-time**: `pm2 monit` ile canlı izleme
5. **Status check**: `restart.bat status` veya `npm run status`
