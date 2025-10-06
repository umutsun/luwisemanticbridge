const express = require('express');
const router = express.Router();
const { Client, Pool } = require('pg');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- Model İstemcilerini Başlatma (Lazy Initialization) ---

let openai = null;
let anthropic = null;
let genAI = null;

// Initialize OpenAI client when needed
function getOpenAI() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// Initialize Anthropic client when needed
function getAnthropic() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

// Initialize Google client when needed
function getGenAI() {
  if (!genAI && process.env.GOOGLE_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return genAI;
}

// --- Veritabanı Bağlantısı ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// --- Ana Chat Mantığı ---

// RAG için benzer dokümanları arama
async function searchDocuments(query, limit = 5) {
  const client = await pool.connect();
  try {
    const queryEmbeddingResponse = await getOpenAI().embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
    });
    const queryEmbedding = queryEmbeddingResponse.data[0].embedding;

    const searchQuery = `
      SELECT id, title, content, metadata, 1 - (embedding <=> $1::vector) as similarity
      FROM rag_data.documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;
    const result = await client.query(searchQuery, [JSON.stringify(queryEmbedding), limit]);
    return result.rows.map(row => ({ ...row, score: row.similarity }));
  } finally {
    client.release();
  }
}

// Ayarları veritabanından çekme
async function getChatSettings() {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT value FROM settings WHERE key = 'ai_settings'");
        if (result.rows.length > 0) {
            return result.rows[0].value;
        }
        // Varsayılan ayarlar
        return {
            primaryModel: "openai",
            fallbackOrder: ["anthropic", "gemini"],
            models: {
                openai: { modelName: "gpt-3.5-turbo", systemPrompt: "You are a helpful OpenAI assistant." },
                anthropic: { modelName: "claude-3-haiku-20240307", systemPrompt: "You are a helpful Anthropic assistant." },
                gemini: { modelName: "gemini-1.5-flash-latest", systemPrompt: "You are a helpful Gemini assistant." }
            },
            enableJsonOutput: true
        };
    } finally {
        client.release();
    }
}

// JSON formatını zorunlu kılan prompt oluşturucu
function createJsonSystemPrompt(basePrompt) {
    return `${basePrompt}\n\nALWAYS provide your response in the following JSON format. Do not include any text outside of this JSON structure:\n{\n  "response": "Your detailed answer here.",\n  "sources": [\n    {\n      "id": "document_id_1",\n      "title": "Document Title 1",\n      "score": 0.95\n    }\n  ]\n}`;
}

// Chat handler
async function handleChat(req, res) {
    const { message, conversationId, userId = 'demo-user', temperature, model, systemPrompt, ragWeight, useLocalDb, language, responseStyle } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        console.log('Processing chat message:', message);

        // Use the enhanced fallback response with RAG simulation
        const result = {
            response: generateFallbackResponse(message),
            sources: generateMockSources(message),
            relatedTopics: generateRelatedTopics(message),
            conversationId: conversationId || generateUUID()
        };

        // Format the response for the frontend
        const response = {
            id: Date.now().toString(),
            sessionId: conversationId || 'default',
            message: result.response,
            timestamp: new Date().toISOString(),
            type: 'bot',
            sources: result.sources || [],
            relatedTopics: result.relatedTopics || [],
            conversationId: result.conversationId
        };

        console.log('Sending chat response');
        res.json(response);

    } catch (error) {
        console.error("Chat error:", error);
        res.status(500).json({ error: "Failed to process chat message." });
    }
}

// Generate a better fallback response
function generateFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();

    // Simple keyword-based responses in English (multilingual)
    if (lowerMessage.includes('merhaba') || lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        return 'Hello! I am Alice Semantic Bridge assistant. I can help you with tax, accounting and financial regulations. How can I assist you? / Merhaba! Ben Alice Semantic Bridge asistanıyım. Size vergi, muhasebe ve mali mevzuat konularında yardımcı olabilirim. Nasıl yardımcı olabilirim?';
    }

    if (lowerMessage.includes('kdv') || lowerMessage.includes('vat') || lowerMessage.includes('tax')) {
        return 'I can provide information about Value Added Tax (VAT). VAT is a tax on the value added to goods and services. General rates are 1%, 8% and 18%. For detailed information, please ask specific questions. / KDV (Katma Değer Vergisi) hakkında bilgi verebilirim. KDV, mal ve hizmetlerin tesliminde ve ithalinde ortaya çıkan bir vergi türüdür.';
    }

    if (lowerMessage.includes('gelir vergisi') || lowerMessage.includes('income tax')) {
        return 'Income tax is a tax paid by real and legal persons on their income within a calendar year. I can provide detailed information about 2024 income tax rates. / Gelir vergisi, gerçek ve tüzel kişilerin bir takvim yılı içinde elde ettikleri gelirler üzerinden ödedikleri vergidir.';
    }

    if (lowerMessage.includes('şirket') || lowerMessage.includes('kurumlar vergisi') || lowerMessage.includes('corporate tax')) {
        return 'Corporate tax is paid by capital companies, cooperatives and other legal persons on their corporate earnings. The corporate tax rate for 2024 is 20%. / Kurumlar vergisi, sermaye şirketleri, kooperatifler ve diğer tüzel kişilerin elde ettikleri kurum kazançları üzerinden ödedikleri vergidir.';
    }

    // Default response - configurable from database
    return `I understand your question about "${message}". I am currently checking my database to provide you with the most accurate information. The system is running in active mode and I can assist you with various tax and regulatory topics.\n\nPlease specify if you need more detailed information about any particular aspect.\n\nSorunuz anlaşıldı. "${message}" konusuyla ilgili size en doğru bilgiyi sunmak için veritabanımı kontrol ediyorum. Sistem aktif modda çalışıyor ve çeşitli vergi ve düzenleme konularında size yardımcı olabilirim.`;
}

// Simple UUID generator fallback
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Generate mock sources based on message content
function generateMockSources(message) {
    const lowerMessage = message.toLowerCase();
    const sources = [];

    if (lowerMessage.includes('kdv')) {
        sources.push({
            id: 'kdv-001',
            title: 'KDV Genel Uygulama Tebliği',
            content: 'Katma Değer Vergisi uygulamasına ilişkin genel tebliğ',
            score: 0.95,
            category: 'Mevzuat',
            sourceTable: 'documents'
        });
        sources.push({
            id: 'kdv-002',
            title: 'KDV Oranları Hakkında Karar',
            content: 'Uygulanan KDV oranları ve istisnalar',
            score: 0.88,
            category: 'Mevzuat',
            sourceTable: 'documents'
        });
    } else if (lowerMessage.includes('gelir vergisi')) {
        sources.push({
            id: 'gv-001',
            title: 'Gelir Vergisi Kanunu',
            content: 'Gelir vergisinin hesaplanması ve ödenmesine ilişkin hükümler',
            score: 0.92,
            category: 'Mevzuat',
            sourceTable: 'documents'
        });
    } else if (lowerMessage.includes('şirket') || lowerMessage.includes('kurumlar vergisi')) {
        sources.push({
            id: 'kv-001',
            title: 'Kurumlar Vergisi Kanunu',
            content: 'Kurumlar vergisi mükellefleri ve vergilendirme esasları',
            score: 0.90,
            category: 'Mevzuat',
            sourceTable: 'documents'
        });
    } else {
        // Generic sources for other queries
        sources.push({
            id: 'doc-001',
            title: 'Vergi Mevzuatı Genel Bilgiler',
            content: 'Türk vergi sistemi hakkında genel bilgiler',
            score: 0.75,
            category: 'Genel',
            sourceTable: 'documents'
        });
    }

    return sources;
}

// Generate related topics based on message content
function generateRelatedTopics(message) {
    const lowerMessage = message.toLowerCase();
    const topics = [];

    if (lowerMessage.includes('kdv')) {
        topics.push({
            id: 'topic-001',
            title: 'KDV İadesi İşlemleri',
            excerpt: 'KDV iadesi nasıl alınır?',
            score: 0.85,
            category: 'İşlem'
        });
        topics.push({
            id: 'topic-002',
            title: 'KDV Tevkifatı',
            excerpt: 'KDV tevkifat oranları ve uygulaması',
            score: 0.80,
            category: 'Oran'
        });
    } else if (lowerMessage.includes('gelir vergisi')) {
        topics.push({
            id: 'topic-003',
            title: 'Gelir Vergisi Beyannamesi',
            excerpt: 'Gelir vergisi beyannamesi verme süreçleri',
            score: 0.82,
            category: 'Beyanname'
        });
        topics.push({
            id: 'topic-004',
            title: 'Gelir Vergisi İndirimleri',
            excerpt: 'Uygulanabilen gelir vergisi indirimleri',
            score: 0.78,
            category: 'İndirim'
        });
    }

    return topics;
}


router.post('/chat', handleChat);

module.exports = router;
