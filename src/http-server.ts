import { randomUUID } from 'crypto';
import path from 'path';
import cors from 'cors';
import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { z, ZodError } from 'zod';
import { executeTool, getAllTools, toolRegistry } from './tools/index.js';
import {
  buildToolConfiguration,
  inspectToolConfiguration,
  MissingConfigurationError,
  UnknownToolError,
} from './runtime/service-config.js';
import { classifyToolRisk, requiresApproval, secureTokenMatches } from './runtime/tool-policy.js';

const VERSION = '1.1.0-foundation';
const MAX_AUDIT_EVENTS = 500;

const runtimeConfigSchema = z.object({
  port: z.coerce.number().int().positive().max(65535).default(3000),
  adminToken: z.string().min(32, 'BRIDGE_ADMIN_TOKEN must contain at least 32 characters'),
  approvalToken: z.string().min(32).optional(),
  allowedOrigins: z.string().default(''),
  rateLimitRequests: z.coerce.number().int().positive().default(60),
  rateLimitWindowMs: z.coerce.number().int().positive().default(60_000),
});

type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

type AuditStatus = 'planned' | 'approved' | 'completed' | 'failed' | 'denied';

interface AuditEvent {
  id: string;
  requestId: string;
  timestamp: string;
  tool: string;
  risk: ReturnType<typeof classifyToolRisk>;
  status: AuditStatus;
  durationMs?: number;
  error?: string;
}

const executionSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.unknown()).optional().default({}),
  dryRun: z.boolean().optional().default(false),
});

function loadRuntimeConfig(): RuntimeConfig {
  return runtimeConfigSchema.parse({
    port: process.env.PORT,
    adminToken: process.env.BRIDGE_ADMIN_TOKEN,
    approvalToken: process.env.BRIDGE_APPROVAL_TOKEN || undefined,
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
    rateLimitRequests: process.env.RATE_LIMIT_REQUESTS,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
  });
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function createAdminGuard(config: RuntimeConfig): RequestHandler {
  return (request, response, next) => {
    if (!secureTokenMatches(bearerToken(request), config.adminToken)) {
      response.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'A valid bearer token is required.' },
      });
      return;
    }
    next();
  };
}

function createRateLimiter(config: RuntimeConfig): RequestHandler {
  const clients = new Map<string, { count: number; resetAt: number }>();

  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const existing = clients.get(key);
    const state = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + config.rateLimitWindowMs }
      : existing;

    state.count += 1;
    clients.set(key, state);

    response.setHeader('RateLimit-Limit', config.rateLimitRequests.toString());
    response.setHeader('RateLimit-Remaining', Math.max(0, config.rateLimitRequests - state.count).toString());
    response.setHeader('RateLimit-Reset', Math.ceil(state.resetAt / 1000).toString());

    if (state.count > config.rateLimitRequests) {
      response.status(429).json({
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
      });
      return;
    }

    if (clients.size > 10_000) {
      for (const [clientKey, clientState] of clients.entries()) {
        if (clientState.resetAt <= now) clients.delete(clientKey);
      }
    }

    next();
  };
}

function createCorsOptions(config: RuntimeConfig): cors.CorsOptions {
  const allowedOrigins = config.allowedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Approval-Token', 'X-Request-Id'],
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed'));
    },
  };
}

function publicToolMetadata() {
  return Object.entries(toolRegistry).map(([name, metadata]) => ({
    name,
    service: metadata.handler,
    description: metadata.description,
    risk: classifyToolRisk(name),
    approvalRequired: requiresApproval(name),
    ...inspectToolConfiguration(name),
  }));
}

