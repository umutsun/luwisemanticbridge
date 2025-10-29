#!/usr/bin/env node

/**
 * Direct MCP Server Test Script
 * Tests the LSB PostgreSQL Bridge MCP server without Claude
 */

const { spawn } = require("child_process");
const readline = require("readline");

let messageId = 1;
const testMessages = [
  {
    id: messageId++,
    method: "initialize",
    params: {},
    name: "Initialize Server",
  },
  {
    id: messageId++,
    method: "tools/list",
    params: {},
    name: "List Available Tools",
  },
  {
    id: messageId++,
    method: "tools/call",
    params: {
      name: "postgres_tables",
      arguments: {},
    },
    name: "Get Database Tables",
  },
  {
    id: messageId++,
    method: "tools/call",
    params: {
      name: "postgres_schema",
      arguments: { table_name: "documents" },
    },
    name: "Get Documents Table Schema",
  },
  {
    id: messageId++,
    method: "tools/call",
    params: {
      name: "postgres_query",
      arguments: {
        query: "SELECT COUNT(*) as total_tables FROM information_schema.tables WHERE table_schema = 'public'",
      },
    },
    name: "Count Database Tables",
  },
];

class MCPTest {
  constructor() {
    this.server = null;
    this.currentTest = 0;
    this.responses = [];
  }

  start() {
    console.log("🚀 Starting LSB PostgreSQL Bridge MCP Test\n");
    console.log("📂 Server: c:\\mcp-servers\\luwi-shell-bridge\\lsb-postgres-bridge.mjs\n");

    this.server = spawn("node", [
      "c:\\mcp-servers\\luwi-shell-bridge\\lsb-postgres-bridge.mjs",
    ]);

    // Handle stdout (responses)
    this.rl = readline.createInterface({
      input: this.server.stdout,
    });

    this.rl.on("line", (line) => {
      this.handleResponse(line);
    });

    // Handle stderr (logging)
    this.server.stderr.on("data", (data) => {
      console.error(`[SERVER] ${data}`);
    });

    // Handle errors
    this.server.on("error", (error) => {
      console.error(`❌ Server error: ${error.message}`);
      process.exit(1);
    });

    // Send first test after a short delay
    setTimeout(() => this.sendNextTest(), 1000);
  }

  sendNextTest() {
    if (this.currentTest >= testMessages.length) {
      this.finish();
      return;
    }

    const test = testMessages[this.currentTest];
    console.log(`\n📋 Test ${this.currentTest + 1}/${testMessages.length}: ${test.name}`);
    console.log(`   Method: ${test.method}`);
    if (Object.keys(test.params).length > 0) {
      console.log(`   Params: ${JSON.stringify(test.params)}`);
    }
    console.log("   Sending...");

    const message = {
      jsonrpc: "2.0",
      id: test.id,
      method: test.method,
      params: test.params,
    };

    this.server.stdin.write(JSON.stringify(message) + "\n");
  }

  handleResponse(line) {
    try {
      const response = JSON.parse(line);

      if (response.id) {
        const test = testMessages.find((t) => t.id === response.id);
        if (test) {
          this.responses.push({ test: test.name, response });

          if (response.error) {
            console.log(`   ❌ Error: ${response.error.message}`);
          } else if (response.serverInfo) {
            console.log(`   ✅ Success: Server ${response.serverInfo.name} v${response.serverInfo.version}`);
          } else if (response.tools) {
            console.log(`   ✅ Success: Found ${response.tools.length} tools`);
            response.tools.forEach((tool) => {
              console.log(`      - ${tool.name}: ${tool.description}`);
            });
          } else if (response.content) {
            const content = response.content[0]?.text || "";
            try {
              const parsed = JSON.parse(content);
              if (parsed.success) {
                console.log(`   ✅ Success:`, parsed);
              } else {
                console.log(`   ⚠️ Warning:`, parsed);
              }
            } catch {
              console.log(`   ✅ Response: ${content.substring(0, 100)}...`);
            }
          }

          // Send next test after response
          this.currentTest++;
          setTimeout(() => this.sendNextTest(), 500);
        }
      }
    } catch (error) {
      console.error(`[PARSE ERROR] ${error.message}`);
    }
  }

  finish() {
    console.log("\n\n📊 Test Summary");
    console.log("================");
    this.responses.forEach((item, index) => {
      const status = item.response.error ? "❌" : "✅";
      console.log(`${index + 1}. ${status} ${item.test}`);
    });

    this.server.stdin.end();
    this.rl.close();
    setTimeout(() => process.exit(0), 500);
  }
}

const test = new MCPTest();
test.start();
