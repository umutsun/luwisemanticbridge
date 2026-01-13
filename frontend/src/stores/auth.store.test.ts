
import { act } from '@testing-library/react';
import useAuthStore from './auth.store';
import apiClient from '@/lib/api/client';

// Mock API client
jest.mock('@/lib/api/client', () => ({
    __esModule: true,
    default: {
        post: jest.fn(),
        get: jest.fn(),
        setToken: jest.fn(),
        clearToken: jest.fn(),
    },
}));

describe('AuthStore', () => {
    const initialState = useAuthStore.getState();

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset store
        act(() => {
            useAuthStore.setState({
                user: null,
                token: null,
                refreshToken: null,
                isAuthenticated: false,
                accessToken: null,
                isLoading: false,
                error: null,
            });
        });
    });

    it('should have initial state', () => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
    });

    it('login success updates state', async () => {
        const mockUser = { id: '1', email: 'test@example.com', name: 'Test User' };
        const mockToken = 'access-token-123';

        (apiClient.post as jest.Mock).mockResolvedValueOnce({
            data: {
                user: mockUser,
                accessToken: mockToken,
            },
        });

        await act(async () => {
            await useAuthStore.getState().login({ email: 'test@example.com', password: 'password' });
        });

        const state = useAuthStore.getState();
        expect(state.user).toEqual(mockUser);
        expect(state.token).toBe(mockToken);
        expect(state.isAuthenticated).toBe(true);
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();
        expect(apiClient.setToken).toHaveBeenCalledWith(mockToken);
    });

    it('login failure updates error state', async () => {
        const errorMessage = 'Invalid credentials';
        (apiClient.post as jest.Mock).mockRejectedValueOnce({
            message: errorMessage,
        });

        await expect(
            useAuthStore.getState().login({ email: 'test@example.com', password: 'wrong' })
        ).rejects.toEqual({ message: errorMessage });

        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.error).toBe(errorMessage);
        expect(state.isLoading).toBe(false);
    });

    it('logout clears state', () => {
        // Set logged in state first
        act(() => {
            useAuthStore.setState({
                user: { id: '1' } as any,
                token: 'token',
                isAuthenticated: true
            });
        });

        (apiClient.post as jest.Mock).mockResolvedValueOnce({}); // Logout api call

        act(() => {
            useAuthStore.getState().logout();
        });

        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(apiClient.clearToken).toHaveBeenCalled();
    });
});
