const express = require("express");
const router = express.Router();
const { Client, Pool } = require("pg");
const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getLsembPool } = require("./db-pool");
const { getRedisClient } = require("./redis-client");
require("dotenv").config();

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
const pool = getLsembPool();
const redis = getRedisClient();
const SETTINGS_CACHE_KEY = "chat:ai_settings";
const SETTINGS_CACHE_TTL = 300; // 5 minutes

// --- Ana Chat Mantığı ---

// RAG için benzer dokümanları arama
async function searchDocuments(query, limit = 5) {
  const client = await pool.connect();
  const settings = await getChatSettings(); // Get settings to use the correct model
  const embeddingModel =
    settings.models?.openai?.embeddingModel || "text-embedding-ada-002";

  try {
    const queryEmbeddingResponse = await getOpenAI().embeddings.create({
      model: embeddingModel,
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
    const result = await client.query(searchQuery, [
      JSON.stringify(queryEmbedding),
      limit,
    ]);
    return result.rows.map((row) => ({ ...row, score: row.similarity }));
  } finally {
    client.release();
  }
}

// Ayarları veritabanından çekme
async function getChatSettings() {
  // 1. Check cache first
  const cachedSettings = await redis.get(SETTINGS_CACHE_KEY);
  if (cachedSettings) {
    return JSON.parse(cachedSettings);
  }

  // 2. If miss, fetch from DB
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT value FROM settings WHERE key = 'ai_settings'"
    );
    let settings;
    if (result.rows.length > 0 && result.rows[0].value) {
      settings = result.rows[0].value;
    } else {
      // Varsayılan ayarlar
      settings = {
        primaryModel: "openai",
        fallbackOrder: ["anthropic", "gemini"],
        models: {
          openai: {
            modelName: "gpt-3.5-turbo",
            embeddingModel: "text-embedding-ada-002",
            systemPrompt: "You are a helpful OpenAI assistant.",
          },
          anthropic: {
            modelName: "claude-3-haiku-20240307",
            systemPrompt: "You are a helpful Anthropic assistant.",
          },
          gemini: {
            modelName: "gemini-1.5-flash-latest",
            systemPrompt: "You are a helpful Gemini assistant.",
          },
        },
        enableJsonOutput: true,
      };
    }
    // 3. Populate cache
    await redis.set(
      SETTINGS_CACHE_KEY,
      JSON.stringify(settings),
      "EX",
      SETTINGS_CACHE_TTL
    );
    return settings;
  } finally {
    client.release();
  }
}

// JSON formatını zorunlu kılan prompt oluşturucu
function createJsonSystemPrompt(basePrompt) {
  return `${basePrompt}\n\nALWAYS provide your response in the following JSON format. Do not include any text outside of this JSON structure:\n{\n  "response": "Your detailed answer here.",\n  "sources": [\n    {\n      "id": "document_id_1",\n      "title": "Document Title 1",\n      "score": 0.95\n    }\n  ]\n}`;
}

// --- Yeni Yardımcı Fonksiyonlar (Daha Temiz Kod İçin) ---

/**
 * RAG için bulunan kaynakları ve kullanıcı mesajını birleştirerek LLM için bir prompt oluşturur.
 * @param {string} userMessage - Kullanıcının mesajı.
 * @param {Array} documents - searchDocuments'tan dönen dokümanlar.
 * @param {string} baseSystemPrompt - Veritabanından gelen temel sistem prompt'u.
 * @returns {string} LLM'e gönderilecek tam sistem prompt'u.
 */
function buildRagPrompt(userMessage, documents, baseSystemPrompt) {
  const context = documents
    .map(
      (doc) =>
        `--- Document (ID: ${doc.id}, Score: ${doc.score.toFixed(
          2
        )}) ---\nTitle: ${doc.title}\nContent: ${doc.content}\n---`
    )
    .join("\n\n");

  const finalPrompt = `
${baseSystemPrompt}

You must answer the user's question based *only* on the provided documents below.
If the answer is not in the documents, state that you cannot find the information in the provided sources.
Cite the document IDs for the information you use.

--- CONTEXT DOCUMENTS ---
${context}
--- END OF DOCUMENTS ---

User Question: "${userMessage}"
`;
  return finalPrompt;
}

