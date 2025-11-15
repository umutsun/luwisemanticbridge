#!/bin/bash
# Test grouped JSON structure with PDF metadata extraction

echo "========================================="
echo "Testing Grouped JSON Structure"
echo "========================================="
echo ""

# Test 1: Legal Document (213 Vergi Usul Kanunu)
echo "📄 Test 1: Legal Document (Vergi Usul Kanunu)"
echo "-----------------------------------------"
curl -s -X POST http://localhost:8083/api/v2/pdf/batch-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": 999,
    "filename": "test-legal.pdf",
    "text": "VERGİ USUL KANUNU\n\nKanun Numarası: 213\nKabul Tarihi: 4/1/1961\nYayımlandığı R.Gazete: Tarih: 10/1/1961 Sayı: 10703\nYayımlandığı Düstur: Tertip: 4 Cilt: 1 Sayfa: 1\n\nBİRİNCİ KİTAP: Genel Hükümler\n\nBİRİNCİ KISIM: Temel İlkeler\n\nMadde 1 - Bu Kanunun adı \"Vergi Usul Kanunu\"dur.\n\nMadde 2 - Vergi kanunları, nihayet kanunun tâyin ettiği sürenin hitamında mer''iyete girer.\n\nMadde 3 - Vergi kanunları, yürürlüğe girdikten sonra meydana gelen olaylara uygulanır.\n\nMadde 4 - Vergi kanunlarının uygulanması ile ilgili konularda bu kanun hükümleri geçerlidir.\n\n... (toplam 520 madde)",
    "options": {
      "template": "legal",
      "apiKey": "'$GEMINI_API_KEY'",
      "analysisPrompt": "Extract all legal metadata including articles, law number, effective date, and amendments.",
      "templateData": {
        "focus_keywords": ["kanun", "madde", "yaptırım", "vergi"]
      }
    }
  }' | python -m json.tool 2>&1 | head -100

echo ""
echo ""

# Test 2: Novel (Fiction)
echo "📚 Test 2: Novel (Jitterbug Perfume)"
echo "-----------------------------------------"
curl -s -X POST http://localhost:8083/api/v2/pdf/batch-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": 998,
    "filename": "test-novel.pdf",
    "text": "Jitterbug Perfume by Tom Robbins\n\nChapter 1\n\nThe beet is the most intense of vegetables. The radish, admittedly, is more feverish, but the fire of the radish is a cold fire, the fire of discontent not of passion. Tomatoes are lusty enough, yet there runs through tomatoes an undercurrent of frivolity.\n\nAlobar was the king of a city-state no larger than Seattle. It was called Bohemia B. His subjects were not famous for their beauty, but Alobar had a beautiful wife named Alma. And Alma loved to laugh.\n\nKudra was a rope dancer from India. She had eyes like black pearls and skin the color of jasmine honey. When she danced on the rope, crowds would gather from miles around to watch her move like a snake in the air.\n\n... The novel explores themes of immortality, perfume, and the search for meaning across centuries.",
    "options": {
      "template": "novel",
      "apiKey": "'$GEMINI_API_KEY'",
      "analysisPrompt": "Extract narrative elements, main characters (proper names only), plot themes, and setting.",
      "templateData": {
        "focus_keywords": ["Alobar", "Kudra", "immortality", "beet"]
      }
    }
  }' | python -m json.tool 2>&1 | head -100

echo ""
echo ""

# Test 3: Sheet Music
echo "🎵 Test 3: Sheet Music (Turkish Folk Song)"
echo "-----------------------------------------"
curl -s -X POST http://localhost:8083/api/v2/pdf/batch-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": 997,
    "filename": "test-sheet-music.pdf",
    "text": "GEL GÖNLÜMÜ YERDEN YERE\n\nTürkü - Hüseyni Makamı\nUsul: 9/8 (Aksak)\nTon: La minör\n\nGüfte:\nGel gönlümü yerden yere vurma\nBu gönül seni sever durma durma\nŞu dağların karı erirse\nGözlerimin yaşı kurur mu\nKurur mu kurur mu kurur mu\n\nAkorlar: Am - Dm - E7 - Am - F - Dm - E7 - Am\n\nNotalar:\nLa - Si - Do - Re - Mi - Fa - Sol - La\n\nÇalgılar: Ses, Bağlama, Piyano\nZorluk Seviyesi: Orta",
    "options": {
      "template": "sheet_music",
      "apiKey": "'$GEMINI_API_KEY'",
      "analysisPrompt": "Extract musical metadata including makam, usul, lyrics, chords, and instruments.",
      "templateData": {
        "focus_keywords": ["makam", "usul", "güfte", "akor"]
      }
    }
  }' | python -m json.tool 2>&1 | head -100

echo ""
echo "========================================="
echo "✅ Tests Complete"
echo "========================================="
