import { create } from 'zustand';
import { Message, Conversation, ChatState } from '@/types/chat';

interface ChatStore extends ChatState {
  // State properties (inherited from ChatState)
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  setCurrentConversation: (conversationId: string) => void;
  createNewConversation: (title?: string) => string;
  clearError: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Getters
  getCurrentConversation: () => Conversation | null;
  getCurrentMessages: () => Message[];
}

// Generate UUID v4
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  error: null,

  // Actions
  addMessage: (message) => {
    set((state) => {
      const conversationId = state.currentConversationId;
      if (!conversationId) return state;

      return {
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
              ...conv,
              messages: [...conv.messages, message],
              updatedAt: new Date(),
            }
            : conv
        ),
      };
    });
  },

  updateMessage: (messageId, updates) => {
    set((state) => {
      const conversationId = state.currentConversationId;
      if (!conversationId) return state;

      return {
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId
            ? {
              ...conv,
              messages: conv.messages.map((msg: Message) =>
                msg.id === messageId ? { ...msg, ...updates } : msg
              ),
              updatedAt: new Date(),
            }
            : conv
        ),
      };
    });
  },

  setCurrentConversation: (conversationId) => {
    set({ currentConversationId: conversationId });
  },

  createNewConversation: (title = 'New Conversation') => {
    const newConversation: Conversation = {
      id: generateUUID(), // Use proper UUID instead of timestamp
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      conversations: [...state.conversations, newConversation],
      currentConversationId: newConversation.id,
    }));

    return newConversation.id;
  },

  clearError: () => set({ error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Getters
  getCurrentConversation: () => {
    const state = get();
    return (
      state.conversations.find(
        (conv) => conv.id === state.currentConversationId
      ) || null
    );
  },

  getCurrentMessages: () => {
    const conversation = get().getCurrentConversation();
    return conversation?.messages || [];
  },
}));