/**
 * LLM yanıtını ve kaynakları ön yüzün beklediği formata dönüştürür.
 * @param {object} llmResult - LLM'den gelen işlenmiş sonuç.
 * @param {string} conversationId - Mevcut konuşma ID'si.
 * @param {object} usage - Token kullanım bilgisi.
 * @returns {object} API yanıtı.
 */
function formatApiResponse(llmResult, conversationId, usage) {
  return {
    id: Date.now().toString(),
    sessionId: conversationId,
    message:
      llmResult.response || "An error occurred while generating the response.",
    usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    timestamp: new Date().toISOString(),
    type: "bot",
    sources: llmResult.sources || [],
    relatedTopics: llmResult.relatedTopics || [], // Bu kısım daha sonra geliştirilebilir.
    conversationId: conversationId,
  };
}

/**
 * LLM'den gelen yanıtı güvenli bir şekilde JSON olarak ayrıştırır.
 * @param {string} rawResponse - LLM'den gelen ham metin.
 * @returns {object} Ayrıştırılmış JSON nesnesi.
 */
function parseLlmResponse(rawResponse) {
  try {
    // Yanıttan sadece JSON kısmını çıkarmak için basit bir regex
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Eğer JSON bulunamazsa, yanıtı doğrudan kullan
    return { response: rawResponse, sources: [] };
  } catch (error) {
    console.error("Failed to parse LLM JSON response:", error);
    // Hata durumunda ham yanıtı bir obje içinde döndür
    return { response: rawResponse, sources: [] };
  }
}

/**
 * Ayarlara göre LLM'i çağırır ve hata durumunda yedek modellere geçer.
 * @param {object} settings - getChatSettings'ten gelen ayarlar.
 * @param {string} finalPrompt - LLM'e gönderilecek olan son prompt.
 * @param {string} userMessage - Kullanıcının orijinal mesajı.
 * @param {number} temperature - LLM sıcaklık ayarı.
 * @returns {Promise<{content: string, usage: object}>} LLM'den gelen ham yanıt ve token kullanımı.
 */
async function callLlmWithFallback(
  settings,
  finalPrompt,
  userMessage,
  temperature
) {
  const modelsToTry = [settings.primaryModel, ...settings.fallbackOrder];
  let lastError = null;

  for (const modelKey of modelsToTry) {
    const modelConfig = settings.models[modelKey];
    if (!modelConfig) {
      console.warn(`Model key "${modelKey}" not found in settings. Skipping.`);
      continue;
    }

    try {
      console.log(`Attempting to call model: ${modelKey}`);
      switch (modelKey) {
        case "openai":
          const openai = getOpenAI();
          if (!openai) throw new Error("OpenAI client not initialized.");
          const openaiResponse = await openai.chat.completions.create({
            model: modelConfig.modelName,
            messages: [
              { role: "system", content: finalPrompt },
              { role: "user", content: userMessage },
            ],
            temperature: temperature || 0.5,
          });
          return {
            content: openaiResponse.choices[0].message.content,
            usage: openaiResponse.usage, // Token bilgisini de döndür
          };

        case "anthropic":
          const anthropic = getAnthropic();
          if (!anthropic) throw new Error("Anthropic client not initialized.");
          const anthropicResponse = await anthropic.messages.create({
            model: modelConfig.modelName,
            system: finalPrompt,
            messages: [{ role: "user", content: userMessage }],
            max_tokens: 1024,
          });
          return {
            content: anthropicResponse.content[0].text,
            usage: anthropicResponse.usage, // Token bilgisini de döndür
          };

        case "gemini":
          const genAI = getGenAI();
          if (!genAI) throw new Error("Google GenAI client not initialized.");
          const model = genAI.getGenerativeModel({
            model: modelConfig.modelName,
            systemInstruction: finalPrompt,
          });
          const result = await model.generateContent(userMessage);
          // Gemini API'si doğrudan bir 'usage' nesnesi döndürmez,
          // ancak 'totalTokens' gibi bilgileri sağlayabilir.
          // Şimdilik bunu manuel olarak yapılandırıyoruz.
          const tokenInfo = await model.countTokens(finalPrompt + userMessage);
          return {
            content: result.response.text(),
            usage: { total_tokens: tokenInfo.totalTokens },
          };

        default:
          console.warn(`Unsupported model key: ${modelKey}`);
          continue;
      }
    } catch (error) {
      console.error(`Error with model ${modelKey}:`, error.message);
      lastError = error;
    }
  }

  // Eğer tüm modeller başarısız olursa
  throw new Error(
    `All LLM providers failed. Last error: ${lastError?.message}`
  );
}

