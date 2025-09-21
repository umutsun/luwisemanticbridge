# Sunucu Embedding Performans Rehberi

## Genel Bakış
Bu rehber, embedding işlemleri için sunucu optimizasyonu ve kapasite planlaması hakkında bilgiler içerir.

## Sunucu Kapasitesi Tahminleri

### İşlemci (CPU)
- **8-16 core** standart bir sunucuda **20-50 paralel worker** mümkün
- **32+ core** yüksek performanslı sunucuda **100+ worker**
- En kritik faktör: Her worker ayrı bir thread olduğu için CPU thread sayısı önemli

### Bellek (RAM)
- **16GB RAM**: ~10-20 worker
- **32GB RAM**: ~30-50 worker
- **64GB RAM**: ~50-100 worker
- Her worker ~500MB-1GB RAM kullanıyor

### İnternet/Bant Genişliği
- **100 Mbps**: ~50-100 request/saniye
- **1 Gbps**: ~500-1000 request/saniye
- API rate limits (OpenAI: 3500 RPM, Google: 60 QPM)

## Model Bazında Performans

### Hugging Face (Yerel)
- **E5-Mistral/BGE-M3**: ~10-100 doküman/saniye (GPU ile daha hızlı)
- CPU: ~5-10 doküman/saniye
- Sınırsız API çağrısı

### OpenAI text-embedding-3-large
- ~3000 embedding/dakika
- Daha yüksek kalite ama limitli

### Google text-embedding-004
- ~60 query/dakika
- En kaliteli ama en kısıtlı

## Önerilen Konfigürasyon

### Standart Sunucu için (8 core, 32GB RAM)
```
Worker Count: 20-30
Batch Size: 50-100
Model: Hugging Face (yerel)
Tahmini hız: 500-1000 doküman/dakika
```

### Yüksek Performanslı Sunucu (32 core, 64GB RAM)
```
Worker Count: 50-100
Batch Size: 100-200
Model: Hugging Face + GPU
Tahmini hız: 2000-5000 doküman/dakika
```

## Optimizasyon Önerileri

### 1. Rate Limiting
API limitlerine göre worker sayısını ayarla:
- OpenAI: 3500 request/dakika
- Google: 60 query/dakika
- Hugging Face: Sınırsız

### 2. Batch Size Optimization
- Başlangıç: 50-100
- Test ederek optimum değeri bul
- Daha büyük batch = daha az API çağrısı ama daha fazla RAM

### 3. GPU Kullanımı
- Hugging Face modellerinde 10x hız artışı
- CUDA destekli GPU şart
- Ek maliyet ama değerli yatırım

### 4. Queue System
- RabbitMQ veya Redis Queue
- Job yönetimi ve yeniden deneme mekanizması
- Load balancing

### 5. Database Optimizasyon
- Bağlantı havuzu (connection pooling)
- Index optimizasyonu
- Batch insert kullanımı

### 6. Caching
- Redis ile duplicate check optimizasyonu
- Embedding sonuçlarını cache'leme
- Progress state yönetimi

## Gerçekçi Performans Hedefleri

### Küçük Ölçekli (VPS/Dedicated)
- **10,000-30,000 doküman/saat**
- 4-8 core, 16GB RAM
- Uygun maliyetli çözüm

### Orta Ölçekli
- **30,000-100,000 doküman/saat**
- 16-32 core, 32-64GB RAM
- En yaygın kullanım

### Büyük Ölçekli
- **100,000+ doküman/saat**
- 64+ core, 128GB+ RAM
- Enterprise düzeyi

## Deployment Kontrol Listesi

### Önce Test
1. [ ] Geliştirme ortamında test et
2. [ ] Farklı worker sayıları dene
3. [ ] Memory usage monitor et
4. [ ] API limitlerini kontrol et

### Production
1. [ ] Monitor sistemi kur (Prometheus/Grafana)
2. [ ] Alert mekanizmaları ekle
3. [ ] Backup planı hazırla
4. [ ] Load testing yap

### Bakım
1. [ ] Düzenli log kontrolü
2. [ ] Performance monitoring
3. [ ] Güncelleme yönetimi
4. [ ] Kapasite planlaması

## İpuçları ve En İyi Pratikler

1. **Başlangıçta konservatif ol** - 10-15 worker ile başla
2. **Yavaş yavaş artır** - CPU/RAM kullanımını izle
3. **Monitor et** - Anomali tespiti için
4. **Scale horizontally** - Daha fazla worker yerine daha fazla sunucu
5. **Cost optimization** - Maliyet/fayda dengesi kur

## Notlar
- Bu tahminler ortalama doküman boyutuna (1-2KB) göredir
- Gerçek performans doküman içeriğine göre değişir
- Network latency önemli faktördür
- Database performansı kritik öneme sahiptir