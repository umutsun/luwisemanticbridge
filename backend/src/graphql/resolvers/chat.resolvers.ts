/**
 * Chat Resolvers
 * Sohbet ve mesajlaşma GraphQL resolver'ları
 */

import { GraphQLContext } from '../context';
import { GraphQLError } from 'graphql';

export const chatResolvers = {
  Query: {
    /**
     * Chat oturumunu ID'si ile getir
     */
    async chatSession(
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!context.user) {
          throw new GraphQLError('Kimlik doğrulama gerekli', {
            extensions: { code: 'UNAUTHORIZED' },
          });
        }

        // Oturum getir
        const session = await context.prisma.chatSession.findUnique({
          where: { id: args.id },
          include: {
            messages: {
              take: 50,
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (!session) {
          throw new GraphQLError('Oturum bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Yetki kontrolü - oturum sahibi mi?
        if (session.userId !== context.user.id && context.user.role !== 'admin') {
          throw new GraphQLError('Bu oturmaya erişim yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        return formatChatSession(session);
      } catch (error) {
        console.error('Get chat session error:', error);
        throw new GraphQLError('Oturum getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * Kullanıcının tüm oturumlarını listele
     */
    async chatSessions(
      _parent: unknown,
      args: {
        userId: string;
        pagination?: { page?: number; limit?: number };
      },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!context.user) {
          throw new GraphQLError('Kimlik doğrulama gerekli', {
            extensions: { code: 'UNAUTHORIZED' },
          });
        }

        // Kullanıcı kendi verilerini mi getiriyor?
        if (
          args.userId !== context.user.id &&
          context.user.role !== 'admin'
        ) {
          throw new GraphQLError('Bu kullanıcının oturumlarına erişim yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        const page = args.pagination?.page || 1;
        const limit = args.pagination?.limit || 20;
        const offset = (page - 1) * limit;

        const [sessions, total] = await Promise.all([
          context.prisma.chatSession.findMany({
            where: { userId: args.userId },
            skip: offset,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            include: { lastMessage: true },
          }),
          context.prisma.chatSession.count({
            where: { userId: args.userId },
          }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
          items: sessions.map(formatChatSession),
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        };
      } catch (error) {
        console.error('Get chat sessions error:', error);
        throw new GraphQLError('Oturumlar getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * Chat mesajlarını getir
     */
    async chatMessages(
      _parent: unknown,
      args: {
        sessionId: string;
        pagination?: { page?: number; limit?: number };
      },
      context: GraphQLContext
    ) {
      try {
        const page = args.pagination?.page || 1;
        const limit = args.pagination?.limit || 50;
        const offset = (page - 1) * limit;

        // Oturumu kontrol et
        const session = await context.prisma.chatSession.findUnique({
          where: { id: args.sessionId },
          select: { userId: true },
        });

        if (!session) {
          throw new GraphQLError('Oturum bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Yetki kontrolü
        if (
          session.userId !== context.user?.id &&
          context.user?.role !== 'admin'
        ) {
          throw new GraphQLError('Bu oturmaya erişim yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        const [messages, total] = await Promise.all([
          context.prisma.chatMessage.findMany({
            where: { sessionId: args.sessionId },
            skip: offset,
            take: limit,
            orderBy: { createdAt: 'asc' },
            include: {
              sources: true,
              feedback: true,
            },
          }),
          context.prisma.chatMessage.count({
            where: { sessionId: args.sessionId },
          }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
          items: messages.map(formatChatMessage),
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        };
      } catch (error) {
        console.error('Get chat messages error:', error);
        throw new GraphQLError('Mesajlar getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * Tek bir mesaj getir
     */
    async chatMessage(
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ) {
      try {
        const message = await context.dataloaders.chatMessageLoader.load(args.id);

        if (!message) {
          throw new GraphQLError('Mesaj bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        return formatChatMessage(message);
      } catch (error) {
        console.error('Get chat message error:', error);
        throw new GraphQLError('Mesaj getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * Chat analytics
     */
    async chatAnalytics(
      _parent: unknown,
      args: {
        startDate?: Date;
        endDate?: Date;
      },
      context: GraphQLContext
    ) {
      try {
        const endDate = args.endDate || new Date();
        const startDate =
          args.startDate ||
          new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Analytics verilerini topla
        const [totalSessions, activeUsers, totalMessages, totalTokens] =
          await Promise.all([
            context.prisma.chatSession.count({
              where: {
                createdAt: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            }),
            context.prisma.chatSession.findMany({
              distinct: ['userId'],
              where: {
                createdAt: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            }),
            context.prisma.chatMessage.count({
              where: {
                createdAt: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            }),
            // Token sayısı - örnek hesaplama
            0, // TODO: implement token tracking
          ]);

        return {
          totalSessions,
          activeUsers: activeUsers.length,
          averageMessagesPerSession:
            totalSessions > 0 ? totalMessages / totalSessions : 0,
          totalTokensUsed: totalTokens,
          topModels: [],
          averageResponseTime: 0, // TODO: implement timing
          sessionTrends: [],
        };
      } catch (error) {
        console.error('Chat analytics error:', error);
        throw new GraphQLError('Analitik verileri getirilirken hata oluştu', {
          extensions: { code: 'ANALYTICS_ERROR' },
        });
      }
    },
  },

  Mutation: {
    /**
     * Yeni chat oturumu oluştur
     */
    async createChatSession(
      _parent: unknown,
      args: {
        input: {
          title: string;
          description?: string;
          userId: string;
          model?: string;
          temperature?: number;
          systemPrompt?: string;
          metadata?: any;
        };
      },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!context.user) {
          throw new GraphQLError('Kimlik doğrulama gerekli', {
            extensions: { code: 'UNAUTHORIZED' },
          });
        }

        // Kullanıcı kendi adına mı oluşturuyor?
        if (
          args.input.userId !== context.user.id &&
          context.user.role !== 'admin'
        ) {
          throw new GraphQLError('Bu işlem için yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Oturum oluştur
        const session = await context.prisma.chatSession.create({
          data: {
            title: args.input.title,
            description: args.input.description,
            userId: args.input.userId,
            model: args.input.model || 'claude-3',
            temperature: args.input.temperature || 0.7,
            systemPrompt: args.input.systemPrompt,
            metadata: args.input.metadata,
            isActive: true,
          },
        });

        return formatChatSession(session);
      } catch (error) {
        console.error('Create chat session error:', error);
        throw new GraphQLError('Oturum oluşturulurken hata oluştu', {
          extensions: { code: 'CREATE_ERROR' },
        });
      }
    },

    /**
     * Sohbete mesaj gönder
     */
    async sendChatMessage(
      _parent: unknown,
      args: {
        input: {
          sessionId: string;
          content: string;
          sources?: any[];
          metadata?: any;
        };
      },
      context: GraphQLContext
    ) {
      try {
        // Oturum kontrol et
        const session = await context.prisma.chatSession.findUnique({
          where: { id: args.input.sessionId },
        });

        if (!session) {
          throw new GraphQLError('Oturum bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Mesajı oluştur
        const message = await context.prisma.chatMessage.create({
          data: {
            sessionId: args.input.sessionId,
            content: args.input.content,
            role: 'USER',
            model: session.model,
            generatedAt: new Date(),
          },
        });

        return formatChatMessage(message);
      } catch (error) {
        console.error('Send chat message error:', error);
        throw new GraphQLError('Mesaj gönderilirken hata oluştu', {
          extensions: { code: 'SEND_ERROR' },
        });
      }
    },

    /**
     * Chat oturumunu güncelle
     */
    async updateChatSession(
      _parent: unknown,
      args: {
        input: {
          id: string;
          title?: string;
          description?: string;
          model?: string;
          temperature?: number;
          systemPrompt?: string;
          metadata?: any;
        };
      },
      context: GraphQLContext
    ) {
      try {
        // Oturum getir
        const session = await context.prisma.chatSession.findUnique({
          where: { id: args.input.id },
        });

        if (!session) {
          throw new GraphQLError('Oturum bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Yetki kontrolü
        if (
          session.userId !== context.user?.id &&
          context.user?.role !== 'admin'
        ) {
          throw new GraphQLError('Bu oturmayı güncelleme yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Güncelle
        const updated = await context.prisma.chatSession.update({
          where: { id: args.input.id },
          data: {
            title: args.input.title,
            description: args.input.description,
            model: args.input.model,
            temperature: args.input.temperature,
            systemPrompt: args.input.systemPrompt,
            metadata: args.input.metadata,
          },
        });

        return formatChatSession(updated);
      } catch (error) {
        console.error('Update chat session error:', error);
        throw new GraphQLError('Oturum güncellenirken hata oluştu', {
          extensions: { code: 'UPDATE_ERROR' },
        });
      }
    },

    /**
     * Chat oturumunu sil
     */
    async deleteChatSession(
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ) {
      try {
        const session = await context.prisma.chatSession.findUnique({
          where: { id: args.id },
        });

        if (!session) {
          throw new GraphQLError('Oturum bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Yetki kontrolü
        if (
          session.userId !== context.user?.id &&
          context.user?.role !== 'admin'
        ) {
          throw new GraphQLError('Bu oturmayı silme yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        await context.prisma.chatSession.delete({
          where: { id: args.id },
        });

        return true;
      } catch (error) {
        console.error('Delete chat session error:', error);
        throw new GraphQLError('Oturum silinirken hata oluştu', {
          extensions: { code: 'DELETE_ERROR' },
        });
      }
    },

    /**
     * Oturumdaki tüm mesajları sil
     */
    async clearChatMessages(
      _parent: unknown,
      args: { sessionId: string },
      context: GraphQLContext
    ) {
      try {
        const session = await context.prisma.chatSession.findUnique({
          where: { id: args.sessionId },
        });

        if (!session) {
          throw new GraphQLError('Oturum bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Yetki kontrolü
        if (
          session.userId !== context.user?.id &&
          context.user?.role !== 'admin'
        ) {
          throw new GraphQLError('Bu işlem için yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        await context.prisma.chatMessage.deleteMany({
          where: { sessionId: args.sessionId },
        });

        return true;
      } catch (error) {
        console.error('Clear chat messages error:', error);
        throw new GraphQLError('Mesajlar silinirken hata oluştu', {
          extensions: { code: 'DELETE_ERROR' },
        });
      }
    },

    /**
     * Mesaj yeniden oluştur
     */
    async regenerateMessage(
      _parent: unknown,
      args: { messageId: string },
      context: GraphQLContext
    ) {
      try {
        const message = await context.prisma.chatMessage.findUnique({
          where: { id: args.messageId },
        });

        if (!message) {
          throw new GraphQLError('Mesaj bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Mesajı yeniden oluştur (LLM çağrısı yapılır)
        // TODO: implement message regeneration with LLM

        return formatChatMessage(message);
      } catch (error) {
        console.error('Regenerate message error:', error);
        throw new GraphQLError('Mesaj yeniden oluşturulurken hata oluştu', {
          extensions: { code: 'REGENERATE_ERROR' },
        });
      }
    },
  },

  Subscription: {
    /**
     * Yeni mesajları gerçek zamanlı al
     */
    chatMessageAdded: {
      subscribe: async (_parent, args, context) => {
        const channel = `chat:messages:${args.sessionId}`;
        return context.redis.subscribe(channel);
      },
    },

    /**
     * Yazılıyor göstergesi
     */
    chatTyping: {
      subscribe: async (_parent, args, context) => {
        const channel = `chat:typing:${args.sessionId}`;
        return context.redis.subscribe(channel);
      },
    },

    /**
     * Chat streaming
     */
    chatStreaming: {
      subscribe: async (_parent, args, context) => {
        const channel = `chat:streaming:${args.sessionId}`;
        return context.redis.subscribe(channel);
      },
    },
  },
};

// Yardımcı fonksiyonlar
function formatChatSession(session: any) {
  return {
    id: session.id,
    userId: session.userId,
    title: session.title,
    description: session.description,
    messages: session.messages?.map(formatChatMessage) || [],
    messageCount: session.messageCount || 0,
    lastMessage: session.lastMessage
      ? formatChatMessage(session.lastMessage)
      : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isActive: session.isActive,
    model: session.model,
    temperature: session.temperature,
    systemPrompt: session.systemPrompt,
    metadata: session.metadata,
  };
}

function formatChatMessage(message: any) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    content: message.content,
    role: message.role,
    model: message.model,
    tokens: message.tokens,
    sources: message.sources || [],
    citations: message.citations || [],
    embeddingId: message.embeddingId,
    feedback: message.feedback,
    generatedAt: message.generatedAt,
    createdAt: message.createdAt,
  };
}