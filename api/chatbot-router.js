const express = require("express");
const router = express.Router();

/**
 * @route GET /api/v2/chatbot/settings
 * @group Chatbot - Chatbot interaction endpoints
 * @summary Get mock chatbot settings
 * @description Returns a mock configuration for the chatbot, including model, temperature, and enabled features.
 * @returns {object} 200 - An object containing mock chatbot settings.
 */
router.get("/settings", (req, res) => {
  res.json({
    model: process.env.AI_PROVIDER || "openai",
    temperature: 0.1,
    maxTokens: 2048,
    systemPrompt:
      "Sen Luwi Semantic Bridge asistanısın. Kullanıcılara sistem hakkında bilgi ver ve onlara yardımcı ol.",
    features: {
      ragEnabled: true,
      semanticSearch: true,
      documentUpload: true,
    },
  });
});

/**
 * @route POST /api/v2/chatbot/suggestions
 * @group Chatbot - Chatbot interaction endpoints
 * @summary Get mock query suggestions
 * @description Based on the user's query, returns a list of relevant mock suggestions.
 * @param {object} request.body.required - The request body.
 * @param {string} request.body.query - The user's current input query.
 * @returns {object} 200 - An object containing a list of suggestions.
 */
router.post("/suggestions", (req, res) => {
  try {
    const { query } = req.body;

    const suggestions = [
      "How do I configure the database connection?",
      "What are the supported LLM providers?",
      "How can I improve embedding quality?",
      "Tell me about RAG configuration",
      "How to set up API keys?",
    ];

    const relevantSuggestions = suggestions.filter((suggestion) => {
      if (!query) return true;
      const queryLower = query.toLowerCase();
      const suggestionLower = suggestion.toLowerCase();
      return (
        suggestionLower.includes(queryLower) ||
        queryLower.includes("config") ||
        queryLower.includes("database") ||
        queryLower.includes("api") ||
        queryLower.includes("llm")
      );
    });

    res.json({
      success: true,
      suggestions: relevantSuggestions.slice(0, 5),
      query: query || "",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to generate suggestions:", error);
    res.status(500).json({
      error: "Failed to generate suggestions",
      details: error.message,
    });
  }
});

/**
 * @route POST /api/v2/chatbot/chat
 * @group Chatbot - Chatbot interaction endpoints
 * @summary Post a message to the mock chatbot
 * @description Simulates a conversation with the chatbot, returning a mock response and follow-up suggestions.
 * @param {object} request.body.required - The request body.
 * @param {string} request.body.message - The user's message.
 * @returns {object} 200 - An object containing the chatbot's response.
 */
router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const response = {
      message: `I understand you're asking about: "${message}". This is a test response from the Luwi Semantic Bridge chatbot.`,
      suggestions: [
        "Tell me more about embeddings",
        "How to configure API keys?",
        "Database connection issues",
        "RAG system overview",
      ],
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      response: response,
    });
  } catch (error) {
    console.error("Chatbot conversation failed:", error);
    res.status(500).json({
      error: "Chatbot conversation failed",
      details: error.message,
    });
  }
});

/**
 * @route GET /api/v2/chatbot/prompts
 * @group Chatbot - Chatbot interaction endpoints
 * @summary Get a list of mock prompts
 * @description Returns a list of predefined mock system prompts that could be used by the chatbot.
 * @returns {object} 200 - An object containing a list of prompt objects.
 */
router.get("/prompts", (req, res) => {
  try {
    res.json({
      prompts: [
        {
          id: "system",
          name: "System Prompt",
          prompt:
            "Sen Luwi Semantic Bridge asistanısın. Kullanıcılara sistem hakkında bilgi ver ve onlara yardımcı ol.",
          isActive: true,
        },
        // ... other mock prompts
      ],
    });
  } catch (error) {
    console.error("Failed to get prompts:", error);
    res.status(500).json({
      error: "Failed to get prompts",
      details: error.message,
    });
  }
});

module.exports = router;