// Chat handler
async function handleChat(req, res) {
  const {
    message,
    conversationId,
    userId = "demo-user",
    temperature,
    model,
    systemPrompt,
    ragWeight,
    useLocalDb,
    language,
    responseStyle,
  } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    console.log("Processing chat message:", message);
    const currentConversationId = conversationId || generateUUID(); // Eğer yoksa yeni bir ID oluştur

    // 1. Ayarları ve ilgili dokümanları çek
    const settings = await getChatSettings();
    const documents = await searchDocuments(message, 5); // İlgili 5 dokümanı bul

    // 2. LLM için RAG prompt'unu oluştur
    // Not: Birincil modelin sistem prompt'unu temel alıyoruz.
    const primaryModelKey = settings.primaryModel;
    const baseSystemPrompt =
      settings.models[primaryModelKey]?.systemPrompt ||
      "You are a helpful assistant.";
    let finalPrompt = buildRagPrompt(message, documents, baseSystemPrompt);

    // Ayarlarda JSON çıktısı isteniyorsa, prompt'u ona göre düzenle
    if (settings.enableJsonOutput) {
      finalPrompt = createJsonSystemPrompt(finalPrompt);
    }

    // 3. LLM'i çağır (yedeklilik mekanizması ile birlikte)
    const { content: llmRawResponse, usage: tokenUsage } =
      await callLlmWithFallback(settings, finalPrompt, message, temperature);

    // 4. Yanıtı formatla
    const parsedResult = parseLlmResponse(llmRawResponse);
    const response = formatApiResponse(
      parsedResult,
      currentConversationId,
      tokenUsage // Token bilgisini formatlama fonksiyonuna gönder
    );

    // WebSocket üzerinden token kullanımını anlık olarak yayınla
    const io = req.app.get("socketio");
    if (io && response.usage) {
      io.emit("chat:usage_update", {
        total_tokens: response.usage.total_tokens,
      });
    }

    console.log("Sending chat response");
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
  if (
    lowerMessage.includes("merhaba") ||
    lowerMessage.includes("hello") ||
    lowerMessage.includes("hi")
  ) {
    return "Hello! I am Alice Semantic Bridge assistant. I can help you with tax, accounting and financial regulations. How can I assist you? / Merhaba! Ben Alice Semantic Bridge asistanıyım. Size vergi, muhasebe ve mali mevzuat konularında yardımcı olabilirim. Nasıl yardımcı olabilirim?";
  }

  if (
    lowerMessage.includes("kdv") ||
    lowerMessage.includes("vat") ||
    lowerMessage.includes("tax")
  ) {
    return "I can provide information about Value Added Tax (VAT). VAT is a tax on the value added to goods and services. General rates are 1%, 8% and 18%. For detailed information, please ask specific questions. / KDV (Katma Değer Vergisi) hakkında bilgi verebilirim. KDV, mal ve hizmetlerin tesliminde ve ithalinde ortaya çıkan bir vergi türüdür.";
  }

  if (
    lowerMessage.includes("gelir vergisi") ||
    lowerMessage.includes("income tax")
  ) {
    return "Income tax is a tax paid by real and legal persons on their income within a calendar year. I can provide detailed information about 2024 income tax rates. / Gelir vergisi, gerçek ve tüzel kişilerin bir takvim yılı içinde elde ettikleri gelirler üzerinden ödedikleri vergidir.";
  }

  if (
    lowerMessage.includes("şirket") ||
    lowerMessage.includes("kurumlar vergisi") ||
    lowerMessage.includes("corporate tax")
  ) {
    return "Corporate tax is paid by capital companies, cooperatives and other legal persons on their corporate earnings. The corporate tax rate for 2024 is 20%. / Kurumlar vergisi, sermaye şirketleri, kooperatifler ve diğer tüzel kişilerin elde ettikleri kurum kazançları üzerinden ödedikleri vergidir.";
  }

  // Default response - configurable from database
  return `I understand your question about "${message}". I am currently checking my database to provide you with the most accurate information. The system is running in active mode and I can assist you with various tax and regulatory topics.\n\nPlease specify if you need more detailed information about any particular aspect.\n\nSorunuz anlaşıldı. "${message}" konusuyla ilgili size en doğru bilgiyi sunmak için veritabanımı kontrol ediyorum. Sistem aktif modda çalışıyor ve çeşitli vergi ve düzenleme konularında size yardımcı olabilirim.`;
}

