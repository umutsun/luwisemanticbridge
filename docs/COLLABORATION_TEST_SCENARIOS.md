# Multi-Agent Collaboration Test Scenarios

## 🎯 Test Scenario 1: Simple Coordination

### Step 1 - Claude (in Claude Code):
```
Hi, I'm starting my work as CTO. Let me check our project status and team.

/mcp call asb-cli project_status
/mcp call asb-cli list_agents
/mcp call asb-cli share_context key="claude:online" value={"status": "ready", "role": "CTO"}

Now I'll review the architecture and create tasks for the team.
```

### Step 2 - Gemini (in Gemini CLI):
```
Hello, I'm the Senior Developer. Let me check what Claude needs.

/mcp call asb-cli get_context key="claude:online"
/mcp call asb-cli share_context key="gemini:online" value={"status": "ready", "role": "Developer"}
/mcp call asb-cli broadcast_message message="Gemini online and ready for tasks"

Claude, what should I work on first?
```

### Step 3 - Claude responds:
```
Great! Gemini is online. Let me create some tasks.

/mcp call asb-cli create_task type="implementation" description="Build user authentication module" priority="high"
/mcp call asb-cli share_context key="architecture:auth" value={"type": "JWT", "provider": "local", "requirements": ["login", "register", "refresh"]}

Gemini, I've shared the auth architecture. Please implement according to the specs.
```

## 🎯 Test Scenario 2: Code Review Workflow

### Gemini completes feature:
```
I've completed the authentication module. Requesting review.

/mcp call asb-cli share_context key="feature:auth:complete" value={"files": ["auth.js", "auth.test.js"], "coverage": "95%", "status": "ready-for-review"}
/mcp call asb-cli create_task type="code-review" description="Review authentication module" priority="high"
/mcp call asb-cli broadcast_message message="Auth module ready for review - 95% test coverage"
```

### Claude reviews:
```
Let me review the authentication module.

/mcp call asb-cli get_context key="feature:auth:complete"

[Reviews code...]

/mcp call asb-cli share_context key="review:auth:result" value={"status": "approved", "suggestions": ["Add rate limiting", "Implement refresh token rotation"], "score": "8/10"}
/mcp call asb-cli broadcast_message message="Auth module approved with minor suggestions"

Good work Gemini! Please add rate limiting before deployment.
```

### Gemini deploys:
```
Thanks for the review! Adding rate limiting now.

/mcp call asb-cli share_context key="feature:auth:updated" value={"added": "rate-limiting", "status": "deploying"}
/mcp call asb-cli share_context key="deployment:auth" value={"target": "staging", "version": "1.0.0", "timestamp": "2025-01-27T10:00:00Z"}
/mcp call asb-cli broadcast_message message="Auth module deployed to staging with rate limiting"
```

## 🎯 Test Scenario 3: Full Feature Development

### PM Request (via Claude):
```
We need a real-time dashboard showing agent activities. Let me design the architecture.

/mcp call asb-cli share_context key="feature:dashboard:requirements" value={
  "type": "real-time",
  "components": ["agent-status", "task-queue", "metrics", "logs"],
  "tech": ["websocket", "react", "chart.js"],
  "priority": "high"
}

/mcp call asb-cli create_task type="implementation" description="Build real-time dashboard frontend" priority="high"
/mcp call asb-cli create_task type="implementation" description="Build websocket backend for dashboard" priority="high"

Gemini, please pick up these dashboard tasks. Frontend first, then backend.
```

### Gemini implements:
```
Starting dashboard implementation.

/mcp call asb-cli get_context key="feature:dashboard:requirements"
/mcp call asb-cli share_context key="task:dashboard:status" value={"frontend": "in-progress", "eta": "2 hours"}

[After some time...]

/mcp call asb-cli share_context key="feature:dashboard:frontend" value={"status": "complete", "components": 4, "tests": 12}
/mcp call asb-cli broadcast_message message="Dashboard frontend complete, starting backend"

[After backend...]

/mcp call asb-cli share_context key="feature:dashboard:complete" value={"frontend": "done", "backend": "done", "status": "ready-for-review"}
/mcp call asb-cli create_task type="code-review" description="Review complete dashboard implementation" priority="high"
```

## 🎯 Test Scenario 4: Problem Solving Together

### Gemini encounters issue:
```
I'm having performance issues with the semantic search.

/mcp call asb-cli share_context key="issue:performance" value={
  "component": "semantic-search",
  "problem": "Query takes 5+ seconds",
  "tried": ["indexing", "caching"],
  "need_help": true
}

/mcp call asb-cli broadcast_message message="Need help: Semantic search performance issue"

Claude, any architectural suggestions?
```

### Claude assists:
```
Let me analyze the performance issue.

/mcp call asb-cli get_context key="issue:performance"

I see the problem. Here's my suggestion:

/mcp call asb-cli share_context key="solution:performance" value={
  "approach": "vector-index-optimization",
  "steps": [
    "Use HNSW algorithm for indexing",
    "Implement query result caching",
    "Add connection pooling for pgvector"
  ],
  "expected_improvement": "10x faster"
}

/mcp call asb-cli create_task type="optimization" description="Optimize semantic search with HNSW" priority="high"

Try implementing HNSW indexing first, that should give the biggest boost.
```

## 🎯 Test Scenario 5: Monitoring & Metrics

### Periodic status updates:
```
# Claude
/mcp call asb-cli share_context key="metrics:architecture" value={"decisions": 5, "reviews": 12, "approvals": 10}

# Gemini
/mcp call asb-cli share_context key="metrics:development" value={"features": 8, "bugs_fixed": 15, "tests": 120}

# All agents
/mcp call asb-cli get_context key="metrics:*"
```

## 📝 Expected Outcomes

After running these scenarios, you should see:
1. ✅ Agents communicating via shared context
2. ✅ Tasks being created and assigned
3. ✅ Code reviews happening
4. ✅ Deployment coordination
5. ✅ Problem-solving collaboration

## 🔍 Monitoring Commands

To monitor agent collaboration:
```bash
# Check all agents
/mcp call asb-cli list_agents

# View active tasks
/mcp call asb-cli get_context key="active-tasks"

# Check specific feature status
/mcp call asb-cli get_context key="feature:*"

# View all shared contexts
/mcp call asb-cli project_status
```

---
**Start with Scenario 1 and work your way through!** 🚀