export function createHttpApp(config: RuntimeConfig = loadRuntimeConfig()) {
  const app = express();
  const auditEvents: AuditEvent[] = [];

  const recordAudit = (event: AuditEvent) => {
    auditEvents.push(event);
    if (auditEvents.length > MAX_AUDIT_EVENTS) auditEvents.shift();
  };

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors(createCorsOptions(config)));
  app.use(express.json({ limit: '256kb' }));
  app.use(createRateLimiter(config));

  app.get('/', (_request, response) => {
    response.json({
      name: 'MCPMaster Workflow Control Tower',
      version: VERSION,
      mode: 'secure-http',
      description: 'Approval-gated tool execution and workflow control plane foundation.',
      endpoints: { health: '/health', tools: '/tools' },
    });
  });

  app.get('/health', (_request, response) => {
    response.json({
      status: 'healthy',
      version: VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  const protectedRouter = express.Router();
  protectedRouter.use(createAdminGuard(config));

  protectedRouter.get('/metrics', (_request, response) => {
    response.json({
      uptimeSeconds: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      toolCount: getAllTools().length,
      auditEventCount: auditEvents.length,
    });
  });

  protectedRouter.get('/tools', (_request, response) => {
    response.json({ tools: publicToolMetadata() });
  });

  protectedRouter.post('/tools/plan', (request, response, next) => {
    try {
      const input = executionSchema.parse({ ...request.body, dryRun: true });
      const entry = toolRegistry[input.tool as keyof typeof toolRegistry];
      if (!entry) throw new UnknownToolError(input.tool);

      const requestId = request.header('x-request-id') || randomUUID();
      const risk = classifyToolRisk(input.tool);
      const configuration = inspectToolConfiguration(input.tool);

      recordAudit({
        id: randomUUID(),
        requestId,
        timestamp: new Date().toISOString(),
        tool: input.tool,
        risk,
        status: 'planned',
      });

      response.json({
        ok: true,
        requestId,
        plan: {
          tool: input.tool,
          service: entry.handler,
          description: entry.description,
          args: input.args,
          risk,
          approvalRequired: requiresApproval(input.tool),
          configuration,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  const executeHandler: RequestHandler = async (request, response, next) => {
    const startedAt = Date.now();
    let requestId = request.header('x-request-id') || randomUUID();
    let tool = 'unknown';
    let risk: ReturnType<typeof classifyToolRisk> = 'write';

    try {
      const input = executionSchema.parse(request.body);
      tool = input.tool;
      risk = classifyToolRisk(tool);

      const entry = toolRegistry[tool as keyof typeof toolRegistry];
      if (!entry) throw new UnknownToolError(tool);

      if (input.dryRun) {
        recordAudit({
          id: randomUUID(), requestId, timestamp: new Date().toISOString(), tool, risk, status: 'planned',
        });
        response.json({
          ok: true,
          requestId,
          dryRun: true,
          plan: {
            tool,
            service: entry.handler,
            description: entry.description,
            args: input.args,
            risk,
            approvalRequired: requiresApproval(tool),
            configuration: inspectToolConfiguration(tool),
          },
        });
        return;
      }

      if (requiresApproval(tool)) {
        const providedApproval = request.header('x-approval-token');
        if (!config.approvalToken) {
          recordAudit({
            id: randomUUID(), requestId, timestamp: new Date().toISOString(), tool, risk, status: 'denied',
            error: 'Approval token is not configured',
          });
          response.status(503).json({
            ok: false,
            requestId,
            error: {
              code: 'APPROVALS_NOT_CONFIGURED',
              message: 'Write execution is disabled until BRIDGE_APPROVAL_TOKEN is configured.',
            },
          });
          return;
        }

        if (!secureTokenMatches(providedApproval, config.approvalToken)) {
          recordAudit({
            id: randomUUID(), requestId, timestamp: new Date().toISOString(), tool, risk, status: 'denied',
            error: 'Approval token rejected',
          });
          response.status(403).json({
            ok: false,
            requestId,
            error: { code: 'APPROVAL_REQUIRED', message: 'This tool requires explicit approval.' },
          });
          return;
        }

        recordAudit({
          id: randomUUID(), requestId, timestamp: new Date().toISOString(), tool, risk, status: 'approved',
        });
      }

      const result = await executeTool(tool, input.args, buildToolConfiguration(tool));
      const durationMs = Date.now() - startedAt;

      recordAudit({
        id: randomUUID(), requestId, timestamp: new Date().toISOString(), tool, risk, status: 'completed', durationMs,
      });

      response.json({ ok: true, requestId, tool, risk, durationMs, result });
    } catch (error) {
      recordAudit({
        id: randomUUID(),
        requestId,
        timestamp: new Date().toISOString(),
        tool,
        risk,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  };

  protectedRouter.post('/tools/execute', executeHandler);
  protectedRouter.post('/tools', (request, response, next) => {
    response.setHeader('Deprecation', 'true');
    response.setHeader('Link', '</tools/execute>; rel="successor-version"');
    executeHandler(request, response, next);
  });

  protectedRouter.get('/logs', (request, response) => {
    const requestedLimit = Number.parseInt(String(request.query.limit || '100'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
    response.json({ events: auditEvents.slice(-limit) });
  });

  const webRoot = path.join(process.cwd(), 'web');
  protectedRouter.use('/control-panel', express.static(path.join(webRoot, 'control-panel')));
  protectedRouter.use('/wow-control', express.static(path.join(webRoot, 'wow-control')));
  protectedRouter.use('/live-ops', express.static(path.join(webRoot, 'live-ops')));
  protectedRouter.use('/memgraph', express.static(path.join(webRoot, 'memgraph')));
  protectedRouter.use('/audit-cinema', express.static(path.join(webRoot, 'audit-cinema')));

  app.use(protectedRouter);

  app.use((_request, response) => {
    response.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Request validation failed.', issues: error.issues },
      });
      return;
    }

    if (error instanceof UnknownToolError) {
      response.status(404).json({ ok: false, error: { code: 'UNKNOWN_TOOL', message: error.message } });
      return;
    }

    if (error instanceof MissingConfigurationError) {
      response.status(503).json({
        ok: false,
        error: { code: 'SERVICE_NOT_CONFIGURED', message: error.message, missing: error.missing },
      });
      return;
    }

    console.error(error);
    response.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    });
  });

  return app;
}

export function startHttpServer() {
  const config = loadRuntimeConfig();
  const app = createHttpApp(config);
  const server = app.listen(config.port, () => {
    console.log(`MCPMaster secure HTTP runtime listening on port ${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}; shutting down.`);
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (require.main === module) {
  startHttpServer();
}
