# 🌟 Alice Semantic Bridge - Site Haritası & Dokümantasyon

## 📋 Mevcut Site Durumu

**Alice Semantic Bridge**, enterprise-grade bir AI platformu olarak tasarlanmış ve şu an itibarıyla **tam fonksiyonel** durumdadır.

### 🎯 Platform Özeti
- **Durum**: ✅ TAM FONKSİYONEL
- **Sağlık**: 10/10 (Perfect System Health)
- **Kullanıcı Sayısı**: 551+ aktif konuşma, 972+ mesaj
- **Yanıt Süresi**: 24-31 saniye (kompleks sorgular için)
- **AI Sağlayıcıları**: OpenAI, Claude, Gemini, DeepSeek, Ollama

## 🎯 Site Akış Mantığı

### 🔄 Authentication Flow
```
1️⃣ Ziyaretçi → 2️⃣ Kurulum Kontrolü → 3️⃣ Login → 4️⃣ Chat/Dashboard
```

**Flow Açıklaması:**
- **Setup Check**: Admin kullanıcısı var mı?
- **Admin Yoksa**: `/setup/deploy` → kurulum sihirbazı
- **Admin Varsa**: `/login` → kimlik doğrulama
- **Login Sonrası**:
  - **Admin**: Dashboard seçimi (chat veya dashboard)
  - **Kullanıcı**: Direkt chat arayüzü

## 📱 Ana Menü Yapısı

### 🏠 **Ana Sayfa (/)**
**Fonksiyon:** Chat Bot Arayüzü
- **Hedef Kitle:** Tüm kullanıcılar
- **Özellikler:**
  - Real-time AI chat
  - Türkçe/İngilizce dil desteği
  - Semantic search 15+ kaynak ile
  - WebSocket streaming
  - Konuşma geçmişi
  - Kaynak atıfları

### 🔐 **Kimlik Doğrulama (/login)**
**Fonksiyon:** Giriş ve kayıt
- **Hedef Kitle:** Misafir kullanıcılar
- **Özellikler:**
  - 3D küp animasyonu
  - Dark theme modern tasarım
  - Glassmorphic UI
  - Toast notifications
  - Admin/Regular user ayrımı
  - "Şifremi unuttum" özelliği

### 🛠️ **Dashboard (/dashboard)**
**Fonksiyon:** Admin yönetim paneli
- **Hedef Kitle:** Admin kullanıcılar
- **Özellikler:**
  - Sistem istatistikleri
  - Embedding yönetimi
  - Kullanıcı activity takibi
  - Console logları
  - Performans metrikleri
  - Quick access linkleri

## 📂 Alt Sayfaların Yapısı

### 🎯 **Dashboard Modülleri**

#### 1. ⚙️ **Settings (/dashboard/settings)**
- **9 Ana Kategori:**
  - 🤖 LLM Settings (OpenAI, Claude, Gemini, DeepSeek)
  - 🔍 Embeddings Settings (Provider, model, chunking)
  - 🧠 RAG Settings (Similarity, thresholds, search)
  - 📊 App Settings (Genel uygulama ayarları)
  - 🗄️ Database Settings (PostgreSQL, bağlantı)
  - 🔴 Redis Settings (Cache, session management)
  - 🛡️ Security Settings (Rate limiting, CORS)
  - 📢 SMTP Settings (Email konfigürasyonu)
  - 🕷️ Scraper Settings (Web scraping ayarları)

#### 2. 📄 **Documents (/dashboard/documents)**
- **5 Ana Sekme:**
  - 📚 Library (Tüm belgeler)
  - 📤 Upload (Belge yükleme)
  - 🔍 Search (Belge arama)
  - 📊 Stats (İstatistikler)
  - ⚡ Process (OCR & embedding)

#### 3. 🔄 **Migrations (/dashboard/migrations)**
- **Embedding Yönetimi:**
  - Veri taşıma işlemleri
  - Embedding durum takibi
  - Progress monitoring
  - Migration history

#### 4. 🌐 **Scraper (/dashboard/scrapes)**
- **Web Scraping Sistemi:**
  - Project yönetimi
  - Site konfigürasyonları
  - Scraping progress monitoring
  - Results processing
  - AI-powered analysis

#### 5. 💬 **Messages (/dashboard/messages)**
- **Chat Analytics:**
  - Konuşma istatistikleri
  - Message history
  - User interaction analizi
  - Popüler konular
  - Sentiment analysis

### 🔧 **Setup & Installation**

#### 🚀 **Setup (/setup)**
- **Kurulum Süreci:**
  - `/setup/deploy` - Ana kurulum
  - `/setup/simple-setup` - Hızlı kurulum
  - `/setup/landing` - Kurulum sayfası

#### 🔧 **Install (/install)**
- **Sistem Kurulumu:**
  - Database setup
  - Initial configuration
  - User management

### 👤 **User Management**

#### 📝 **Register (/register)**
- **Kullanıcı Kaydı:**
  - Yeni kullanıcı oluşturma
  - Email doğrulama
  - Profile setup

