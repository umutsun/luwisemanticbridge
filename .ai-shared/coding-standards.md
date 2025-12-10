# Coding Standards
## LSEMB Project - All AIs Must Follow

**Last Updated:** 2025-12-10
**Applies To:** Claude Code, Gemini, Zai

---

## 🎯 General Principles

### Code Quality
- **Readability over cleverness** - Code is read more than written
- **Consistency** - Follow existing patterns in the codebase
- **Simplicity** - Don't over-engineer solutions
- **Documentation** - Comment complex logic, not obvious code

### Performance
- **Optimize when needed** - Don't premature optimize
- **Measure before optimizing** - Use profiling tools
- **Consider scale** - Think about 10x, 100x growth

### Security
- **Validate all inputs** - Never trust user data
- **Sanitize outputs** - Prevent XSS, SQL injection
- **Use secure defaults** - Fail closed, not open
- **Audit dependencies** - Keep packages updated

---

## 📝 TypeScript Standards

### Type Safety
```typescript
// ✅ Good - Explicit types
function createUser(data: CreateUserRequest): Promise<User> {
  // ...
}

// ❌ Bad - Implicit any
function createUser(data) {
  // ...
}
```

### Interfaces vs Types
```typescript
// ✅ Good - Use interfaces for objects
interface User {
  id: string;
  name: string;
  email: string;
}

// ✅ Good - Use types for unions/intersections
type Status = 'active' | 'inactive' | 'pending';
type UserWithStatus = User & { status: Status };

// ❌ Bad - Type for simple object
type User = {
  id: string;
  name: string;
};
```

### Async/Await
```typescript
// ✅ Good - Async/await with error handling
async function fetchUser(id: string): Promise<User> {
  try {
    const response = await api.get(`/users/${id}`);
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch user', { id, error });
    throw new UserNotFoundError(id);
  }
}

// ❌ Bad - Promises without proper error handling
function fetchUser(id: string) {
  return api.get(`/users/${id}`).then(r => r.data);
}
```

### Naming Conventions
```typescript
// ✅ Good naming
const isUserActive = true;           // Boolean: is/has/can prefix
const userCount = 42;                // Number: descriptive
const getUserById = (id: string) => {}; // Function: verb prefix
const MAX_RETRIES = 3;               // Constant: UPPER_SNAKE_CASE

// ❌ Bad naming
const flag = true;
const num = 42;
const func = () => {};
const max = 3;
```

---

## ⚛️ React/Frontend Standards

### Component Structure
```typescript
// ✅ Good - Functional component with proper types
import { FC, useState, useEffect } from 'react';

interface UserListProps {
  userId: string;
  onSelect?: (user: User) => void;
}

export const UserList: FC<UserListProps> = ({ userId, onSelect }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, [userId]);

  const loadUsers = async () => {
    try {
      const data = await userService.fetchAll();
      setUsers(data);
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-list">
      {/* JSX */}
    </div>
  );
};

// ❌ Bad - Class component, no types
export default class UserList extends React.Component {
  // ...
}
```

### Hooks Usage
```typescript
// ✅ Good - Custom hooks for reusable logic
function useUsers(filters: UserFilters) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers(filters);
  }, [filters]);

  return { users, loading };
}

// Usage
const { users, loading } = useUsers({ active: true });
```

### State Management
```typescript
// ✅ Good - Zustand for global state
import { create } from 'zustand';

interface UserStore {
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  logout: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  logout: () => set({ currentUser: null }),
}));

// ❌ Bad - Prop drilling
// Passing user through 5 levels of components
```

### Styling
```typescript
// ✅ Good - Tailwind CSS classes
<div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
  <h2 className="text-xl font-bold text-gray-800">Title</h2>
  <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    Click
  </button>
</div>

// ❌ Bad - Inline styles
<div style={{ display: 'flex', padding: '16px' }}>
  // ...
</div>
```

---

## 🔧 Backend/Node.js Standards

### Service Pattern
```typescript
// ✅ Good - Service class with dependency injection
export class UserService {
  constructor(
    private db: Database,
    private cache: CacheService
  ) {}

  async create(data: CreateUserRequest): Promise<User> {
    // Validate
    this.validateCreateRequest(data);

    // Create
    const user = await this.db('users').insert(data).returning('*');

    // Cache
    await this.cache.set(`user:${user.id}`, user);

    return user;
  }

  private validateCreateRequest(data: CreateUserRequest): void {
    if (!data.email) throw new ValidationError('Email required');
    // ... more validation
  }
}

// ❌ Bad - Functions without organization
export async function createUser(data) {
  const user = await knex('users').insert(data);
  return user;
}
```

### Error Handling
```typescript
// ✅ Good - Custom error classes
export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

// Usage
if (!user) {
  throw new UserNotFoundError(userId);
}

// ✅ Good - Error middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof UserNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  // ... handle other errors
});

// ❌ Bad - Generic errors
throw new Error('Something went wrong');
```

