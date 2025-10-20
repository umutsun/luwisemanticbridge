"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Baby, Rocket, Star, Heart, ShoppingCart, Globe2, Lightbulb, Award } from "lucide-react";
import { motion } from "framer-motion";

const ageGroups = [
  { icon: <Baby className="w-8 h-8 text-pink-400" />, label: "0–2 Yaş" },
  { icon: <Star className="w-8 h-8 text-yellow-500" />, label: "3–5 Yaş" },
  { icon: <Rocket className="w-8 h-8 text-indigo-500" />, label: "6–8 Yaş" },
  { icon: <BookOpen className="w-8 h-8 text-green-500" />, label: "9–11 Yaş" }
];

const bookGenres = ["Masal", "Hikaye", "Roman", "Şiir", "Macera", "Bilim Kurgu", "Biyografi", "Tiyatro"];

const bookThemes = ["Dostluk", "Cesaret", "Doğa", "Empati", "Aile", "Hayal Gücü", "Hayvan Sevgisi", "Macera"];

const educationalCategories = [
  { icon: <Lightbulb className="w-8 h-8 text-yellow-500" />, title: "Okuma Yazmaya Hazırlık" },
  { icon: <Globe2 className="w-8 h-8 text-green-500" />, title: "STEM Kitapları" },
  { icon: <Award className="w-8 h-8 text-indigo-500" />, title: "Değerler Eğitimi" }
];

const collections = [
  { title: "Yeni Çıkanlar", desc: "Son çıkan en güncel çocuk kitaplarını keşfedin." },
  { title: "Ödüllü Kitaplar", desc: "Okur ve eleştirmenlerden tam not alan eserler." },
  { title: "Aileyle Okunacaklar", desc: "Birlikte okumaya uygun keyifli hikâyeler." }
];

const footerData = {
  categories: ["Yaş Grupları", "Türler", "Temalar", "Eğitsel Kitaplar"],
  help: ["SSS", "İletişim", "Gizlilik Politikası"],
  social: ["📘", "🐦", "📸"]
};

export default function ChildrenBooksMainPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-2 font-bold text-xl text-sky-700">
            <BookOpen className="w-6 h-6" />
            Çocuk Kitapları
          </div>
          <div className="hidden md:flex gap-6 text-sm font-medium">
            <a href="#yas">Yaş Grupları</a>
            <a href="#tur">Türler</a>
            <a href="#tema">Temalar</a>
            <a href="#egitsel">Eğitsel Kitaplar</a>
            <a href="#koleksiyon">Koleksiyonlar</a>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="icon"><Heart className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon"><ShoppingCart className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-2 items-center gap-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4 text-sky-800">
            Hayal Gücünü <span className="text-sky-500">Kitaplarla</span> Keşfet!
          </h1>
          <p className="text-slate-600 mb-6">
            Her yaşa, her meraka uygun binlerce çocuk kitabı burada. Keşfet, oku, hayal et!
          </p>
          <Button className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2 rounded-full">Kitapları Keşfet</Button>
        </motion.div>
        <motion.img
          src="https://cdn.pixabay.com/photo/2016/11/29/12/54/book-1868068_1280.png"
          alt="Çocuk kitapları illüstrasyonu"
          className="w-full max-w-md mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        />
      </section>

      {/* Yaş Grupları */}
      <section id="yas" className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-sky-800 mb-8">Yaş Gruplarına Göre</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {ageGroups.map((group, index) => (
            <motion.div key={index} whileHover={{ scale: 1.05 }}>
              <Card className="hover:shadow-lg cursor-pointer transition rounded-2xl border-slate-200">
                <CardContent className="flex flex-col items-center justify-center text-center p-6">
                  {group.icon}
                  <span className="mt-3 font-medium">{group.label}</span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Türlere Göre */}
      <section id="tur" className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-sky-800 mb-8">Türlere Göre Kitaplar</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {bookGenres.map((genre, index) => (
            <motion.div key={index} whileHover={{ y: -4 }}>
              <Card className="hover:shadow-lg cursor-pointer transition rounded-2xl border-slate-200 bg-white">
                <CardContent className="p-6 text-center font-medium">{genre}</CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Temalar */}
      <section id="tema" className="max-w-7xl mx-auto px-6 py-12 bg-sky-50 rounded-3xl">
        <h2 className="text-2xl font-semibold text-sky-800 mb-8">Temalar</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {bookThemes.map((theme, index) => (
            <motion.div key={index} whileHover={{ scale: 1.05 }}>
              <Card className="hover:shadow-md cursor-pointer transition rounded-2xl border-slate-200">
                <CardContent className="p-6 text-center font-medium text-sky-700">{theme}</CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Eğitsel Kitaplar */}
      <section id="egitsel" className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-sky-800 mb-8">Eğitsel Kitaplar</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {educationalCategories.map((category, index) => (
            <Card key={index} className="hover:shadow-md transition rounded-2xl border-slate-200">
              <CardContent className="flex flex-col items-center text-center p-6 gap-3">
                {category.icon}
                <span className="font-medium">{category.title}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Koleksiyonlar */}
      <section id="koleksiyon" className="max-w-7xl mx-auto px-6 py-12 bg-gradient-to-r from-sky-100 to-white rounded-3xl">
        <h2 className="text-2xl font-semibold text-sky-800 mb-8">Koleksiyonlar</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {collections.map((collection, index) => (
            <motion.div key={index} whileHover={{ scale: 1.03 }}>
              <Card className="hover:shadow-lg transition rounded-2xl border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-sky-700 mb-2">{collection.title}</h3>
                <p className="text-slate-600 text-sm">{collection.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-sky-100 py-10 mt-16 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-8 text-sm text-slate-700">
          <div>
            <h3 className="font-semibold mb-3">Hakkımızda</h3>
            <p>Çocuklara kitap sevgisini kazandırmak için kurulmuş bir dünyayız. Her kitap bir keşif yolculuğu!</p>
          </div>
          <div>
            <h3 className="font-semibold mb-3">Kategoriler</h3>
            <ul className="space-y-1">
              {footerData.categories.map((category, index) => (
                <li key={index}>{category}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-3">Yardım</h3>
            <ul className="space-y-1">
              {footerData.help.map((helpItem, index) => (
                <li key={index}>{helpItem}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-3">Bizi Takip Et</h3>
            <div className="flex gap-4 text-xl">
              {footerData.social.map((socialIcon, index) => (
                <a key={index} href="#">{socialIcon}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}