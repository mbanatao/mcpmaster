// Production tool registry for the GitHub-first MCPMaster MVP.
//
// Legacy adapters remain in this directory, but they are deliberately not
// exported from the production registry until they have contract tests,
// credential validation, and an explicit risk classification.

export { GitHubMCPServer, executeGitHubTool, githubTools } from './github';
export { executeTool, getAllTools, toolRegistry } from '../runtime/tool-catalog';
