import {
  EnvironmentSecretResolver,
} from './secrets/environment-resolver';
import {
  loadMetaStagingReadinessConfig,
  MetaStagingReadinessRunner,
} from './staging/readiness';

function allowedEnvironmentSecrets(environment: NodeJS.ProcessEnv): string[] {
  const reference = environment.META_STAGING_ACCESS_TOKEN_SECRET_REF?.trim() ?? '';
  const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(reference);
  return match ? [match[1]] : [];
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'validate';
  const config = loadMetaStagingReadinessConfig(process.env);

  if (command === 'validate') {
    process.stdout.write(`${JSON.stringify({
      status: 'ready',
      environment: 'staging',
      baseUrl: config.baseUrl,
      origin: config.origin,
      expectedPageId: config.expectedPageId,
      externalWritesEnabled: false,
      accessTokenReferenceConfigured: true,
    }, null, 2)}\n`);
    return;
  }

  if (command !== 'smoke') {
    throw new Error('Usage: staging-cli.js [validate|smoke]');
  }

  const resolver = new EnvironmentSecretResolver({
    environment: process.env,
    allowedVariableNames: allowedEnvironmentSecrets(process.env),
  });
  const report = await new MetaStagingReadinessRunner({
    config,
    secretResolver: resolver,
  }).run();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown staging readiness failure';
  process.stderr.write(`Meta staging readiness failed: ${message}\n`);
  process.exitCode = 1;
});
