import { getPool } from '../../shared/db';
import { INode } from 'n8n-workflow';

// Basit mock implementation
jest.mock('pg', () => {
  const mockPool = {
    connect: jest.fn(),
    on: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('Database Module - Simple Tests', () => {
  let mockNode: INode;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'test',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    } as unknown as INode;
  });

  test('getPool should return a pool instance', () => {
    const creds = {
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'testuser',
      password: 'testpass',
    };

    const pool = getPool(mockNode, creds);
    expect(pool).toBeDefined();
    expect(pool).toHaveProperty('connect');
    expect(pool).toHaveProperty('query');
  });

  test('getPool should reuse pool for same credentials', () => {
    const creds = {
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'testuser',
    };

    const pool1 = getPool(mockNode, creds);
    const pool2 = getPool(mockNode, creds);

    expect(pool1).toBe(pool2);
  });

  test('getPool should handle SSL configuration', () => {
    const creds = {
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'testuser',
      ssl: true,
    };

    const pool = getPool(mockNode, creds);
    expect(pool).toBeDefined();
  });
});