#### 👤 **Profile (/profile)**
- **Kullanıcı Profili:**
  - Kişisel bilgiler
  - Ayarlar
  - Subscription yönetimi

### 🛠️ **Advanced Features**

#### 🔍 **Search (/dashboard/search)**
- **Arama Sistemi:**
  - Semantic search
  - Full-text search
  - Hybrid search
  - Filter options

#### 📊 **Analytics (/dashboard/analytics)**
- **Performans Analizi:**
  - Sistem metrikleri
  - User behavior
  - Usage patterns

#### ⚡ **Services (/dashboard/services)**
- **Servis Yönetimi:**
  - Servis durumu
  - Performance monitoring
  - Log management

#### 🧪 **Development Tools**
- **Debug & Test:**
  - `/dashboard/logs` - Sistem logları
  - `/dashboard/query` - Database sorguları
  - `/dashboard/system-monitor` - Sistem monitoring
  - `/dashboard/console` - Geliştirici konsolu
  - `/dashboard/websocket-test` - WebSocket test

## 🎨 **UI/UX Özellikleri**

### 🎯 **Modern Tasarım Unsurları**
- ✅ **Glassmorphic Design**: Cam efektli modern UI
- ✅ **Dark/Light Theme**: Kullanıcı tercihine göre
- ✅ **Skeleton Loading**: Modern loading animasyonları
- ✅ **Micro-interactions**: Hover efektleri ve animasyonlar
- ✅ **Responsive Design**: Mobil uyumlulu
- ✅ **Real-time Updates**: WebSocket tabanlı güncellemeler

### 📱 **Responsive Breakpoints**
- **Mobil**: 320px - 768px
- **Tablet**: 768px - 1024px
- **Desktop**: 1024px+

### 🎨 **Renk Paleti**
- **Primary**: Blue-600 / Purple-600 gradient
- **Secondary**: Gray-500 / Slate-700
- **Success**: Green-500
- **Warning**: Yellow-500
- **Error**: Red-500
- **Info**: Blue-500

## 🔗 **Navigasyon Hiyerarşisi**

### 📊 **Breadcrumb Yapısı**
```
Home > Dashboard > Settings > LLM Settings
Home > Dashboard > Documents > Library
Home > Dashboard > Migrations > Embeddings
```

### 🧭 **Quick Access**
Dashboard'daki hızlı erişim linkleri:
- 🔄 **Data Migrations** → `/dashboard/migrations`
- 🌐 **Web Scraper** → `/dashboard/scrapes`
- 📄 **Document Manager** → `/dashboard/documents`

### 🔍 **Search Functionality**
- **Global Search**: Tüm sistemde arama
- **Content Search**: Belge içinde arama
- **User Search**: Kullanıcı araması

## 🎯 **Kullanıcı Rollerine Göre Menü**

### 👑 **Admin Kullanıcısı**
- ✅ Dashboard (tüm modüller)
- ✅ Settings (tüm kategoriler)
- ✅ User management
- ✅ System monitoring
- ✅ Analytics & raporlar
- ✅ Development tools

### 👤 **Regular Kullanıcı**
- ✅ Chat interface (ana sayfa)
- ✅ Profile yönetimi
- ✅ Personal settings
- ✅ Konuşma geçmişi
- ⚠️ Limited dashboard erişimi

### 🌐 **Misafir Kullanıcı**
- ✅ Login / Register
- ✅ Public information (eğer mevcut)
- ❌ Dashboard erişimi (login gerektirir)

## 🚀 **Önerilen Navigasyon Stratejisi**

### 📱 **Mobile-First Approach**
1. **Ana Sayfa** → Chat interface (hızlı erişim)
2. **Hamburger Menu** → Dashboard için
3. **Quick Actions** → Sık kullanılan özellikler

### 🖥️ **Desktop Experience**
1. **Sidebar Navigation** → Dashboard modülleri
2. **Top Navigation** → User profile, notifications
3. **Quick Access Cards** → Önemli özellikler

## 📊 **Site Metrikleri**

### 📈 **Performans Hedefleri**
- **Load Time**: < 2 saniye
- **First Contentful Paint**: < 1.5 saniye
- **Time to Interactive**: < 2.5 saniye
- **Lighthouse Score**: 90+

### 🔍 **SEO Optimizasyonu**
- Meta tags ve descriptions
- Semantic HTML structure
- Mobile responsiveness
- Fast loading times
- Search engine friendly URLs

---

## 📚 **Dokümantasyon Referansları**

- [Chatbot Features](./chatbot-features.md) - Chatbot özellikleri detayları
- [API Documentation](./api-documentation.md) - API endpoint'leri
- [Development Guide](./development-guide.md) - Geliştirici kılavuzu

---

*Son Güncelleme: 17 Ekim 2025*
*Versiyon: v2.0.0*
*Platform: Next.js 15.5.2 + Node.js Backend*