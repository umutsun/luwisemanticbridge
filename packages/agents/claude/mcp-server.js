#!/usr/bin/env node

// Claude Code MCP Server
// Provides MCP tools for Claude Code integration with ASB

const ASBSharedMemory = require('../shared/asb-memory');
const fs = require('fs').promises;
const path = require('path');

class ClaudeCodeMCPServer {
  constructor() {
    this.projectRoot = process.env.PROJECT_ROOT || 'C:/xampp/htdocs/alice-semantic-bridge';
    this.agentName = process.env.AGENT_NAME || 'claude-code';
    this.memory = null;
    
    // z.ai (GLM-4.5) configuration
    this.zaiConfig = {
      apiKey: process.env.ZAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://open.bigmodel.cn/api/anthropic',
      model: 'glm-4.5'
    };
  }

  async initialize() {
    // Initialize shared memory connection
    this.memory = new ASBSharedMemory(process.env.PROJECT_KEY || 'alice-semantic-bridge');
    
    try {
      await this.memory.connect();
      await this.memory.registerAgent(this.agentName, [
        'code-editing',
        'file-management',
        'mcp-integration',
        'vscode-automation'
      ]);
      
      console.error(`[MCP] ${this.agentName} connected to shared memory`);
    } catch (error) {
      console.error('[MCP] Failed to connect to shared memory:', error);
    }
  }

  async handleRequest(request) {
    const { method, params, id } = request;
    
    try {
      let result;
      
      switch (method) {
        case 'initialize':
          await this.initialize();
          result = {
            capabilities: {
              tools: [
                'project_status',
                'share_context',
                'get_context',
                'list_agents',
                'queue_task',
                'get_tasks',
                'zai_generate',
                'zai_review',
                'zai_chat'
              ]
            }
          };
          break;
          
        case 'tools/list':
          result = {
            tools: [
              {
                name: 'project_status',
                description: 'Get current project status from shared memory',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                name: 'share_context',
                description: 'Share context with other agents',
                inputSchema: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    value: { type: 'object' }
                  },
                  required: ['key', 'value']
                }
              },
              {
                name: 'get_context',
                description: 'Get shared context from other agents',
                inputSchema: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' }
                  },
                  required: ['key']
                }
              },
              {
                name: 'list_agents',
                description: 'List all active agents',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                name: 'queue_task',
                description: 'Queue a task for processing',
                inputSchema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    data: { type: 'object' }
                  },
                  required: ['type', 'data']
                }
              },
              {
                name: 'get_tasks',
                description: 'Get pending tasks',
                inputSchema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' }
                  }
                }
              }
            ]
          };
          break;
          
        case 'tools/call':
          const { name, arguments: args } = params;
          
          switch (name) {
            case 'project_status':
              if (!this.memory) await this.initialize();
              const stats = await this.memory.getStats();
              const project = await this.memory.getContext('project');
              result = { stats, project };
              break;
              
            case 'share_context':
              if (!this.memory) await this.initialize();
              await this.memory.setContext(args.key, args.value);
              result = { success: true, key: args.key };
              break;
              
            case 'get_context':
              if (!this.memory) await this.initialize();
              const context = await this.memory.getContext(args.key);
              result = { key: args.key, value: context };
              break;
              
            case 'list_agents':
              if (!this.memory) await this.initialize();
              const agents = await this.memory.getAgents();
              result = { agents };
              break;
              
            case 'queue_task':
              if (!this.memory) await this.initialize();
              const task = await this.memory.queueTask(args.type, args.data);
              result = { task };
              break;
              
            case 'get_tasks':
              if (!this.memory) await this.initialize();
              const taskType = args.type || 'code-review';
              const pendingTask = await this.memory.getNextTask(taskType);
              result = { task: pendingTask };
              break;
              
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
          break;
          
        default:
          throw new Error(`Unknown method: ${method}`);
      }
      
      return {
        jsonrpc: '2.0',
        result,
        id
      };
      
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message
        },
        id
      };
    }
  }

  async start() {
    console.error('[MCP] Claude Code MCP Server starting...');
    
    // Read from stdin
    let buffer = '';
    
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      
      // Try to parse complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            const response = await this.handleRequest(request);
            process.stdout.write(JSON.stringify(response) + '\n');
          } catch (error) {
            console.error('[MCP] Parse error:', error);
          }
        }
      }
    });
    
    process.stdin.on('end', () => {
      console.error('[MCP] Server shutting down');
      if (this.memory) {
        this.memory.disconnect();
      }
      process.exit(0);
    });
    
    // Handle errors
    process.on('uncaughtException', (error) => {
      console.error('[MCP] Uncaught exception:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[MCP] Unhandled rejection at:', promise, 'reason:', reason);
    });
  }
}

// Start server
const server = new ClaudeCodeMCPServer();
server.start();
