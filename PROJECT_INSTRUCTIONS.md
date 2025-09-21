# 🚀 Alice Semantic Bridge - Project Instructions

## 📁 Project Structure
```
alice-semantic-bridge/
├── app/                    # Next.js 14 App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Main dashboard
│   ├── api/               # API routes
│   │   ├── search/        # RAG search endpoints
│   │   ├── embed/         # Embedding endpoints
│   │   └── lightrag/      # LightRAG endpoints
│   └── (tabs)/            # Tab pages
│       ├── rag-query/
│       ├── knowledge-graph/
│       ├── entities/
│       └── monitoring/
├── components/            # React components
│   ├── rag/              # RAG interface components
│   ├── graph/            # Knowledge graph visualization
│   ├── entities/         # Entity management
│   └── monitoring/       # System monitoring
├── lib/                  # Utilities
│   ├── api-client.ts     # API client
│   ├── websocket.ts      # WebSocket manager
│   └── db.ts             # Database connections
├── public/               # Static assets
├── styles/               # Global styles
└── n8n-nodes/           # Custom n8n nodes
```

## 🛠️ Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Visualization:** React Flow, D3.js, Three.js
- **State:** Zustand, TanStack Query
- **Backend:** Node.js, Express API routes
- **Database:** PostgreSQL + pgvector, Redis
- **AI/ML:** OpenAI embeddings, LightRAG
- **Integration:** n8n workflows

## 👥 Agent Responsibilities

### 🤖 Claude Code - RAG & Backend Integration
**Primary Focus:** RAG system, API development, chatbot logic

**Tasks:**
1. API endpoints in `app/api/`
2. RAG query optimization
3. WebSocket real-time updates
4. Database integration
5. Embedding pipeline

**Files to manage:**
- `app/api/**/*`
- `lib/api-client.ts`
- `lib/websocket.ts`
- `components/rag/*`

### 🎨 Codex - UI/UX & Visualization
**Primary Focus:** Visual components, user experience, animations

**Tasks:**
1. Knowledge graph visualization (React Flow/Three.js)
2. Entity cards and relationships
3. Dashboard polish and animations
4. Responsive design
5. Interactive components

**Files to manage:**
- `components/graph/*`
- `components/entities/*`
- `app/(tabs)/**/page.tsx`
- `styles/*`

### 🔧 Gemini - Backend & LightRAG
**Primary Focus:** Backend services, LightRAG integration, testing

**Tasks:**
1. LightRAG knowledge graph setup
2. Backend API implementation
3. Database optimization
4. Test suite (>80% coverage)
5. Performance optimization

**Files to manage:**
- `app/api/lightrag/*`
- `lib/db.ts`
- `tests/**/*`
- `jest.config.ts`

## 📜 Development Principles
- **Database Migration (Target):** The database to be migrated cannot have any hardcoded values. All configuration must be dynamic.
- **Database Migration (Source):** The source database configuration must also be free of any hardcoded values.

## 📡 ASB CLI Coordination Protocol

### 1️⃣ Starting a Task
```bash
# Get your tasks
asb-cli redis get --key [agent-name]-tasks

# Update status to "working"
asb-cli context_push --key [agent-name]-progress --value '{"status":"working","task":"Task name","timestamp":"ISO_DATE"}'
```

### 2️⃣ During Development
```bash
# Share important updates
asb-cli context_push --key asb:shared:[topic] --value '{"data":"..."}'

# Check other agents' progress
asb-cli redis get --key [other-agent]-progress

# Notify others of blockers
asb-cli redis publish --channel asb:[agent]:notifications --value "Blocked by X, need Y"
```

### 3️⃣ Completing a Task
```bash
# Update progress with completion
asb-cli context_push --key [agent-name]-progress --value '{
  "status": "completed",
  "task": "Task name",
  "timestamp": "ISO_DATE",
  "files_created": ["file1.tsx", "file2.ts"],
  "next_task": "Next task name"
}'

# Update master status
asb-cli redis get --key asb:master:status
# (Modify your section)
asb-cli redis set --key asb:master:status --value '{updated_json}'
```

### 4️⃣ Request Help/Coordination
```bash
# Request help from specific agent
asb-cli redis publish --channel asb:[target-agent]:notifications --value "Need help with X"

# Broadcast to all agents
asb-cli redis publish --channel asb:broadcast --value "Important update: ..."
```

## 🔑 Important Redis Keys

### Task Management
- `asb:master:tasks` - Overall task list
- `[agent]-tasks` - Individual agent tasks
- `[agent]-progress` - Current progress
- `[agent]-completed` - Completed tasks

### Coordination
- `asb:shared:*` - Shared data between agents
- `asb:blockers` - Current blockers
- `asb:dependencies` - Task dependencies

### Communication Channels
- `asb:[agent]:notifications` - Direct messages
- `asb:broadcast` - Broadcast to all
- `asb:frontend:sync` - Frontend updates
- `asb:backend:events` - Backend events

## 📝 Status Update Format
```json
{
  "agent": "agent-name",
  "timestamp": "2025-08-30T12:00:00Z",
  "status": "working|completed|blocked",
  "current_task": {
    "name": "Task name",
    "progress": 75,
    "blockers": []
  },
  "completed_tasks": [
    {
      "name": "Task name",
      "files": ["file1.tsx", "file2.ts"],
      "timestamp": "2025-08-30T11:00:00Z"
    }
  ],
  "next_tasks": ["Task 1", "Task 2"],
  "needs_from_others": {
    "agent-name": "What you need"
  }
}
```

## 🚦 Development Workflow

### Phase 1: Setup (Current)
1. ✅ Project structure
2. ✅ Basic components
3. 🔄 API endpoints
4. 🔄 Database connections

### Phase 2: Integration
1. Connect all API endpoints
2. WebSocket real-time updates
3. LightRAG knowledge graph
4. Testing setup

### Phase 3: Enhancement
1. 3D graph visualization
2. Advanced RAG features
3. Performance optimization
4. Production deployment

## 🎯 Success Criteria
- [ ] All tabs functional with real data
- [ ] API response time <100ms
- [ ] Test coverage >80%
- [ ] Real-time updates working
- [ ] LightRAG fully integrated
- [ ] Production ready

## 🚨 Common Issues & Solutions

### Issue: Component not showing
```bash
# Check if component is in correct location
ls -la components/[component-name]/

# Restart Next.js
npm run dev
```

### Issue: API not responding
```bash
# Check API route exists
ls -la app/api/[endpoint]/

# Check error logs
asb-cli redis get --key asb:errors
```

### Issue: Database connection failed
```bash
# Use Node.js pg library directly (not psql)
# Connection details in .env
```

## 📞 Emergency Contacts
- **All agents:** `asb-cli redis publish --channel asb:broadcast --value "HELP: ..."`
- **Specific agent:** `asb-cli redis publish --channel asb:[agent]:notifications --value "..."`
- **Check status:** `asb-cli redis get --key asb:master:status`

## 🎉 On Task Completion
1. Update your progress in Redis
2. Notify relevant agents
3. Update master status
4. Move to next task
5. Celebrate! 🎊

---
*Last Updated: 2025-08-30*
*Use ASB CLI for all coordination*
*No more .md files needed - everything in Redis!*