// Simple UUID generator fallback
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate mock sources based on message content
function generateMockSources(message) {
  const lowerMessage = message.toLowerCase();
  const sources = [];

  if (lowerMessage.includes("kdv")) {
    sources.push({
      id: "kdv-001",
      title: "KDV Genel Uygulama Tebliği",
      content: "Katma Değer Vergisi uygulamasına ilişkin genel tebliğ",
      score: 0.95,
      category: "Mevzuat",
      sourceTable: "documents",
    });
    sources.push({
      id: "kdv-002",
      title: "KDV Oranları Hakkında Karar",
      content: "Uygulanan KDV oranları ve istisnalar",
      score: 0.88,
      category: "Mevzuat",
      sourceTable: "documents",
    });
  } else if (lowerMessage.includes("gelir vergisi")) {
    sources.push({
      id: "gv-001",
      title: "Gelir Vergisi Kanunu",
      content: "Gelir vergisinin hesaplanması ve ödenmesine ilişkin hükümler",
      score: 0.92,
      category: "Mevzuat",
      sourceTable: "documents",
    });
  } else if (
    lowerMessage.includes("şirket") ||
    lowerMessage.includes("kurumlar vergisi")
  ) {
    sources.push({
      id: "kv-001",
      title: "Kurumlar Vergisi Kanunu",
      content: "Kurumlar vergisi mükellefleri ve vergilendirme esasları",
      score: 0.9,
      category: "Mevzuat",
      sourceTable: "documents",
    });
  } else {
    // Generic sources for other queries
    sources.push({
      id: "doc-001",
      title: "Vergi Mevzuatı Genel Bilgiler",
      content: "Türk vergi sistemi hakkında genel bilgiler",
      score: 0.75,
      category: "Genel",
      sourceTable: "documents",
    });
  }

  return sources;
}

// Generate related topics based on message content
function generateRelatedTopics(message) {
  const lowerMessage = message.toLowerCase();
  const topics = [];

  if (lowerMessage.includes("kdv")) {
    topics.push({
      id: "topic-001",
      title: "KDV İadesi İşlemleri",
      excerpt: "KDV iadesi nasıl alınır?",
      score: 0.85,
      category: "İşlem",
    });
    topics.push({
      id: "topic-002",
      title: "KDV Tevkifatı",
      excerpt: "KDV tevkifat oranları ve uygulaması",
      score: 0.8,
      category: "Oran",
    });
  } else if (lowerMessage.includes("gelir vergisi")) {
    topics.push({
      id: "topic-003",
      title: "Gelir Vergisi Beyannamesi",
      excerpt: "Gelir vergisi beyannamesi verme süreçleri",
      score: 0.82,
      category: "Beyanname",
    });
    topics.push({
      id: "topic-004",
      title: "Gelir Vergisi İndirimleri",
      excerpt: "Uygulanabilen gelir vergisi indirimleri",
      score: 0.78,
      category: "İndirim",
    });
  }

  return topics;
}

router.post("/chat", handleChat);

module.exports = router;
