import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { GeminiProvider } from '../src/services/ocr/providers/gemini.provider';
import { OCRProviderConfig } from '../src/services/ocr/types';
import { SettingsService } from '../src/services/settings.service';
import { lsembPool } from '../src/config/database.config';

dotenv.config({ path: path.join(__dirname, '../../.env.lsemb') });

const neyzenDir = path.join(__dirname, '../../docs/neyzen');

async function testMusicSheetOCR() {
    console.log('🎵 Music Sheet OCR Test Started\n');
    console.log('Directory:', neyzenDir);
    console.log('─'.repeat(60));

    try {
        // 1. Get API Key
        console.log('\n1️⃣ Checking Gemini API Key...');
        const settingsService = SettingsService.getInstance();
        let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            apiKey = await settingsService.getSetting('google.apiKey');
        }

        if (!apiKey) {
            console.log('   ❌ API Key not found!');
            return;
        }

        console.log('   ✅ API Key found');

        // 2. Initialize Provider
        console.log('\n2️⃣ Initializing Gemini Provider...');
        const config: OCRProviderConfig = {
            enabled: true,
            apiKey: apiKey,
            model: 'gemini-2.0-flash-exp'
        };

        const provider = new GeminiProvider(config);
        const isReady = await provider.isReady();
        console.log('   Provider Ready:', isReady ? '✅' : '❌');

        if (!isReady) return;

        // 3. Get PDF files
        console.log('\n3️⃣ Scanning for PDF files...');
        const files = fs.readdirSync(neyzenDir)
            .filter(f => f.endsWith('.pdf'))
            .slice(0, 3); // Test first 3 files

        console.log(`   Found ${files.length} PDF files to test`);

        // 4. Test each file
        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const filePath = path.join(neyzenDir, fileName);

            console.log(`\n${'═'.repeat(60)}`);
            console.log(`📄 File ${i + 1}/${files.length}: ${fileName}`);
            console.log('═'.repeat(60));

            const startTime = Date.now();

            try {
                const result = await provider.processPDF(filePath, {
                    language: 'tr',
                    prompt: `Bu Türk müziği notası ve sözlerini çıkar. İçeriği şu formatta ver:

BAŞLIK: [Şarkı adı]
BESTECİ: [Besteci adı]
MAKAM: [Makam adı]
USUL: [Usul]

SÖZLER:
[Tüm şarkı sözlerini satır satır yaz]

NOT BİLGİLERİ:
[Varsa nota bilgileri]`
                });

                const duration = ((Date.now() - startTime) / 1000).toFixed(2);

                console.log('\n✅ OCR Başarılı!');
                console.log('⏱️  Süre:', duration + 's');
                console.log('📊 Güven:', (result.confidence * 100).toFixed(1) + '%');
                console.log('📝 Metin Uzunluğu:', result.text.length, 'karakter');

                if (result.metadata.tokensUsed) {
                    console.log('🪙 Token:', result.metadata.tokensUsed);
                    console.log('💰 Maliyet:', '$' + (result.metadata.cost || 0).toFixed(6));
                }

                console.log('\n📄 Çıkarılan İçerik:');
                console.log('─'.repeat(60));
                console.log(result.text);
                console.log('─'.repeat(60));

                // Save to file
                const outputPath = path.join(__dirname, `../test-results/ocr_${fileName.replace('.pdf', '.txt')}`);
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, result.text, 'utf8');
                console.log(`\n💾 Kaydedildi: ${outputPath}`);

            } catch (error: any) {
                console.log('\n❌ OCR Hatası:', error.message);

                if (error.message.includes('retryDelay')) {
                    console.log('⏳ Rate limit - bir sonraki dosyaya geçiliyor...');
                    await new Promise(resolve => setTimeout(resolve, 15000));
                }
            }

            // Wait between files to avoid rate limits
            if (i < files.length - 1) {
                console.log('\n⏳ Sonraki dosya için 3 saniye bekleniyor...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log('✅ Tüm testler tamamlandı!');
        console.log('═'.repeat(60));

    } catch (error: any) {
        console.log('\n❌ Test Hatası:', error.message);
        console.error(error);
    } finally {
        await lsembPool.end();
    }
}

testMusicSheetOCR();
