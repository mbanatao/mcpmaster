import { EnvironmentSecretResolver } from './secrets/environment-resolver';
import { loadMetaRemoteMcpConfig } from './remote-config';
import { createMetaRemoteRuntime } from './runtime/remote-runtime';

async function main(): Promise<void> {
  const config = loadMetaRemoteMcpConfig();
  if (!config.requireHttps && !['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
    throw new Error('HTTPS may only be disabled for a loopback development server');
  }

  const secretResolver = new EnvironmentSecretResolver();
  const runtime = await createMetaRemoteRuntime({ config, secretResolver });
  const server = runtime.app.listen(config.port, config.host, () => {
    console.log(`Meta Business MCP listening on ${config.host}:${config.port}`);
    console.log('Remote endpoint: /mcp; external writes: disabled');
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}; closing Meta Business MCP`);
    server.close((error) => {
      if (error) {
        console.error('Meta Business MCP shutdown failed');
        process.exitCode = 1;
      }
      process.exit();
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Meta Business MCP startup failed');
  process.exitCode = 1;
});
