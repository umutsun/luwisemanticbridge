import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: string = 'gemini-1.5-flash'; // Default to Flash for speed
  private initialized: boolean = false;
  private defaultMaxTokens: number = 4096;
  private apiKey: string | null = null;

  constructor() {
    this.loadSettings().then(() => {
      this.initialize();
    });
  }

  private async loadSettings() {
    try {
      // Try to get API key and settings from database first
      let apiKey = process.env.GOOGLE_API_KEY;
      let maxTokens = 4096;

      const result = await pool.query(
        "SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key IN ('google_api_key', 'gemini_model', 'max_tokens')"
      );

      for (const row of result.rows) {
        if (row.setting_key === 'google_api_key') {
          apiKey = row.setting_value;
        } else if (row.setting_key === 'gemini_model') {
          this.model = row.setting_value;
        } else if (row.setting_key === 'max_tokens') {
          maxTokens = parseInt(row.setting_value) || 4096;
        }
      }

      // Fallback to environment if not in database
      if (!apiKey) {
        apiKey = process.env.GOOGLE_API_KEY;
      }

      this.apiKey = apiKey;
      this.defaultMaxTokens = maxTokens;
    } catch (error) {
      console.warn('Failed to load Gemini settings from database:', error);
      this.apiKey = process.env.GOOGLE_API_KEY;
    }
  }

  private initialize() {
    if (this.apiKey && this.apiKey !== 'your-google-api-key-here') {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.initialized = true;
      console.log(`✅ Gemini API initialized with model: ${this.model}`);
    } else {
      console.log('⚠️  Gemini API key not configured');
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.genAI !== null;
  }

  /**
   * Generate a response using Gemini
   */
  async generateResponse(
    query: string,
    context: string,
    history: ChatMessage[],
    temperature: number = 0.1,
    systemPrompt?: string,
    maxTokens?: number
  ) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not available');
    }

    try {
      // Get the generative model
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        generationConfig: {
          temperature: temperature,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: maxTokens || this.defaultMaxTokens,
        }
      });

      // Start a chat session
      const chat = model.startChat({
        history: this.formatHistory(history),
        generationConfig: {
          temperature: temperature,
        },
      });

      // Create the prompt with context
      const finalSystemPrompt = this.createSystemPrompt(context, systemPrompt);
      const fullPrompt = `${finalSystemPrompt}\n\nKullanıcı Sorusu: ${query}`;

      // Generate response
      const result = await chat.sendMessage(fullPrompt);
      const response = await result.response;

      return {
        content: response.text(),
        model: this.model,
        usage: {
          promptTokens: 0, // Gemini doesn't provide token counts in free tier
          completionTokens: 0,
          totalTokens: 0
        }
      };
    } catch (error: any) {
      console.error('Gemini API error:', error);

      // Handle specific error cases
      if (error.message?.includes('API_KEY_INVALID')) {
        throw new Error('Invalid Gemini API key');
      } else if (error.message?.includes('QUOTA_EXCEEDED')) {
        throw new Error('Gemini API quota exceeded');
      }

      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Format conversation history for Gemini
   */
  private formatHistory(history: ChatMessage[]): any[] {
    const formatted: any[] = [];

    // Add context as system message first
    if (history.length > 0 && history[0].role === 'system') {
      formatted.push({
        role: 'user',
        parts: [{ text: history[0].content }]
      });
      formatted.push({
        role: 'model',
        parts: [{ text: 'Anladım, verdiğiniz bağlamı dikkate alacağım.' }]
      });
    }

    // Add conversation history
    for (let i = 1; i < history.length; i++) {
      const message = history[i];
      if (message.role === 'user') {
        formatted.push({
          role: 'user',
          parts: [{ text: message.content }]
        });
      } else if (message.role === 'assistant') {
        formatted.push({
          role: 'model',
          parts: [{ text: message.content }]
        });
      }
    }

    return formatted;
  }

  /**
   * Create system prompt with context
   */
  private createSystemPrompt(context: string, systemPrompt?: string): string {
    // If systemPrompt is provided, use it directly with context
    return `${systemPrompt || `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.

GÖREV:
- Aşağıdaki bağlamda verilen bilgilere dayanarak ANLAMLI ve AKICI bir metin oluştur
- Cevabını 2-3 paragraf halinde organize et:
  • İlk paragraf: Konunun genel çerçevesi ve temel bilgiler
  • İkinci paragraf: Detaylar, örnekler ve uygulamalar
  • Üçüncü paragraf (gerekirse): Önemli noktalar, istisnalar veya dikkat edilmesi gerekenler

- DİL ve ÜSLUP:
  • Profesyonel ama anlaşılır bir dil kullan
  • Teknik terimleri açıklayarak kullan
  • Madde madde sıralama yerine akıcı paragraflar oluştur
  • "Buna göre", "Bu kapsamda", "Öte yandan" gibi bağlaçlarla metni akıcı hale getir
  • KAYNAK BELİRTME: Metin içinde kaynak numarası belirtme (Kaynak 1, Kaynak 2 gibi yazma)

- KAYNAK YETERSİZLİĞİ DURUMU:
  • Eğer bağlamda direkt cevap bulamazsan ama ilgili kaynaklar varsa: "Bu konuda direkt bilgi bulamadım ama şunlar ilgili olabilir:" diye BAŞLA
  • İlk 3-5 en yüksek skorlu kaynağı kendi cümlelerinle ÖZETLE (sadece kaynakları listeleme!)
  • Özeti şu şekilde yap: "Bulduğum ilgili bilgiler arasında: [kaynak1 özeti]. Ayrıca: [kaynak2 özeti]. Konuyla ilgili olarak şunlar da dikkat çekici: [kaynak3 özeti]"
  • Skorları yüksek olan kaynaklara daha çok ağırlık ver
  • Sadece tamamen alakasız veya boş sonuçlar geldiğinde "Bu konuda veritabanımda bilgi bulunmuyor" de

- Tahmin yapma, sadece verilen bağlamdaki bilgileri kullan

BAĞLAM (en ilgiliden başlayarak sıralı):`}
${context}`;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.generateContent("Test");
      return !!result.response;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
const geminiService = new GeminiService();
export default geminiService;