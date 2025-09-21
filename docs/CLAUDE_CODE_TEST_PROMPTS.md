# Claude Code MCP Test Prompts

## 🧪 Test Prompt 1: Project Status Check

```
Hi Claude! I need to understand the current state of our Alice Semantic Bridge project. Can you:

1. Check the project status using MCP
2. List all active agents in our system
3. Review the AGENT_ROLES_V2.md file to understand team responsibilities
4. Share your analysis of how we're doing as a team

Please use the asb-cli MCP tools to gather this information.
```

## 🔧 Test Prompt 2: Architecture Review Request

```
As our CTO, I need you to:

1. Use MCP to check if there are any pending code review tasks
2. Look at our shared/asb-memory.js module 
3. Share your architectural assessment with other agents via MCP
4. Create a task for Gemini to implement any improvements you suggest

Remember to use /mcp tools to coordinate with the team.
```

## 🚀 Test Prompt 3: Feature Planning

```
We need to add a new feature: "Real-time Agent Activity Dashboard"

Can you:
1. Design the architecture for this feature
2. Use MCP to share the design with other agents
3. Create implementation tasks for Gemini (UI + Backend)
4. Create deployment tasks for Codex
5. Check which agents are currently active to assign tasks

Please coordinate everything through the asb-cli MCP server.
```

## 💻 Test Prompt 4: Code Review Workflow

```
Claude, please demonstrate the full code review workflow:

1. First, check shared/asb-memory.js
2. Use MCP to create a code review task
3. Share your review findings via shared context
4. Create improvement tasks for Gemini if needed
5. Notify all agents about the review results using broadcast

Show me how you use MCP tools for team coordination.
```

## 📊 Test Prompt 5: System Health Check

```
Please perform a comprehensive system health check:

1. Use MCP to get project status
2. List all active agents and their capabilities
3. Check if Redis shared memory is working
4. Review our agent roles (AGENT_ROLES_V2.md)
5. Create a status report and share it with all agents

Use the MCP tools to gather all this information.
```

## 🎯 Expected MCP Commands

Claude should use these MCP commands:

```javascript
// Check project status
/mcp call asb-cli project_status

// List agents
/mcp call asb-cli list_agents

// Share context
/mcp call asb-cli share_context key="architecture-review" value={"status": "completed", "findings": [...]}

// Get context from other agents
/mcp call asb-cli get_context key="performance-metrics"

// Create tasks
/mcp call asb-cli create_task type="implementation" description="Build dashboard UI" priority="high"

// Broadcast to all agents
/mcp call asb-cli broadcast_message message="Architecture review completed, please check shared context"
```

## 🔍 What to Look For

When Claude responds, check if:

1. ✅ Uses `/mcp` commands correctly
2. ✅ Accesses asb-cli tools
3. ✅ Shares context with other agents
4. ✅ Creates tasks appropriately
5. ✅ Understands the agent roles
6. ✅ Coordinates as a CTO would

## 📝 Sample Interaction Flow

```
You: [Give one of the test prompts]

Claude: Let me check the project status using MCP tools...

/mcp call asb-cli project_status

Based on the results, I can see that...

Now let me list the active agents:

/mcp call asb-cli list_agents

I see we have [X] agents active...

Let me review the AGENT_ROLES_V2.md file:
[Reviews file]

Now I'll share my findings with the team:

/mcp call asb-cli share_context key="team-assessment" value={...}

And create tasks for the team:

/mcp call asb-cli create_task type="implementation" description="..." priority="high"
```

## 🎮 Advanced Test: Multi-Agent Coordination

```
Claude, we need to build a new API endpoint for semantic search. Please:

1. Design the API architecture
2. Share the design with Gemini for implementation  
3. Ask Gemini (via shared context) about estimated time
4. Create deployment task for Codex
5. Set up monitoring task for the endpoint
6. Broadcast the plan to all agents

Coordinate everything through MCP and show me the complete workflow.
```

## 💡 Tips for Testing

- Start with simple commands first
- Check if Claude recognizes its CTO role
- Verify MCP tool usage
- Test context sharing between agents
- Ensure task creation works
- Try the broadcast feature

## 🚨 Troubleshooting

If MCP commands don't work:
1. Check `/mcp` shows asb-cli
2. Verify Redis is running
3. Test with `/mcp tools`
4. Try `/mcp call asb-cli agent_status`

---
*Ready to test Claude Code's MCP integration!*
