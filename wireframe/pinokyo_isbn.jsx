import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Heart, ShoppingCart, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

export default function PinokyoUrunSayfasiMockup() {
  const productMeta = [
    { key: "Yazar", value: "Carlo Collodi" },
    { key: "Çizer", value: "Enrico Mazzanti" },
    { key: "Yayınevi", value: "İş Bankası Kültür Yayınları" },
    { key: "ISBN", value: "9786052955918" },
    { key: "Sayfa Sayısı", value: "120" },
    { key: "Boyut", value: "13.5 × 19.5 cm" },
    { key: "Kapak", value: "Karton Kapak" },
    { key: "Basım Yılı", value: "2025" },
  ];

  const relatedBooks = [
    {
      title: "Alice Harikalar Diyarında",
      image: "https://cdn.iskultur.com.tr/images/urunler/alice-harikalar-diyarinda-9786053327882.jpg",
    },
    {
      title: "Peter Pan",
      image: "https://cdn.iskultur.com.tr/images/urunler/peter-pan-9786052955857.jpg",
    },
    {
      title: "Oz Büyücüsü",
      image: "https://cdn.iskultur.com.tr/images/urunler/oz-buyucusu-9786052955864.jpg",
    },
    {
      title: "Polyanna",
      image: "https://cdn.iskultur.com.tr/images/urunler/polyanna-9786052955871.jpg",
    },
  ];

  const bookBenefits = [
    { title: "Okuma alışkanlığı", description: "Kısaltılmış, akıcı metin küçük okurlar için erişilebilirlik sağlar." },
    { title: "Kelime dağarcığı", description: "Klasik bir eserden seçilmiş sözcükler ve ifade kalıpları kazandırır." },
    { title: "Duygusal gelişim", description: "Pişmanlık, sevinç, korku gibi duyguların güvenli bir bağlamda tanınmasını destekler." },
    { title: "Değerler eğitimi", description: "doğruluk, sorumluluk, çalışkanlık temalarını pekiştirir." },
    { title: "Problem çözme", description: "Karar–sonuç ilişkisini görerek çıkarım yapma becerisini güçlendirir." },
    { title: "Hayal gücü", description: "Fantezi unsurlarıyla yaratıcı düşünmeyi teşvik eder." },
  ];

  const bookThemes = ["Dürüstlük", "Sorumluluk", "Aile Sevgisi", "Arkadaşlık", "Merak & Keşif", "İyilik–Kötülük", "Cesaret", "Disiplin", "Empati"];

  const activities = [
    { title: "Pinokyo Kuklası Yapımı", description: "Basit malzemelerle (tahta çubuk, karton, ip) kendi Pinokyo kuklalarını tasarlayabilirler." },
    { title: "Doğruluk Günlüğü", description: "Çocuklardan bir hafta boyunca doğru davrandıkları durumları yazdıkları küçük bir günlük tutmaları istenir." },
    { title: "Rol Oyunu", description: "'Pinokyo'nun Yerinde Olsaydım' temalı kısa canlandırmalarla empati ve problem çözme becerileri desteklenir." },
    { title: "Yalan Burnu Deneyi", description: "Kartondan yapılan uzayan burun ile yalan söylemenin sonuçları üzerine mizahi bir etkinlik yapılır." },
    { title: "Değer Afişi Hazırlama", description: "Sınıfça doğruluk, sevgi, çalışkanlık gibi değerleri resim ve sözcüklerle afişe dönüştürürler." },
    { title: "Okuma Sonrası Tartışma Kartları", description: "Pinokyo neden bazen yalan söylerdi?' gibi açık uçlu sorularla kitap sohbeti yapılır." },
    { title: "Yaratıcı Yazma", description: "'Pinokyo günümüzde yaşasaydı...' konulu kısa hikâyeler yazılarak yaratıcılık geliştirilir." },
  ];

  const ageGroupActivities = {
    "6–8 Yaş": [
      "Pinokyo kuklası yapımı (motor beceri gelişimi).",
      "Yalan Burnu Deneyi – mizahi drama çalışması.",
      "Doğruluk Günlüğü – resimli mini defter etkinliği."
    ],
    "9–11 Yaş": [
      "Rol Oyunu – Pinokyo'nun karar anlarını tartışarak sahneleme.",
      "Değer Afişi – grup çalışmasıyla afiş tasarlama.",
      "Okuma Sonrası Tartışma Kartları – kavram geliştirme."
    ],
    "12 Yaş ve Üzeri": [
      "Yaratıcı Yazma – 'Pinokyo günümüzde yaşasaydı...' temalı hikâye yazımı.",
      "Kısa Film Tasarımı – grupça Pinokyo'nun bir sahnesini günümüze uyarlama.",
      "Değerler Atölyesi – doğruluk ve empati üzerine tartışma oturumu."
    ]
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-2 font-bold text-xl text-sky-700">
            <BookOpen className="w-6 h-6" />
            Çocuk Kitapları
          </div>
          <div className="hidden md:flex gap-6 text-sm font-medium">
            <a href="#">Ana Sayfa</a>
            <a href="#">Koleksiyonlar</a>
            <a href="#">Yaş Grupları</a>
            <a href="#">Türler</a>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="icon"><Heart className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon"><ShoppingCart className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      <nav className="max-w-6xl mx-auto px-4 pt-6 text-sm text-slate-600 flex items-center gap-2">
        <a href="#" className="hover:text-sky-700">Ana Sayfa</a>
        <ChevronRight className="w-4 h-4" />
        <a href="#" className="hover:text-sky-700">Klasikler</a>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-500">Pinokyo – Kısaltılmış Metin</span>
      </nav>

      {/* Product Block */}
      <section className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-10 items-start">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Card className="rounded-2xl overflow-hidden border-slate-200">
            <CardContent className="p-0">
              <img
                src="https://cdn.iskultur.com.tr/images/urunler/pinokyo-kisaltilmis-metin-9786052955918.jpg"
                alt="Pinokyo - Kısaltılmış Metin kapak görseli"
                className="w-full object-cover"
              />
            </CardContent>
          </Card>
          <div className="flex gap-3 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-20 h-28 rounded-xl border border-slate-200 bg-white grid place-items-center text-xs text-slate-400">Önizleme</div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="space-y-5">
          <h1 className="text-3xl font-bold text-sky-800 leading-snug">Pinokyo – Kısaltılmış Metin</h1>
          <p className="text-slate-600 leading-relaxed">
            Dünya çocuk edebiyatının başyapıtlarından <em>Pinokyo</em>, haylaz bir tahta kuklanın gerçek bir çocuk olma yolunda yaşadığı
            serüvenleri anlatır. Pinokyo çevresinden kolayca etkilenir, yaramazlık yapar, derslerden kaçar; fakat her deneyiminden
            ders çıkarır. Tek arzusu iyi bir çocuk olmak ve babasını mutlu etmektir.
          </p>

          <div className="grid grid-cols-2 gap-y-1 text-sm text-slate-700">
            {productMeta.map((item) => (
              <div key={item.key}>
                <strong>{item.key}:</strong> {item.value}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button className="bg-sky-600 hover:bg-sky-700 text-white px-6">Satın Al</Button>
            <Button variant="outline" className="border-sky-600 text-sky-700">Favorilere Ekle</Button>
            <Button variant="outline">Paylaş</Button>
          </div>

          <Card className="border-slate-200 rounded-2xl">
            <CardContent className="p-5">
              <h2 className="text-lg font-semibold text-sky-800 mb-2">Özet</h2>
              <p className="text-slate-700 leading-relaxed">
                Pinokyo, Gepetto Usta'nın ellerinde can bulan bir tahta kukladır. İyi ile kötüyü ayırt etmeyi, doğruluğun önemini ve
                sorumluluğu deneyimleyerek öğrenir. Bu baskı, küçük okurlara uygun kısaltılmış metni ve klasik çizimlerle keyifli bir okuma sunar.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* Faydalar & Tema İçerikleri */}
      <section className="max-w-6xl mx-auto px-4 pb-10">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Faydalar */}
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold text-sky-800 mb-3">Bu Kitabın Çocuğa Katkıları</h3>
              <ul className="space-y-2 text-slate-700 list-disc pl-5">
                {bookBenefits.map((benefit, index) => (
                  <li key={index}><strong>{benefit.title}</strong>: {benefit.description}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Temalar */}
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold text-sky-800 mb-3">Temalar & İçerik Etiketleri</h3>
              <div className="flex flex-wrap gap-2">
                {bookThemes.map((theme) => (
                  <span key={theme} className="px-3 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-800 text-xs font-medium">
                    {theme}
                  </span>
                ))}
              </div>
              <p className="text-slate-600 text-sm mt-4">
                Bu temalar, sitedeki <strong>filtreleme</strong> ve <strong>öneri</strong> sistemleriyle entegre edilebilir (ör. Tema: "Dürüstlük" seçildiğinde ilgili diğer klasikler listelenir).
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Etkinlik Önerileri */}
      <section className="max-w-6xl mx-auto px-4 pb-10">
        <Card className="rounded-2xl border-slate-200">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold text-sky-800 mb-3">Bu Kitapla Yapılabilecek Etkinlikler</h3>
            <ul className="space-y-2 text-slate-700 list-decimal pl-5">
              {activities.map((activity, index) => (
                <li key={index}><strong>{activity.title}:</strong> {activity.description}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Yaş Gruplarına Göre Etkinlik Etiketleri */}
      <section className="max-w-6xl mx-auto px-4 pb-10">
        <Card className="rounded-2xl border-slate-200">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold text-sky-800 mb-3">Etkinliklerin Yaş Gruplarına Göre Uyarlanması</h3>
            <div className="grid md:grid-cols-3 gap-6 text-slate-700">
              {Object.entries(ageGroupActivities).map(([ageGroup, activitiesList]) => (
                <div key={ageGroup}>
                  <h4 className="font-semibold text-sky-700 mb-2">{ageGroup}</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {activitiesList.map((activity, index) => (
                      <li key={index}>{activity}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Related / Önerilenler */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-sky-800">Benzer Kitaplar</h3>
          <a className="text-sky-700 text-sm" href="#">
            Tümünü Gör
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {relatedBooks.map((book, index) => (
            <Card key={index} className="rounded-2xl border-slate-200 hover:shadow-md transition">
              <CardContent className="p-3">
                <img
                  src={book.image}
                  alt={`${book.title} kapak görseli`}
                  className="aspect-[3/4] w-full rounded-xl object-cover border border-slate-200"
                />
                <div className="mt-3 text-sm font-medium line-clamp-2 text-center">{book.title}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-sky-100 py-10 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-3 gap-8 text-sm text-slate-700">
          <div>
            <h4 className="font-semibold mb-2">Hakkımızda</h4>
            <p>Çocukların dünyasını zenginleştiren, güvenilir ve seçkin kitaplar.</p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Kategoriler</h4>
            <ul className="space-y-1">
              <li>Yaş Grupları</li>
              <li>Temalar</li>
              <li>Eğitsel Kitaplar</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Destek</h4>
            <ul className="space-y-1">
              <li>SSS</li>
              <li>İletişim</li>
              <li>Gizlilik</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
