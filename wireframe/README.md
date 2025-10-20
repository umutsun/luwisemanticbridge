# Wireframe Showroom

Müşteriden gelen JSX wireframe çalışmalarını incelemek ve renderlamak için oluşturulmuş bağımsız bir Next.js projesi.

## 🚀 Çalıştırma

Sunucuyu başlatmak için:
```bash
npm run dev
```

## 🔗 Bağlantılar

- **Wireframe Ana Sayfa:** http://localhost:4001
- **Pinokyo Ürün Sayfası:** http://localhost:4001/pinokyo
- **Mevcut Frontend:** http://localhost:4000

## 📱 Mevcut Wireframe'ler

### 1. Pinokyo Ürün Sayfası
- **URL:** `/pinokyo`
- **Açıklama:** Pinokyo kitabının detaylı ürün sayfası wireframe'i
- **Özellikler:** Ürün bilgileri, temalar, etkinlik önerileri, benzer kitaplar

### 2. Ana Sayfa
- **URL:** `/`
- **Açıklama:** Wireframe projesinin ana giriş sayfası
- **İçerik:** Proje detayları, teknoloji bilgisi, gezinme

## 🛠 Teknoloji Stack

- **Next.js 15** - React framework
- **React 19** - UI kütüphanesi
- **TypeScript** - Tür güvenliği
- **Tailwind CSS** - Styling framework
- **Framer Motion** - Animasyonlar
- **Lucide React** - İkonlar
- **Radix UI** - UI bileşenleri

## 📁 Dosya Yapısı

```
wireframe/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Ana sayfa
│   │   ├── pinokyo/
│   │   │   └── page.tsx          # Pinokyo sayfası
│   │   └── layout.tsx            # Root layout
│   ├── components/
│   │   ├── ui/                   # UI bileşenleri
│   │   │   ├── button.tsx
│   │   │   └── card.tsx
│   │   ├── motion/               # Animasyon bileşenleri
│   │   │   └── motion.tsx
│   │   └── WireframeNavigation.tsx
│   └── styles/
│       └── globals.css
├── package.json
├── tailwind.config.js
├── next.config.js
└── README.md
```

## 🎨 Özellikler

- ✅ Bağımsız proje yapısı
- ✅ Mevcut projeye karışmaz
- ✅ TypeScript desteği
- ✅ Modern UI/UX
- ✅ Responsive tasarım
- ✅ Framer Motion animasyonları
- ✅ Tailwind CSS styling
- ✅ Bağımsız port (4001)

## 📋 İndirme Yönergeleri

Yeni wireframe dosyalarını indirmek için:

1. **Klasör Yapısı:**
   ```
   wireframe/
   ├── [müşteri_adi]_[wireframe_adi].tsx  # Yeni wireframe
   └── README.md                           # Bu dosya
   ```

2. **Component Düzenlemesi:**
   - `.jsx` dosyasını `.tsx` olarak kaydedin
   - "use client" direktifini ekleyin
   - Component'yi WireframeNavigation'a ekleyin

3. **Sayfa Oluşturma:**
   - `src/app/[sayfa]/page.tsx` oluşturun
   - URL yapısına uygun rota ekleyin

## 🔍 İnceleme Adımları

1. **Yapısal İnceleme:** Component hiyerarşisini kontrol et
2. **Stil Kontrolü:** CSS/Tailwind kullanımını incele
3. **Veri Akışı:** Statik veri yapısını kontrol et
4. **Responsive Tasarım:** Mobil uyumluluğunu test et
5. **Performans:** Optimizasyonları kontrol et

## 📞 Erişim

Bu proje iki bağımsız sunucu üzerinde çalışır:
- **Frontend:** http://localhost:4000 (Mevcut proje)
- **Wireframe:** http://localhost:4001 (Bu proje)

İkisi de aynı anda çalışabilir ve birbirlerine karışmaz.