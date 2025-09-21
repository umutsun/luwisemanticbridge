# 🏗️ Alice Semantic Bridge - Project Structure

## 📂 Current Setup
```
alice-semantic-bridge/
├── dashboard/              # ← MAIN NEXT.JS PROJECT (port 3001/3002)
│   ├── pages/             # Pages directory (Next.js Pages Router)
│   │   └── index.jsx      # Main dashboard page
│   ├── components/        # React components
│   │   ├── rag/          # RAG components
│   │   ├── monitoring/   # Monitoring components
│   │   └── lightrag/     # LightRAG components
│   ├── lib/              # Utilities
│   ├── package.json      # Dependencies
│   └── next.config.js    # Next.js config
│
├── n8n-nodes/            # n8n custom nodes
├── src/                  # n8n source files
├── deploy/               # Deployment files
└── PROJECT_INSTRUCTIONS.md
```

## ❌ PROBLEM: Duplicate/Confusion
- **dashboard/** is the actual Next.js project
- Root level has n8n node files
- No need for separate frontend - dashboard IS the frontend!

## ✅ SOLUTION: Use dashboard as main project

### For Agents:
```bash
# Always work in dashboard folder
cd dashboard

# Install dependencies
npm install

# Run development server
npm run dev

# Components go here
dashboard/components/[feature]/

# API routes (if using App Router)
dashboard/app/api/

# Or API routes (if using Pages Router)
dashboard/pages/api/
```

## 🎯 Agent Task Updates

### Claude Code
- Work in `dashboard/lib/` for API client
- Work in `dashboard/components/rag/` for RAG UI
- Create API routes in `dashboard/pages/api/`

### Codex
- Work in `dashboard/components/graph/` for visualization
- Work in `dashboard/components/entities/` for entity UI
- Style files in `dashboard/styles/`

### Gemini
- Create backend APIs in `dashboard/pages/api/lightrag/`
- Tests in `dashboard/__tests__/`
- Database utils in `dashboard/lib/db.ts`

## 🚀 Commands
```bash
# Navigate to project
cd C:\xampp\htdocs\alice-semantic-bridge\dashboard

# Install/Update
npm install
npm update

# Development
npm run dev    # Runs on http://localhost:3001 or 3002

# Build
npm run build

# Test
npm test
```

## 📝 Important Notes
1. **dashboard/** folder is the main Next.js project
2. All frontend work happens in dashboard/
3. n8n nodes stay in root level folders
4. No need to create new Next.js project
5. Port 3001/3002 already shows the dashboard

## 🔄 Redis Updates Needed
```bash
# Update project structure info
asb-cli redis set --key asb:project:structure --value '{"main":"dashboard/","type":"next.js","port":3001}'

# Notify agents
asb-cli redis publish --channel asb:broadcast --value "Work in dashboard/ folder! That's our Next.js project!"
```
