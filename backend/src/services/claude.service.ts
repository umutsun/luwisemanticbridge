import Anthropic from '@anthropic-ai/sdk';
import pool from '../config/database';

export class ClaudeService {
  private client: Anthropic | null = null;
  private apiKey: string | null = null;
  private defaultMaxTokens: number = 4096;
  private defaultModel: string = 'claude-3-haiku-20240307';

  constructor() {
    this.loadSettings().then(() => {
      if (this.apiKey) {
        this.initialize();
      }
    });
  }

  private async loadSettings() {
    try {
      // Try to get API key and settings from database first
      const result = await pool.query(
        "SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key IN ('claude_api_key', 'max_tokens', 'claude_model')"
      );

      for (const row of result.rows) {
        if (row.setting_key === 'claude_api_key') {
          this.apiKey = row.setting_value;
        } else if (row.setting_key === 'max_tokens') {
          this.defaultMaxTokens = parseInt(row.setting_value) || 2048;
        } else if (row.setting_key === 'claude_model') {
          this.defaultModel = row.setting_value || 'claude-3-haiku-20240307';
        }
      }

      // Fallback to environment if not in database
      if (!this.apiKey) {
        this.apiKey = process.env.CLAUDE_API_KEY || null;
      }
    } catch (error) {
      console.warn('Failed to load Claude settings from database:', error);
      this.apiKey = process.env.CLAUDE_API_KEY || null;
    }
  }

  private initialize() {
    if (!this.apiKey) return;

    try {
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });
      console.log('✅ Claude API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Claude API:', error);
    }
  }

  public isAvailable(): boolean {
    return this.client !== null;
  }

  public async generateResponse(
    query: string,
    context: string,
    history: any[] = [],
    systemPrompt?: string,
    maxTokens?: number
  ): Promise<{ content: string }> {
    if (!this.client) {
      throw new Error('Claude API not initialized');
    }

    try {
      // Use database system prompt or default to detailed tax expert prompt
      const defaultSystemPrompt = `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.

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

BAĞLAM (en ilgiliden başlayarak sıralı):`;

      const finalSystemPrompt = `${systemPrompt || defaultSystemPrompt}
${context || 'Veritabanında bu konuyla ilgili spesifik bilgi bulunmuyor.'}`;

      const messages: Anthropic.MessageParam[] = [];
      
      // Add history
      history.forEach(h => {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content
        });
      });
      
      // Add current query
      messages.push({
        role: 'user',
        content: query
      });

      const response = await this.client.messages.create({
        model: this.defaultModel, // Use configured model
        max_tokens: maxTokens || this.defaultMaxTokens,
        temperature: 0.3,
        system: finalSystemPrompt,
        messages: messages
      });

      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      return {
        content: textContent || 'Yanıt oluşturulamadı.'
      };
    } catch (error: any) {
      console.error('Claude API error:', error);
      throw error;
    }
  }
}

export default new ClaudeService();