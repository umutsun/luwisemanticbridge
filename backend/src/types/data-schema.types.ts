/**
 * Data Schema Types
 *
 * Kullanıcının veri yapısını tanımlaması ve LLM'in doğru yorumlaması için
 * gerekli tip tanımlamaları.
 *
 * Akış: Analyze → Embed → Search → Citation → Question
 */

// Alan tipleri
export type FieldType =
  | 'string'      // Genel metin
  | 'number'      // Sayısal değer
  | 'date'        // Tarih (format ile birlikte)
  | 'currency'    // Para birimi
  | 'percentage'  // Yüzde değeri
  | 'reference'   // Referans (kanun no, madde no vs.)
  | 'category'    // Kategori/sınıflandırma
  | 'entity'      // Named entity (kişi, kurum vs.)
  | 'boolean';    // Evet/Hayır

// Tek bir alan tanımı
export interface SchemaField {
  key: string;              // Unique identifier (snake_case)
  label: string;            // Görüntüleme adı (Türkçe)
  type: FieldType;          // Alan tipi
  format?: string;          // Tarih formatı vs. (DD.MM.YYYY)
  required?: boolean;       // Zorunlu mu?
  extractionHint?: string;  // LLM'e çıkarım ipucu
  displayOrder?: number;    // Gösterim sırası
  showInCitation?: boolean; // Citation'da gösterilsin mi?
  showInTags?: boolean;     // Tag olarak gösterilsin mi?
}

// Template değişken tipi
export interface TemplateVariable {
  key: string;              // {{key}} olarak kullanılır
  description: string;      // Açıklama
  example?: string;         // Örnek değer
}

// Ana Data Schema yapısı
export interface DataSchema {
  id: string;               // Unique ID (UUID)
  name: string;             // Schema adı (vergi_mevzuati)
  displayName: string;      // Görüntüleme adı (Vergi Mevzuatı)
  description: string;      // Detaylı açıklama

  // Alan tanımları
  fields: SchemaField[];

  // Template tanımları
  templates: {
    // Belge analiz prompt'u - {{content}} değişkeni otomatik eklenir
    analyze: string;

    // Citation gösterim formatı
    // Örnek: "{{source_table}} - {{kanun_no}} Md.{{madde_no}}"
    citation: string;

    // Excerpt gösterim formatı (opsiyonel)
    // Örnek: "{{excerpt | truncate:200}}"
    excerpt?: string;

    // Takip sorusu kalıpları
    // Örnek: ["{{madde_no}}. maddenin istisnaları nelerdir?"]
    questions: string[];
  };

  // LLM'e veri hakkında kılavuz
  // Bu metin system prompt'a eklenir
  llmGuide: string;

  // Source table mapping (hangi tablolara uygulanır)
  sourceTables?: string[];

  // Metadata
  isActive: boolean;
  isDefault?: boolean;      // Varsayılan schema mı?
  createdAt: Date;
  updatedAt: Date;
}

// Settings'te saklanacak konfigürasyon
export interface DataSchemaConfig {
  activeSchemaId?: string;  // Aktif schema ID
  schemas: DataSchema[];    // Tüm schema'lar
  globalSettings: {
    enableAutoDetect: boolean;    // Otomatik schema tespiti
    fallbackSchemaId?: string;    // Tespit edilemezse kullanılacak
    maxFieldsInCitation: number;  // Citation'da max alan sayısı
    maxQuestionsToGenerate: number; // Max takip sorusu sayısı
  };
}

// API Response tipleri
export interface DataSchemaListResponse {
  schemas: DataSchema[];
  activeSchemaId?: string;
}

export interface DataSchemaResponse {
  schema: DataSchema;
}

// Template işleme için helper tipler
export interface TemplateContext {
  [key: string]: string | number | boolean | undefined;
}

export interface ProcessedCitation {
  text: string;
  fields: Array<{
    key: string;
    value: string;
    label: string;
  }>;
}

export interface ProcessedQuestion {
  text: string;
  basedOn: string[];  // Hangi alanlara dayalı
}

