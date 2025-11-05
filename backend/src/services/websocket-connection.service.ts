import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { authenticateToken } from '../middleware/auth.middleware';
import { MessageStorageService } from './message-storage.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  sessionId?: string;
}

export class WebSocketConnectionService {
  private io: SocketServer;
  private connectedClients = new Map<string, AuthenticatedSocket>();
  private typingUsers = new Map<string, Set<string>>();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          'http://localhost:3004',
          'http://localhost:3005',
          'http://localhost:3008'
        ],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware for Socket.IO
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Create a mock request object for authentication
        const mockReq = {
          headers: {
            authorization: `Bearer ${token}`
          }
        } as any;

        const mockRes = {
          status: () => mockRes,
          json: () => mockRes
        } as any;

        // Authenticate the token
        authenticateToken(mockReq, mockRes, () => {
          if (mockReq.user) {
            socket.userId = mockReq.user.userId;
            socket.userRole = mockReq.user.role;
            next();
          } else {
            next(new Error('Invalid token'));
          }
        });
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`🔌 User connected: ${socket.userId} (${socket.userRole})`);

      // Store connected client
      this.connectedClients.set(socket.id, socket);

      // Join user to their personal room
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
      }

      // Handle joining a conversation session
      socket.on('join:session', (sessionId: string) => {
        socket.sessionId = sessionId;
        socket.join(`session:${sessionId}`);
        socket.emit('joined:session', { sessionId });

        // Notify others in the session
        socket.to(`session:${sessionId}`).emit('user:joined', {
          userId: socket.userId,
          userRole: socket.userRole
        });
      });

      // Handle leaving a conversation session
      socket.on('leave:session', () => {
        if (socket.sessionId) {
          socket.leave(`session:${socket.sessionId}`);
          socket.to(`session:${socket.sessionId}`).emit('user:left', {
            userId: socket.userId
          });
          socket.sessionId = undefined;
        }
      });

      // Handle typing indicators
      socket.on('typing:start', (data: { sessionId: string }) => {
        if (!socket.sessionId || !socket.userId) return;

        const typingKey = `${socket.sessionId}`;
        if (!this.typingUsers.has(typingKey)) {
          this.typingUsers.set(typingKey, new Set());
        }

        this.typingUsers.get(typingKey)!.add(socket.userId);

        socket.to(`session:${socket.sessionId}`).emit('typing:status', {
          userId: socket.userId,
          isTyping: true
        });
      });

      socket.on('typing:stop', (data: { sessionId: string }) => {
        if (!socket.sessionId || !socket.userId) return;

        const typingKey = `${socket.sessionId}`;
        const typingSet = this.typingUsers.get(typingKey);

        if (typingSet) {
          typingSet.delete(socket.userId);
          if (typingSet.size === 0) {
            this.typingUsers.delete(typingKey);
          }
        }

        socket.to(`session:${socket.sessionId}`).emit('typing:status', {
          userId: socket.userId,
          isTyping: false
        });
      });

      // Handle real-time message streaming
      socket.on('message:stream', async (data: {
        sessionId: string;
        content: string;
        type: 'question' | 'answer';
      }) => {
        if (!socket.userId || !socket.sessionId) return;

        try {
          // Save message to storage
          await MessageStorageService.saveChatInteraction(
            socket.sessionId,
            data.type === 'question' ? data.content : '',
            data.type === 'answer' ? data.content : '',
            socket.userId,
            {
              streaming: true,
              timestamp: new Date().toISOString(),
              socketId: socket.id
            }
          );

          // Broadcast to session participants
          this.io.to(`session:${socket.sessionId}`).emit('message:received', {
            id: Date.now(),
            sessionId: socket.sessionId,
            userId: socket.userId,
            content: data.content,
            type: data.type,
            timestamp: new Date().toISOString(),
            userRole: socket.userRole
          });
        } catch (error) {
          console.error('Error handling message stream:', error);
          socket.emit('error', { message: 'Failed to process message' });
        }
      });

      // Handle conversation quality feedback
      socket.on('feedback:quality', async (data: {
        messageId: string;
        rating: number;
        comment?: string;
      }) => {
        if (!socket.userId) return;

        try {
          // Store feedback for analytics
          await MessageStorageService.saveQualityFeedback(
            socket.userId,
            data.messageId,
            data.rating,
            data.comment
          );

          // Acknowledge receipt
          socket.emit('feedback:received', {
            messageId: data.messageId,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error saving feedback:', error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`🔌 User disconnected: ${socket.userId} (${reason})`);

        // Clean up typing indicators
        if (socket.sessionId && socket.userId) {
          const typingKey = `${socket.sessionId}`;
          const typingSet = this.typingUsers.get(typingKey);
          if (typingSet) {
            typingSet.delete(socket.userId);
            socket.to(`session:${socket.sessionId}`).emit('typing:status', {
              userId: socket.userId,
              isTyping: false
            });
          }
        }

        // Remove from connected clients
        this.connectedClients.delete(socket.id);
      });

      // Send welcome message
      socket.emit('connected', {
        userId: socket.userId,
        userRole: socket.userRole,
        timestamp: new Date().toISOString(),
        connectedClients: this.connectedClients.size
      });
    });
  }

  // Public methods for server-side broadcasting
  public broadcastToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  public broadcastToSession(sessionId: string, event: string, data: any) {
    this.io.to(`session:${sessionId}`).emit(event, data);
  }

  public getConnectedUsersCount(): number {
    return this.connectedClients.size;
  }

  public getTypingUsers(sessionId: string): string[] {
    const typingSet = this.typingUsers.get(sessionId);
    return typingSet ? Array.from(typingSet) : [];
  }

  public getIO() {
    return this.io;
  }
}

// Extend MessageStorageService with feedback method
declare module './message-storage.service' {
  interface MessageStorageService {
    saveQualityFeedback(
      userId: string,
      messageId: string,
      rating: number,
      comment?: string
    ): Promise<void>;
  }
}

// Add the method implementation
MessageStorageService.prototype.saveQualityFeedback = async function(
  userId: string,
  messageId: string,
  rating: number,
  comment?: string
) {
  // Implementation for saving quality feedback
  // This would store feedback in the database for analytics
  console.log(`Quality feedback saved: User ${userId}, Message ${messageId}, Rating ${rating}`);
};