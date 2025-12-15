import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    sources?: any[];
    context?: string[];
    isTyping?: boolean;
}

export interface SystemStatus {
    database: boolean;
    redis: boolean;
    semantic: boolean;
    n8n: boolean;
    responseTime: number;
}

export interface DashboardStats {
    database: {
        documents: number;
        conversations: number;
        messages: number;
        size: string;
        embeddings?: number;
        vectors?: number;
    };
    redis: {
        connected: boolean;
        used_memory: string;
        total_commands_processed: number;
        cached_embeddings?: number;
    };
    lightrag: {
        initialized: boolean;
        documentCount: number;
        lastUpdate: string;
        nodeCount?: number;
        edgeCount?: number;
        communities?: number;
    };
    rag: {
        totalChunks?: number;
        avgChunkSize?: number;
        indexStatus?: string;
        lastIndexTime?: string;
    };
    recentActivity: Array<{
        id: string;
        title: string;
        message_count: number;
        created_at: string;
    }>;
}

interface ChatStore {
    // Messages
    messages: Message[];
    addMessage: (message: Message) => void;
    clearMessages: () => void;
    updateMessage: (id: string, updates: Partial<Message>) => void;

    // System Status
    systemStatus: SystemStatus;
    updateSystemStatus: (status: Partial<SystemStatus>) => void;

    // Dashboard Stats
    dashboardStats: DashboardStats | null;
    setDashboardStats: (stats: DashboardStats) => void;

    // Active Context
    activeContext: string[];
    setActiveContext: (context: string[]) => void;
    addContext: (context: string) => void;
    removeContext: (context: string) => void;

    // Loading States
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;

    // Query States
    queryText: string;
    setQueryText: (text: string) => void;
    queryMode: 'simple' | 'hybrid' | 'graph';
    setQueryMode: (mode: 'simple' | 'hybrid' | 'graph') => void;
    queryResult: any;
    setQueryResult: (result: any) => void;
}

export const useChatStore = create<ChatStore>()(
    persist(
        (set) => ({
            // Messages
            messages: [
                {
                    id: '1',
                    role: 'assistant',
                    content: '👋 Merhaba! Ben Alice, AI destekli asistanınızım. Size nasıl yardımcı olabilirim?',
                    timestamp: new Date(),
                }
            ],
            addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
            clearMessages: () => set({
                messages: [
                    {
                        id: '1',
                        role: 'assistant',
                        content: '👋 Merhaba! Ben Alice, AI destekli asistanınızım. Size nasıl yardımcı olabilirim?',
                        timestamp: new Date(),
                    }
                ]
            }),
            updateMessage: (id, updates) => set((state) => ({
                messages: state.messages.map(msg => msg.id === id ? { ...msg, ...updates } : msg)
            })),

            // System Status
            systemStatus: {
                database: true,
                redis: true,
                semantic: true,
                n8n: true,
                responseTime: 1200, // in milliseconds
            },
            updateSystemStatus: (status) => set((state) => ({
                systemStatus: { ...state.systemStatus, ...status }
            })),

            // Dashboard Stats
            dashboardStats: null,
            setDashboardStats: (stats) => set({ dashboardStats: stats }),

            // Active Context
            activeContext: [],
            setActiveContext: (context) => set({ activeContext: context }),
            addContext: (context) => set((state) => ({
                activeContext: [...state.activeContext, context]
            })),
            removeContext: (context) => set((state) => ({
                activeContext: state.activeContext.filter(c => c !== context)
            })),

            // Loading States
            isLoading: false,
            setIsLoading: (loading) => set({ isLoading: loading }),

            // Query States
            queryText: '',
            setQueryText: (text) => set({ queryText: text }),
            queryMode: 'hybrid',
            setQueryMode: (mode) => set({ queryMode: mode }),
            queryResult: null,
            setQueryResult: (result) => set({ queryResult: result }),
        }),
        {
            name: 'lsemb-chat-storage',
            partialize: (state) => ({
                messages: state.messages,
                activeContext: state.activeContext,
                queryMode: state.queryMode
            }),
        }
    )
);

export default useChatStore;
