import axios from 'axios';

// Re-use ChatMessage interface from other services
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class DeepSeekService {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || '';
    this.baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  }

  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey !== '';
  }

  async chat(
    messages: DeepSeekMessage[],
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
      stream?: boolean;
    } = {}
  ): Promise<DeepSeekResponse> {
    if (!this.isAvailable()) {
      throw new Error('DeepSeek API key not configured');
    }

    try {
      const response = await axios.post<DeepSeekResponse>(
        `${this.baseURL}/v1/chat/completions`,
        {
          model: this.model,
          messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 2048,
          top_p: options.top_p || 1,
          stream: options.stream || false,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'DeepSeek-Client/1.0',
          },
          timeout: 60000,
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
          // Add retry configuration
          validateStatus: function (status) {
            return status >= 200 && status < 300;
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('DeepSeek API error:', error);

      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error?.message || error.message;

        switch (status) {
          case 401:
            throw new Error('DeepSeek: Invalid API key');
          case 429:
            throw new Error('DeepSeek: Rate limit exceeded');
          case 500:
            throw new Error('DeepSeek: Server error');
          default:
            throw new Error(`DeepSeek: ${message}`);
        }
      }

      // Handle network errors
      if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
        throw new Error('DeepSeek: Connection was reset. Please try again.');
      }

      // Handle timeout
      if (error.code === 'ETIMEDOUT') {
        throw new Error('DeepSeek: Request timed out. Please try again.');
      }

      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const response = await this.chat([
        { role: 'user', content: 'test' }
      ], { max_tokens: 1 });

      return !!response.choices[0]?.message?.content;
    } catch (error) {
      console.error('DeepSeek connection test failed:', error);
      return false;
    }
  }

  async generateResponse(
    query: string,
    context: string,
    history: ChatMessage[],
    temperature: number = 0.1,
    systemPrompt?: string,
    maxTokens?: number
  ) {
    if (!this.isAvailable()) {
      throw new Error('DeepSeek API key not available');
    }

    try {
      // Build messages array
      const messages: DeepSeekMessage[] = [];

      // Add system prompt
      const systemMessage = this.createSystemPrompt(context, systemPrompt);
      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
      }

      // Add conversation history
      if (history && history.length > 0) {
        history.forEach(msg => {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        });
      }

      // Add current query
      messages.push({ role: 'user', content: query });

      const response = await this.chat(messages, {
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 2048,
        top_p: 1
      });

      return {
        content: response.choices[0].message.content,
        role: 'assistant',
        timestamp: new Date()
      };
    } catch (error: any) {
      console.error('DeepSeek generateResponse error:', error);
      throw error;
    }
  }

  private createSystemPrompt(context: string, systemPrompt?: string): string {
    if (systemPrompt) {
      return systemPrompt;
    }

    return `You are a helpful AI assistant. Use the following context to answer the user's question:\n\n${context}`;
  }
}

export default new DeepSeekService();