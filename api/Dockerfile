FROM node:18-alpine
WORKDIR /app

# Ortam değişkenlerini Docker build aşamasında kullanmak için
ARG OPENAI_API_KEY
ARG DEEPSEEK_API_KEY
ARG HUGGINGFACE_API_KEY
ARG ANTHROPIC_API_KEY

# Sadece bağımlılıklar için gerekli dosyaları kopyala
COPY package*.json ./
# Build sırasında --secret kullanarak key'leri güvenli bir şekilde kullan
RUN npm install --production

# Önce paylaşılan modülleri kopyala
COPY src/shared/ ./src/shared/

# Sonra API'nin geri kalanını kopyala
COPY . ./

# Ve config dosyasını
COPY ../config/ ./config/

EXPOSE 8083
CMD ["node", "server.js"]
