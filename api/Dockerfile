# Node.js'in Alpine tabanlı, hafif bir versiyonunu kullan
FROM node:18-alpine

# Uygulama dosyaları için /app adında bir klasör oluştur
WORKDIR /app

# Önce bağımlılık dosyalarını kopyala
COPY package*.json ./

# Install any needed packages
RUN rm -f package-lock.json
RUN npm install

# Projenin geri kalan tüm dosyalarını kopyala
COPY . .

# Uygulamanın çalışacağı 3000 portunu dışarıya aç
EXPOSE 3000

# Konteyner başladığında çalıştırılacak komut
CMD ["node", "server.js"]
