import { AuthService } from './auth.service';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

jest.mock('pg');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('AuthService', () => {
    let authService: AuthService;
    let mockQuery: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

        mockQuery = jest.fn();

        // Mock Pool implementation
        (Pool as unknown as jest.Mock).mockImplementation(() => ({
            query: mockQuery,
            connect: jest.fn(),
            on: jest.fn(),
            end: jest.fn(),
        }));

        authService = new AuthService();
    });

    describe('register', () => {
        const mockUserDto = {
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
            first_name: 'Test',
            last_name: 'User'
        };

        it('should successfully register a new user', async () => {
            // Mock user check - no existing user
            mockQuery.mockResolvedValueOnce({ rows: [] });

            // Mock bcrypt hash
            (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

            // Mock user insertion
            const mockDbUser = {
                id: '1',
                username: 'testuser',
                email: 'test@example.com',
                name: 'Test User',
                role: 'user',
                status: 'active',
                email_verified: false,
                created_at: new Date(),
                updated_at: new Date()
            };
            mockQuery.mockResolvedValueOnce({ rows: [mockDbUser] });

            // Mock session save
            mockQuery.mockResolvedValueOnce({ rows: [] });

            // Mock JWT
            (jwt.sign as jest.Mock)
                .mockReturnValueOnce('access_token')
                .mockReturnValueOnce('refresh_token');

            const result = await authService.register(mockUserDto);

            expect(mockQuery).toHaveBeenCalledTimes(3);
            expect(result.user.email).toBe(mockUserDto.email);
            expect(result.accessToken).toBe('access_token');
            expect(bcrypt.hash).toHaveBeenCalledWith(mockUserDto.password, 12);
        });

        it('should throw error if user already exists', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });

            await expect(authService.register(mockUserDto))
                .rejects
                .toThrow('User with this email or username already exists');
        });
    });

    describe('login', () => {
        const mockLoginDto = {
            email: 'test@example.com',
            password: 'password123'
        };

        it('should successfully login existing user', async () => {
            const mockDbUser = {
                id: '1',
                username: 'testuser',
                email: 'test@example.com',
                password_hash: 'hashed_password',
                name: 'Test User',
                role: 'user',
                status: 'active',
                email_verified: false,
                created_at: new Date(),
                updated_at: new Date()
            };

            // Mock user fetch
            mockQuery.mockResolvedValueOnce({ rows: [mockDbUser] });

            // Mock password check
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            // Mock session save
            mockQuery.mockResolvedValueOnce({ rows: [] });

            // Mock JWT
            (jwt.sign as jest.Mock)
                .mockReturnValueOnce('access_token')
                .mockReturnValueOnce('refresh_token');

            const result = await authService.login(mockLoginDto);

            expect(result.accessToken).toBeDefined();
            expect(bcrypt.compare).toHaveBeenCalledWith(mockLoginDto.password, 'hashed_password');
        });

        it('should throw error on invalid credentials', async () => {
            const mockDbUser = {
                id: '1',
                email: 'test@example.com',
                password_hash: 'hashed_password',
                status: 'active'
            };

            // Mock user fetch
            mockQuery.mockResolvedValueOnce({ rows: [mockDbUser] });

            // Mock password check failure
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(authService.login(mockLoginDto))
                .rejects
                .toThrow('Invalid credentials');
        });

        it('should throw error if user not active', async () => {
            const mockDbUser = {
                id: '1',
                email: 'test@example.com',
                password_hash: 'hashed_password',
                status: 'inactive' // deactivated
            };

            // Mock user fetch
            mockQuery.mockResolvedValueOnce({ rows: [mockDbUser] });

            await expect(authService.login(mockLoginDto))
                .rejects
                .toThrow('Account is deactivated');
        });
    });
});
