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

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      // Try to get API key from database first, then fallback to environment
      let apiKey = process.env.GOOGLE_API_KEY;

      if (!apiKey) {
        try {
          const result = await pool.query(
            "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'google_api_key'"
          );
          apiKey = result.rows[0]?.setting_value;
        } catch (error) {
          console.log('Database not available for API key, using environment');
        }
      }

      // Get model from settings
      try {
        const modelResult = await pool.query(
          "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'gemini_model'"
        );
        if (modelResult.rows[0]?.setting_value) {
          this.model = modelResult.rows[0].setting_value;
        }
      } catch (error) {
        // Use default model
      }

      if (apiKey && apiKey !== 'your-google-api-key-here') {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.initialized = true;
        console.log(`✅ Gemini API initialized with model: ${this.model}`);
      } else {
        console.log('⚠️  Gemini API key not configured');
      }
    } catch (error) {
      console.error('Gemini initialization error:', error);
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
    temperature: number = 0.1
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
          maxOutputTokens: 2048,
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
      const systemPrompt = this.createSystemPrompt(context);
      const fullPrompt = `${systemPrompt}\n\nKullanıcı Sorusu: ${query}`;

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
  private createSystemPrompt(context: string): string {
    const systemPrompt = `Sen verilen bağlamı kullanarak soruları yanıtlayan bir yapay zeka asistanısın.

KURALLAR:
1. Sadece verilen bağlamdaki bilgilere dayanarak yanıt ver
2. Bağlamda bilgi yoksa "Verilen bağlamda bu konu hakkında bilgi bulunamadı" de
3. Yanıtlarını Türkçe ver
4. Resmi ve profesyonel bir dil kullan
5. Kesin bilgi olmadan yorum yapma
6. Kaynakları belirtmek gerekirse bağlamdaki bilgileri referans al

BAĞLAM:
${context}`;

    return systemPrompt;
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