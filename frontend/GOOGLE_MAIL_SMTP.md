# Google Mail SMTP Yapılandırması

## 📧 hello@luwi.dev için SMTP Kurulumu

### 1. Google App Password Oluştur
- https://myaccount.google.com/security
- 2FA aktif olmalı
- App passwords → Yeni password oluştur
- 16 karakterlik şifreyi kopyala

### 2. Settings Advanced'dan Yapılandır

Dashboard → Settings → Advanced → SMTP:

```
Host: smtp.gmail.com
Port: 587
Secure: false
Username: hello@luwi.dev
Password: [Google App Password]
From Name: Luwi Semantic Bridge
From Email: hello@luwi.dev
Enabled: true
```

### 3. Backend Email Servisi

```bash
cd backend
npm install nodemailer @types/nodemailer
```

Detaylı bilgi için backend README'ye bakın.