### Database Queries
```typescript
// ✅ Good - Knex query builder with types
async function getUserWithPosts(userId: string): Promise<UserWithPosts> {
  const user = await db('users')
    .where({ id: userId })
    .first();

  if (!user) throw new UserNotFoundError(userId);

  const posts = await db('posts')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .limit(10);

  return { ...user, posts };
}

// ❌ Bad - Raw SQL strings
const user = await db.raw(`SELECT * FROM users WHERE id = '${userId}'`);
// SQL injection vulnerability!
```

---

## 🐍 Python Standards

### Type Hints
```python
# ✅ Good - Type hints everywhere
from typing import List, Optional, Dict

def get_user(user_id: str) -> Optional[User]:
    """Fetch user by ID."""
    try:
        return db.query(User).filter_by(id=user_id).first()
    except Exception as e:
        logger.error(f"Failed to fetch user {user_id}", exc_info=e)
        return None

# ❌ Bad - No type hints
def get_user(user_id):
    return db.query(User).filter_by(id=user_id).first()
```

### FastAPI Routes
```python
# ✅ Good - Pydantic models, proper responses
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

class CreateUserRequest(BaseModel):
    name: str
    email: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str

router = APIRouter()

@router.post("/users", response_model=UserResponse)
async def create_user(data: CreateUserRequest) -> UserResponse:
    """Create a new user."""
    try:
        user = await user_service.create(data)
        return UserResponse(**user.dict())
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ❌ Bad - No models, no error handling
@router.post("/users")
def create_user(data: dict):
    user = user_service.create(data)
    return user
```

---

## 🗄️ Database Standards

### Migrations
```typescript
// ✅ Good - Knex migration with rollback
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('email', 255).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['email']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}

// ❌ Bad - No rollback, no indexes
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id');
    table.string('name');
    table.string('email');
  });
}
```

### Query Optimization
```typescript
// ✅ Good - Use indexes, limit results
const users = await db('users')
  .select('id', 'name', 'email')  // Only needed columns
  .where('active', true)          // Indexed column
  .orderBy('created_at', 'desc')
  .limit(50);                     // Limit results

// ❌ Bad - Select all, no limit
const users = await db('users').select('*');
```

---

## 🧪 Testing Standards

### Unit Tests
```typescript
// ✅ Good - Descriptive test names, proper setup/teardown
describe('UserService', () => {
  let userService: UserService;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    mockDb = createMockDatabase();
    userService = new UserService(mockDb);
  });

  describe('create', () => {
    it('should create user with valid data', async () => {
      const data = { name: 'John', email: 'john@example.com' };
      const user = await userService.create(data);

      expect(user).toMatchObject(data);
      expect(mockDb.insert).toHaveBeenCalledWith(data);
    });

    it('should throw ValidationError for invalid email', async () => {
      const data = { name: 'John', email: 'invalid' };

      await expect(userService.create(data))
        .rejects
        .toThrow(ValidationError);
    });
  });
});

// ❌ Bad - Vague test names, no setup
it('works', async () => {
  const user = await userService.create({});
  expect(user).toBeTruthy();
});
```

---

## 📦 Project Structure

### File Organization
```
backend/src/
├── routes/          # API routes
│   └── api/v2/
│       └── users.routes.ts
├── services/        # Business logic
│   └── user.service.ts
├── types/           # TypeScript types
│   └── user.types.ts
├── config/          # Configuration
│   └── database.ts
└── __tests__/       # Tests
    └── user.service.test.ts
```

### Naming Conventions
- **Files:** `kebab-case.ts` (user-service.ts)
- **Classes:** `PascalCase` (UserService)
- **Functions:** `camelCase` (getUserById)
- **Constants:** `UPPER_SNAKE_CASE` (MAX_RETRIES)
- **Types/Interfaces:** `PascalCase` (User, UserResponse)

---

## 🔐 Security Checklist

- [ ] Validate all user inputs
- [ ] Sanitize outputs (prevent XSS)
- [ ] Use parameterized queries (prevent SQL injection)
- [ ] Hash passwords (bcrypt)
- [ ] Use HTTPS everywhere
- [ ] Implement rate limiting
- [ ] Add CSRF protection
- [ ] Secure session management
- [ ] Keep dependencies updated
- [ ] Don't commit secrets

---

## 📊 Performance Guidelines

### Frontend
- [ ] Lazy load routes
- [ ] Code split large components
- [ ] Optimize images
- [ ] Use React.memo for expensive components
- [ ] Debounce user inputs
- [ ] Virtualize long lists

### Backend
- [ ] Use database indexes
- [ ] Implement caching (Redis)
- [ ] Paginate large results
- [ ] Use connection pooling
- [ ] Optimize N+1 queries
- [ ] Monitor slow queries

---

## ✅ Code Review Checklist

Before submitting code, verify:

- [ ] All tests pass
- [ ] No console.log statements
- [ ] No commented-out code
- [ ] TypeScript types complete
- [ ] Error handling implemented
- [ ] Security vulnerabilities checked
- [ ] Performance considered
- [ ] Documentation updated
- [ ] Follows project conventions

---

*These standards ensure code quality and consistency across all AI assistants.*
