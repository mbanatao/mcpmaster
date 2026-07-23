import { executeGitHubTool, githubTools } from '../tools/github.js';

export interface RuntimeToolDefinition {
  handler: 'github';
  description: string;
  inputSchema: Record<string, unknown>;
}

export const toolRegistry: Record<string, RuntimeToolDefinition> = Object.fromEntries(
  Object.entries(githubTools).map(([name, definition]) => [
    name,
    {
      handler: 'github' as const,
      description: definition.description,
      inputSchema: definition.parameters as Record<string, unknown>,
    },
  ]),
);

export function getAllTools(): string[] {
  return Object.keys(toolRegistry);
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  configuration: Record<string, unknown>,
): Promise<unknown> {
  const definition = toolRegistry[toolName];
  if (!definition) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const githubConfiguration = configuration.github;
  if (!githubConfiguration || typeof githubConfiguration !== 'object') {
    throw new Error('GitHub configuration is missing');
  }

  return executeGitHubTool(toolName, args, githubConfiguration);
}
