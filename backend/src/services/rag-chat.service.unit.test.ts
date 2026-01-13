
import { RAGChatService } from './rag-chat.service';
import { LLMManager } from './llm-manager.service';
import { semanticSearch } from './semantic-search.service';
import pool from '../config/database';

// Mock dependencies
jest.mock('./llm-manager.service');
jest.mock('./semantic-search.service');
jest.mock('../config/database', () => ({
    __esModule: true,
    default: {
        query: jest.fn(),
    },
}));
jest.mock('../config/redis', () => ({
    redis: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
    },
    initializeRedis: jest.fn(),
}));
jest.mock('./data-schema.service', () => ({
    dataSchemaService: {
        loadConfig: jest.fn().mockResolvedValue({
            schemas: [{ id: 'default', llmConfig: { topicEntities: [], keyTerms: [] } }],
            activeSchemaId: 'default'
        }),
    }
}));

describe.skip('RAGChatService', () => {
    let service: RAGChatService;
    let mockLLMManager: any;
    let mockPool: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLLMManager = {
            extractProviderFromModel: jest.fn().mockReturnValue('anthropic'),
            generateChatResponse: jest.fn().mockResolvedValue({ content: 'Test response' }),
        };

        (LLMManager.getInstance as jest.Mock).mockReturnValue(mockLLMManager);
        mockPool = pool;

        // Default pool.query behavior
        mockPool.query.mockResolvedValue({ rows: [] });

        service = new RAGChatService();

        // Spy on internal methods to avoid DB triggers
        jest.spyOn(service as any, 'ensureConversation').mockResolvedValue(undefined);
        jest.spyOn(service as any, 'logActivity').mockResolvedValue(undefined);
        jest.spyOn(service as any, 'saveMessage').mockResolvedValue(undefined);
        jest.spyOn(service as any, 'getConversationHistory').mockResolvedValue([]);
    });

    it('should initialize correctly', () => {
        expect(service).toBeDefined();
        expect(LLMManager.getInstance).toHaveBeenCalled();
    });

    describe('processMessage', () => {
        beforeAll(() => {
            // Mock Date.now to avoid timing issues if necessary, usually not needed for unit tests unless verifying ttl
        });

        it('should process a basic message and return a response', async () => {
            // Mock settings
            mockPool.query.mockImplementation((query: string, params: any[]) => {
                if (query.includes('FROM settings')) {
                    // Return mocked settings as rows
                    return Promise.resolve({
                        rows: [
                            { key: 'ragSettings.maxResults', value: '10' },
                            { key: 'response_language', value: 'tr' }
                        ]
                    });
                }
                if (query.includes('FROM chatbot_settings')) {
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [] });
            });

            // Mock semantic search
            (semanticSearch.hybridSearch as jest.Mock).mockResolvedValue([
                { title: 'Doc 1', content: 'Relevant content', score: 0.9 }
            ]);

            const result = await service.processMessage('Vergi nedir?', 'test-conv-id', 'user-1');

            expect(semanticSearch.hybridSearch).toHaveBeenCalled();
            expect(mockLLMManager.generateChatResponse).toHaveBeenCalled();
            expect(result.response).toBe('Test response');
            expect(result.sources).toHaveLength(1);
        });

        it('should return NEEDS_CLARIFICATION for vague queries', async () => {
            // Mock domain config implicitly loaded

            // Mock pool to allow fetching domain config or settings safely
            mockPool.query.mockResolvedValue({ rows: [] });

            const result = await service.processMessage('ne?', 'conv-1', 'user-1');

            expect(result._debug?.responseType).toBe('NEEDS_CLARIFICATION');
            expect(mockLLMManager.generateChatResponse).not.toHaveBeenCalled();
        });

        it('should return OUT_OF_SCOPE for obviously unrelated queries', async () => {
            mockPool.query.mockResolvedValue({ rows: [] });

            const result = await service.processMessage('Einstein kimdir?', 'conv-1', 'user-1');

            expect(result._debug?.responseType).toBe('OUT_OF_SCOPE');
        });

        it('should handle PDF context correctly', async () => {
            const result = await service.processMessage('Bu belge nedir?', 'conv-2', 'user-1', {
                pdfContext: {
                    filename: 'test.pdf',
                    extractedText: 'This is a test PDF content.',
                    pageCount: 1
                }
            });

            expect(result.pdfMode).toBe(true);
            expect(result.pdfFilename).toBe('test.pdf');
            // It calls processPdfMessage internal method
        });

    });
});
