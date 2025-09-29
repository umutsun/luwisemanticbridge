# Geliştirme Planı

## 1. Backend: Akıllı Soru Seçimi (rag-chat.service.ts)

- **Durum:** Tamamlandı.
- **Açıklama:** `ONERILER.md` dosyasında belirtilen `selectSmartQuestions` fonksiyonu `rag-chat.service.ts` dosyasına eklendi ve ilgili yerde çağrıldı. Bu sayede, kullanıcıya sunulan ilgili sorular daha çeşitli ve kategorize edilmiş bir şekilde gösterilecek.

## 2. Frontend: Anlamlı Kaynak Gösterimi (SourceCitation.tsx)

- **Durum:** Tamamlandı.
- **Açıklama:** `SourceCitation.tsx` bileşenindeki `formatSourceTitle` ve `formatSourceExcerpt` fonksiyonları, `ONERILER.md` dosyasında belirtilen şekilde güncellendi. Bu değişikliklerle, kaynak başlıkları ve özetleri daha temiz ve anlamlı bir şekilde gösterilecek.

## 3. Progress Göstergesi (CSS)

- **Durum:** Tamamlandı.
- **Açıklama:** `globals.css` dosyasına, `ONERILER.md` dosyasında belirtilen `.source-progress` ve `.source-progress-bar` sınıfları eklendi. Bu stiller, kaynakların alaka düzeyini gösteren minimal bir ilerleme çubuğu eklemek için kullanılabilir.

## Sonraki Adımlar

- Projenin mevcut haliyle test edilmesi ve yapılan değişikliklerin doğrulanması.
- Test sonuçlarına göre gerekli hata ayıklama ve iyileştirmelerin yapılması.
- Projenin son halinin kullanıcıya sunulması.

