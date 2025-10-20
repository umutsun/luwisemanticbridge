"use client";

import WireframeNavigation from "@/components/WireframeNavigation";

export default function WireframeMainPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800">
      <WireframeNavigation />

      <main className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-sky-800 mb-4">
            Wireframe <span className="text-sky-500">Showcase</span>
          </h1>
          <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
            Müşteriden gelen JSX wireframe çalışmalarını incelemek ve renderlamak için oluşturulmuş bağımsız bir proje.
          </p>
          <div className="flex justify-center gap-4">
            <a href="/wireframe/pinokyo" className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2 rounded-full">
              Pinokyo Sayfasını Gör
            </a>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-8"
          >
            <h2 className="text-2xl font-bold text-sky-800 mb-4">Pinokyo Ürün Sayfası</h2>
            <p className="text-slate-600 mb-4">
              Pinokyo kitabının detaylı ürün sayfası wireframe'i. Kapsamı:
            </p>
            <ul className="space-y-2 text-slate-700">
              <li>• Ürün bilgileri ve meta veriler</li>
              <li>• Kitap özeti ve tanıtımı</li>
              <li>• Çocuğa katkıları listesi</li>
              <li>• Tema etiketleri</li>
              <li>• Etkinlik önerileri</li>
              <li>• Benzer kitaplar</li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="card p-8"
          >
            <h2 className="text-2xl font-bold text-sky-800 mb-4">Çocuk Kitapları Ana Sayfa</h2>
            <p className="text-slate-600 mb-4">
              Çocuk kitapları e-ticaret sitesinin ana sayfası wireframe'i. Kapsamı:
            </p>
            <ul className="space-y-2 text-slate-700">
              <li>• Hero bölümü ve ana başlık</li>
              <li>• Yaş gruplarına göre kategorizasyon</li>
              <li>• Kitap türleri</li>
              <li>• Tema etiketleri</li>
              <li>• Eğitsel kitaplar</li>
              <li>• Koleksiyonlar</li>
            </ul>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center bg-sky-50 rounded-2xl p-8"
        >
          <h3 className="text-xl font-semibold text-sky-800 mb-2">Teknoloji Stack</h3>
          <p className="text-slate-600 mb-4">Bu wireframe projesinde kullanılan teknolojiler:</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <span className="px-3 py-1 bg-white rounded-full border border-sky-200 text-sky-800 text-sm font-medium">
              Next.js 15
            </span>
            <span className="px-3 py-1 bg-white rounded-full border border-sky-200 text-sky-800 text-sm font-medium">
              React 19
            </span>
            <span className="px-3 py-1 bg-white rounded-full border border-sky-200 text-sky-800 text-sm font-medium">
              TypeScript
            </span>
            <span className="px-3 py-1 bg-white rounded-full border border-sky-200 text-sky-800 text-sm font-medium">
              Tailwind CSS
            </span>
            <span className="px-3 py-1 bg-white rounded-full border border-sky-200 text-sky-800 text-sm font-medium">
              Framer Motion
            </span>
            <span className="px-3 py-1 bg-white rounded-full border border-sky-200 text-sky-800 text-sm font-medium">
              Lucide React
            </span>
          </div>
        </motion.div>
      </main>
    </div>
  );
}