// Varsayılan schema örnekleri
export const DEFAULT_SCHEMAS: Partial<DataSchema>[] = [
  {
    name: 'emlak_mevzuati',
    displayName: 'Emlak Mevzuatı',
    description: 'İmar kanunları, plan notları, belediye kararları ve emlak hukuku',
    fields: [
      // Coğrafi Kapsam (Hiyerarşik)
      { key: 'scope', label: 'Kapsam', type: 'category', showInTags: true, extractionHint: 'TR (Türkiye geneli), İL adı (IZMIR), veya İLÇE adı (BORNOVA, KARSIYAKA)' },
      // Belge Tipi
      { key: 'doc_type', label: 'Belge Tipi', type: 'category', showInTags: true, extractionHint: 'Kanun, Yönetmelik, Plan_Notu, Meclis_Karari, Emsal_Karar, Teknik_Sartname' },
      // Konu Etiketi
      { key: 'topic', label: 'Konu', type: 'category', showInTags: true, extractionHint: 'Insaat_Hakki, Emsal, Kentsel_Donusum, Kiraci_Hukuku, Otopark, Siginak, Cekme_Mesafesi' },
      // Geçerlilik
      { key: 'validity_year', label: 'Geçerlilik Yılı', type: 'number', showInCitation: true, extractionHint: 'Belgenin geçerli olduğu yıl (2024, 2023...)' },
      // Referanslar
      { key: 'kanun_no', label: 'Kanun No', type: 'reference', showInCitation: true, extractionHint: 'İmar Kanunu (3194), Kat Mülkiyeti (634) vb.' },
      { key: 'madde_no', label: 'Madde', type: 'reference', showInCitation: true },
      { key: 'karar_no', label: 'Karar No', type: 'reference', extractionHint: 'Meclis karar numarası veya Danıştay karar no' },
      // Tarih
      { key: 'tarih', label: 'Tarih', type: 'date', format: 'DD.MM.YYYY', showInCitation: true },
      // Sayısal değerler
      { key: 'emsal', label: 'Emsal', type: 'number', extractionHint: 'İnşaat alanı katsayısı (0.30, 1.50 vb.)' },
      { key: 'taks', label: 'TAKS', type: 'percentage', extractionHint: 'Taban alanı kat sayısı' },
      { key: 'max_kat', label: 'Max Kat', type: 'number', extractionHint: 'İzin verilen maksimum kat sayısı' }
    ],
    templates: {
      analyze: `Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:
- Coğrafi kapsam (Türkiye geneli mi, hangi il/ilçe?)
- Belge tipi (Kanun, Yönetmelik, Plan Notu, Meclis Kararı, Emsal Karar?)
- Ana konu (İnşaat hakkı, emsal, kentsel dönüşüm, otopark, sığınak?)
- Geçerlilik yılı
- Kanun/madde numaraları
- Emsal, TAKS, kat yüksekliği gibi sayısal değerler`,
      citation: '{{doc_type}} - {{scope}} - {{topic}}',
      questions: [
        '{{scope}} bölgesinde {{topic}} hakkında güncel kurallar nelerdir?',
        '{{kanun_no}} sayılı kanunun {{madde_no}}. maddesi ne diyor?',
        '{{scope}} için emsal ve TAKS değerleri nedir?'
      ]
    },
    llmGuide: `Bu veri Türk emlak ve imar mevzuatını içermektedir.

KAPSAM HİYERARŞİSİ (scope):
- TR: Türkiye geneli geçerli (Anayasa, İmar Kanunu, Planlı Alanlar Yönetmeliği)
- İL (örn: IZMIR): İl geneli (Büyükşehir Belediye yönetmelikleri, meclis kararları)
- İLÇE (örn: BORNOVA): İlçe özel (Plan notları, parsel bazlı kararlar)

ÇAKIŞMA KURALI: Yerel plan notu > İl yönetmeliği > Ulusal mevzuat
Eğer ilçe plan notu farklı bir emsal veriyorsa, PLAN NOTU GEÇERLİDİR.

TEMEL KAYNAKLAR:
- İmar Kanunu (3194)
- Planlı Alanlar İmar Yönetmeliği
- Kat Mülkiyeti Kanunu (634)
- Kentsel Dönüşüm Kanunu (6306)
- Belediye meclis kararları
- Danıştay kararları

Emsal değerleri genellikle 0.30-3.00 arasındadır. TAKS %30-%60 aralığında olur.`
  },
  {
    name: 'vergi_mevzuati',
    displayName: 'Vergi Mevzuatı',
    description: 'Türk vergi kanunları, özelgeler ve Danıştay kararları',
    fields: [
      { key: 'kanun_no', label: 'Kanun No', type: 'reference', showInCitation: true, extractionHint: 'Kanun numarası (örn: 193, 3065, 5520)' },
      { key: 'madde_no', label: 'Madde', type: 'reference', showInCitation: true, extractionHint: 'Madde numarası' },
      { key: 'tarih', label: 'Tarih', type: 'date', format: 'DD.MM.YYYY', showInCitation: true },
      { key: 'ozelge_no', label: 'Özelge No', type: 'reference', extractionHint: 'Özelge sayısı/numarası' },
      { key: 'karar_no', label: 'Karar No', type: 'reference', extractionHint: 'Danıştay karar numarası' },
      { key: 'konu', label: 'Konu', type: 'category', showInTags: true },
      { key: 'vergi_turu', label: 'Vergi Türü', type: 'category', showInTags: true, extractionHint: 'GVK, KVK, KDV, ÖTV vb.' }
    ],
    templates: {
      analyze: `Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:
- Kanun numarası ve madde numarası
- Tarih bilgisi
- Özelge veya karar numarası
- Ana konu ve vergi türü
- Önemli hükümler ve istisnalar`,
      citation: '{{vergi_turu}} - {{kanun_no}} Md.{{madde_no}}',
      questions: [
        '{{madde_no}}. maddenin uygulama esasları nelerdir?',
        '{{kanun_no}} sayılı kanundaki istisnalar nelerdir?',
        '{{konu}} hakkında güncel mevzuat değişiklikleri var mı?'
      ]
    },
    llmGuide: `Bu veri Türk vergi mevzuatını içermektedir. Kaynaklar arasında:
- Gelir Vergisi Kanunu (GVK - 193)
- Kurumlar Vergisi Kanunu (KVK - 5520)
- Katma Değer Vergisi Kanunu (KDV - 3065)
- Vergi Usul Kanunu (VUK - 213)
- Gelir İdaresi Başkanlığı özelgeleri
- Danıştay vergi dava kararları
Tarihler DD.MM.YYYY formatındadır. Madde numaraları genellikle "Md." kısaltmasıyla belirtilir.`
  },
  {
    name: 'emlak_ilanlari',
    displayName: 'Emlak İlanları',
    description: 'Gayrimenkul satış ve kiralama ilanları',
    fields: [
      { key: 'fiyat', label: 'Fiyat', type: 'currency', showInCitation: true },
      { key: 'metrekare', label: 'm²', type: 'number', showInCitation: true },
      { key: 'oda_sayisi', label: 'Oda', type: 'string', showInCitation: true },
      { key: 'il', label: 'İl', type: 'string', showInTags: true },
      { key: 'ilce', label: 'İlçe', type: 'string', showInTags: true },
      { key: 'mahalle', label: 'Mahalle', type: 'string' },
      { key: 'ilan_tarihi', label: 'İlan Tarihi', type: 'date', format: 'DD.MM.YYYY' },
      { key: 'emlak_tipi', label: 'Emlak Tipi', type: 'category', showInTags: true, extractionHint: 'Daire, Villa, Arsa, İşyeri vb.' }
    ],
    templates: {
      analyze: `Bu emlak ilanını analiz et ve aşağıdaki bilgileri çıkar:
- Fiyat (TL cinsinden)
- Metrekare
- Oda sayısı (3+1, 2+1 formatında)
- Konum bilgileri (il, ilçe, mahalle)
- Emlak tipi`,
      citation: '{{emlak_tipi}} - {{oda_sayisi}} - {{metrekare}}m² - {{fiyat}}',
      questions: [
        '{{ilce}} bölgesinde benzer fiyatlı ilanlar var mı?',
        '{{metrekare}}m² civarı emlakların fiyat ortalaması nedir?',
        '{{il}} ilinde {{emlak_tipi}} piyasası nasıl?'
      ]
    },
    llmGuide: `Bu veri Türkiye emlak piyasası ilanlarını içermektedir.
Fiyatlar Türk Lirası (TL) cinsindendir. Büyük rakamlar milyon olarak ifade edilebilir.
Oda sayısı genellikle "3+1" formatında belirtilir (3 oda + 1 salon).
m²/kare fiyatı önemli bir karşılaştırma metriğidir.`
  },
  {
    name: 'genel_dokuman',
    displayName: 'Genel Doküman',
    description: 'Varsayılan genel amaçlı şema',
    fields: [
      { key: 'baslik', label: 'Başlık', type: 'string', showInCitation: true },
      { key: 'tarih', label: 'Tarih', type: 'date', format: 'DD.MM.YYYY' },
      { key: 'kategori', label: 'Kategori', type: 'category', showInTags: true },
      { key: 'yazar', label: 'Yazar', type: 'entity' },
      { key: 'kaynak', label: 'Kaynak', type: 'string' }
    ],
    templates: {
      analyze: `Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:
- Başlık veya ana konu
- Tarih bilgisi
- Kategori veya sınıflandırma
- Yazar veya kaynak`,
      citation: '{{baslik}}',
      questions: [
        '{{baslik}} hakkında daha fazla bilgi',
        '{{kategori}} konusunda başka kaynaklar var mı?'
      ]
    },
    llmGuide: 'Genel amaçlı doküman. Yapısal bilgiler mevcut değilse içerikten anlam çıkar.'
  }
];
