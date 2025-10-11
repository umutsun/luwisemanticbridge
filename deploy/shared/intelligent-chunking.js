"use strict";
/**
 * Luwi Semantic Bridge - Intelligent Chunking Strategies
 * @author Gemini (AI Integration Lead)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicChunker = exports.HierarchicalChunker = exports.TopicChunker = exports.SemanticChunker = void 0;
const openai_1 = __importDefault(require("openai"));
const chunk_1 = require("./chunk");
class SemanticChunker {
    constructor(apiKey) {
        this.openai = new openai_1.default({ apiKey });
    }
    async chunk(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are a text processing assistant. Your task is to insert a special delimiter "|||---|||" at the semantic boundaries of the given text. 
            Do not add any explanations or introductory text. Just return the text with the delimiters.`,
                    },
                    {
                        role: 'user',
                        content: text,
                    },
                ],
            });
            const delimitedText = response.choices[0].message.content || '';
            return delimitedText.split('|||---|||').map(chunk => chunk.trim()).filter(chunk => chunk.length > 0);
        }
        catch (error) {
            console.error('Error in SemanticChunker:', error);
            // Fallback to simple chunking
            return [text];
        }
    }
}
exports.SemanticChunker = SemanticChunker;
class TopicChunker {
    constructor(apiKey) {
        this.openai = new openai_1.default({ apiKey });
    }
    async identifyTopics(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are a text processing assistant. Your task is to identify the main topics in the given text. 
            Return a comma-separated list of topics. For example: "topic 1, topic 2, topic 3".
            Do not add any explanations or introductory text. Just return the topics.`,
                    },
                    {
                        role: 'user',
                        content: text,
                    },
                ],
            });
            const topicsString = response.choices[0].message.content || '';
            return topicsString.split(',').map(topic => topic.trim()).filter(topic => topic.length > 0);
        }
        catch (error) {
            console.error('Error in TopicChunker.identifyTopics:', error);
            return [];
        }
    }
    async chunk(text) {
        const topics = await this.identifyTopics(text);
        // Placeholder implementation for chunking by topic
        // This will be implemented in a future step.
        console.log('Identified topics:', topics);
        return [text];
    }
}
exports.TopicChunker = TopicChunker;
class HierarchicalChunker {
    constructor(apiKey, maxDepth = 3) {
        this.openai = new openai_1.default({ apiKey });
        this.maxDepth = maxDepth;
    }
    async chunk(text) {
        return this.recursiveChunk(text, 0);
    }
    async recursiveChunk(text, depth) {
        if (depth >= this.maxDepth || text.length < 1000) {
            return [text];
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are a text processing assistant. Your task is to split the given text into 2 to 4 large, coherent chunks. 
            Insert a special delimiter "|||---|||" between the chunks.
            Do not add any explanations or introductory text. Just return the text with the delimiters.`,
                    },
                    {
                        role: 'user',
                        content: text,
                    },
                ],
            });
            const delimitedText = response.choices[0].message.content || '';
            const chunks = delimitedText.split('|||---|||').map(chunk => chunk.trim()).filter(chunk => chunk.length > 0);
            const nestedChunks = await Promise.all(chunks.map(chunk => this.recursiveChunk(chunk, depth + 1)));
            return nestedChunks.flat();
        }
        catch (error) {
            console.error(`Error in HierarchicalChunker at depth ${depth}:`, error);
            return [text];
        }
    }
}
exports.HierarchicalChunker = HierarchicalChunker;
class DynamicChunker {
    constructor(apiKey) {
        this.openai = new openai_1.default({ apiKey });
    }
    async analyzeComplexity(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are a text complexity analysis assistant. Your task is to rate the complexity of the given text on a scale of 1 to 10, where 1 is very simple and 10 is very complex.
            Return only the number, without any explanations or introductory text.`,
                    },
                    {
                        role: 'user',
                        content: text,
                    },
                ],
            });
            const complexityString = response.choices[0].message.content || '5';
            return parseInt(complexityString, 10);
        }
        catch (error) {
            console.error('Error in DynamicChunker.analyzeComplexity:', error);
            return 5; // Default complexity
        }
    }
    async chunk(text) {
        const complexity = await this.analyzeComplexity(text);
        const maxChars = Math.round(1500 - (complexity * 100)); // Adjust chunk size based on complexity
        return (0, chunk_1.chunkText)(text, { maxChars, overlap: 100 });
    }
}
exports.DynamicChunker = DynamicChunker;
