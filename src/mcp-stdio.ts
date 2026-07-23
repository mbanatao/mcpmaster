import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { executeTool, toolRegistry } from './tools/index.js';
import { buildToolConfiguration, UnknownToolError } from './runtime/service-config.js';
import { classifyToolRisk } from './runtime/tool-policy.js';

const allowWrites = process.env.MCP_ALLOW_WRITES === 'true';

const server = new Server(
  { name: 'mcpmaster', version: '1.1.0-foundation' },
  { capabilities: { tools: {} } },
);

function availableTools(): Tool[] {
  return Object.entries(toolRegistry)
    .filter(([name]) => allowWrites || classifyToolRisk(name) === 'read')
    .map(([name, metadata]) => ({
      name,
      description: `${metadata.description} [risk: ${classifyToolRisk(name)}]`,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
    }));
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: availableTools() }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const entry = toolRegistry[name as keyof typeof toolRegistry];

  if (!entry) {
    return {
      isError: true,
      content: [{ type: 'text', text: new UnknownToolError(name).message }],
    };
  }

  const risk = classifyToolRisk(name);
  if (risk !== 'read' && !allowWrites) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Tool ${name} is ${risk} and is disabled in stdio mode. Set MCP_ALLOW_WRITES=true only in a trusted local environment.`,
      }],
    };
  }

  try {
    const result = await executeTool(name, args || {}, buildToolConfiguration(name));
    return {
      content: [{ type: 'text', text: JSON.stringify({ tool: name, risk, result }, null, 2) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof Error ? error.message : 'Unknown error' }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`MCPMaster stdio runtime ready (${allowWrites ? 'writes enabled' : 'read-only'})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
