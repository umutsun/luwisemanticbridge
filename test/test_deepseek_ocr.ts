import dotenv from 'dotenv';
import path from 'path';
import { DeepSeekProvider } from '../src/services/ocr/providers/deepseek.provider';
import { OCRProviderConfig } from '../src/services/ocr/types';
import { SettingsService } from '../src/services/settings.service';
import { lsembPool } from '../src/config/database.config';

dotenv.config({ path: path.join(__dirname, '../../.env.lsemb') });

const testImagePath = path.join(__dirname, '../../docs/neyzen/ben_bilmedimki_ben.pdf');

async function testDeepSeekOCR() {
    console.log('🧪 DeepSeek OCR Test Started\n');
    console.log('Target File:', testImagePath);
    console.log('─'.repeat(60));

    try {
        // 1. Check API Key
        console.log('\n1️⃣ Checking Replicate API Key...');
        const settingsService = SettingsService.getInstance();
        let apiKey = process.env.REPLICATE_API_KEY;

        if (!apiKey) {
            try {
                apiKey = await settingsService.getApiKey('replicate_api_key');
            } catch (e) {
                console.log('   ⚠️  Not found in settings');
            }
        }

        if (!apiKey) {
            console.log('   ❌ REPLICATE_API_KEY not found!');
            console.log('   💡 Set it in .env.lsemb or database settings');
            console.log('   Get key from: https://replicate.com/account/api-tokens');
            return;
        }

        console.log('   ✅ API Key found:', apiKey.substring(0, 8) + '...');

        // 2. Initialize Provider
        console.log('\n2️⃣ Initializing DeepSeek Provider...');
        const config: OCRProviderConfig = {
            enabled: true,
            apiKey: apiKey
        };

        const provider = new DeepSeekProvider(config);
        const isReady = await provider.isReady();
        console.log('   Provider Ready:', isReady ? '✅' : '❌');

        if (!isReady) {
            console.log('   ❌ Provider not ready');
            return;
        }

        // 3. Test PDF Processing
        console.log('\n3️⃣ Testing PDF OCR...');
        console.log('   ⏳ This may take 1-2 minutes (PDF → Images → OCR)...');

        const startTime = Date.now();

        try {
            const result = await provider.processPDF(testImagePath, {
                language: 'tr',
                prompt: 'Extract all Turkish text from this music sheet. Include title, composer, and all lyrics.'
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log('\n   ✅ OCR Completed!');
            console.log('   ⏱️  Duration:', duration + 's');
            console.log('   📊 Confidence:', (result.confidence * 100).toFixed(1) + '%');
            console.log('   📝 Text Length:', result.text.length, 'chars');
            console.log('   📄 Pages:', result.metadata.pageCount || 1);

            if (result.metadata.predictionId) {
                console.log('   🔗 Prediction ID:', result.metadata.predictionId);
            }

            console.log('\n   📄 Extracted Text Preview (first 300 chars):');
            console.log('   ' + '─'.repeat(58));
            console.log('   ' + result.text.substring(0, 300).replace(/\n/g, '\n   '));
            console.log('   ' + '─'.repeat(58));

        } catch (ocrError: any) {
            console.log('\n   ❌ OCR Failed:', ocrError.message);

            if (ocrError.message.includes('pdf2pic')) {
                console.log('\n   💡 PDF conversion failed. Possible reasons:');
                console.log('      • GraphicsMagick not installed');
                console.log('      • ImageMagick not installed');
                console.log('      • Poppler not installed');
                console.log('\n   📦 Install one of:');
                console.log('      Windows: choco install graphicsmagick');
                console.log('      Windows: choco install imagemagick');
            }

            if (ocrError.message.includes('Replicate')) {
                console.log('\n   💡 Replicate API Error:');
                console.log('      • Check API key validity');
                console.log('      • Check account credits');
                console.log('      • Check rate limits');
            }
        }

    } catch (error: any) {
        console.log('\n❌ Test Failed:', error.message);
        console.error(error);
    } finally {
        await lsembPool.end();
        console.log('\n✅ Test completed');
    }
}

testDeepSeekOCR();
