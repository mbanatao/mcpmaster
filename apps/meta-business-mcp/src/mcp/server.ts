import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import {
  BearerAuthenticationError,
  type BearerAuthenticator,
} from '../auth/supabase-bearer';
import type { OrganizationMembershipResolver } from '../auth/membership';
import {
  MetaWebhookProcessingError,
  type MetaWebhookProcessor,
} from '../webhooks/processor';
import {
  MetaWebhookVerificationError,
  type MetaWebhookSignatureVerifier,
} from '../webhooks/signature';
import {
  MetaRemoteMcpHandler,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  type JsonRpcMessage,
} from './handler';

export interface MetaRemoteMcpHttpOptions {
  handler: MetaRemoteMcpHandler;
  authenticator: BearerAuthenticator;
  membershipResolver: OrganizationMembershipResolver;
  organizationId: string;
  allowedOrigins: readonly string[];
  requireHttps: boolean;
  requestBodyLimitBytes: number;
  requestsPerMinute: number;
  webhookProcessor?: MetaWebhookProcessor;
  webhookVerifier?: MetaWebhookSignatureVerifier;
  webhookBodyLimitBytes?: number;
  now?: () => number;
}

interface RateState {
  windowStartedAt: number;
  count: number;
}

class FixedWindowRateLimiter {
  private readonly values = new Map<string, RateState>();

  constructor(
    private readonly limit: number,
    private readonly now: () => number,
  ) {}

  consume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const current = this.now();
    const existing = this.values.get(key);
    if (!existing || current - existing.windowStartedAt >= 60_000) {
      this.values.set(key, { windowStartedAt: current, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (existing.count >= this.limit) {
      const remaining = Math.max(1, 60_000 - (current - existing.windowStartedAt));
      return { allowed: false, retryAfterSeconds: Math.ceil(remaining / 1000) };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

function originAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin) {
    return true;
  }
  try {
    return allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

function acceptsMcpResponse(value: string | undefined): boolean {
  const normalized = value?.toLowerCase() ?? '';
  return normalized.includes('*/*')
    || (normalized.includes('application/json') && normalized.includes('text/event-stream'));
}

function isInitialize(message: JsonRpcMessage): boolean {
  return message.method === 'initialize';
}

function protocolVersionAllowed(value: string | undefined): boolean {
  const version = value?.trim() || '2025-03-26';
  return SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(
    version as (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number],
  );
}

function setSecureResponseHeaders(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function jsonRpcHttpError(response: Response, status: number, message: string): void {
  setSecureResponseHeaders(response);
  response.status(status).json({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  });
}

export function createMetaRemoteMcpApp(options: MetaRemoteMcpHttpOptions): express.Express {
  const app = express();
  const limiter = new FixedWindowRateLimiter(
    options.requestsPerMinute,
    options.now ?? Date.now,
  );

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));

  app.get('/health', (_request, response) => {
    setSecureResponseHeaders(response);
    response.json({
      status: 'ok',
      service: 'mcpmaster-meta-business-mcp',
      externalWritesEnabled: false,
    });
  });

  app.use((request, response, next) => {
    if (options.requireHttps && !request.secure) {
      setSecureResponseHeaders(response);
      response.status(426).json({ status: 'https_required' });
      return;
    }
    next();
  });

  if (options.webhookVerifier) {
    app.get('/webhooks/meta', async (request, response) => {
      try {
        const challenge = await options.webhookVerifier?.verifyChallenge(
          typeof request.query['hub.mode'] === 'string' ? request.query['hub.mode'] : undefined,
          typeof request.query['hub.verify_token'] === 'string'
            ? request.query['hub.verify_token']
            : undefined,
          typeof request.query['hub.challenge'] === 'string'
            ? request.query['hub.challenge']
            : undefined,
        );
        response.type('text/plain').status(200).send(challenge);
      } catch (error) {
        response.status(error instanceof MetaWebhookVerificationError ? 403 : 500).send('Forbidden');
      }
    });
  }

  if (options.webhookProcessor) {
    app.post(
      '/webhooks/meta',
      express.raw({
        type: 'application/json',
        limit: options.webhookBodyLimitBytes ?? 256 * 1024,
      }),
      async (request, response) => {
        try {
          if (!Buffer.isBuffer(request.body)) {
            response.status(400).json({ status: 'rejected' });
            return;
          }
          const result = await options.webhookProcessor?.process(
            request.body,
            request.header('x-hub-signature-256'),
          );
          setSecureResponseHeaders(response);
          response.status(200).json(result);
        } catch (error) {
          const status = error instanceof MetaWebhookVerificationError
            ? 401
            : error instanceof MetaWebhookProcessingError
              ? 400
              : 500;
          setSecureResponseHeaders(response);
          response.status(status).json({
            status: 'rejected',
            code: error instanceof MetaWebhookProcessingError ? error.code : 'webhook_rejected',
          });
        }
      },
    );
  }

  const authenticate = async (request: Request, response: Response) => {
    if (!originAllowed(request.header('origin'), options.allowedOrigins)) {
      jsonRpcHttpError(response, 403, 'Forbidden origin');
      return null;
    }

    try {
      const identity = await options.authenticator.authenticate(request.header('authorization'));
      const membership = await options.membershipResolver.resolve(
        options.organizationId,
        identity.userId,
        identity.accessToken,
      );
      if (!membership) {
        jsonRpcHttpError(response, 403, 'Active organization membership required');
        return null;
      }
      return { identity, membership };
    } catch (error) {
      if (error instanceof BearerAuthenticationError) {
        response.setHeader('WWW-Authenticate', 'Bearer');
        jsonRpcHttpError(response, error.status, error.message);
        return null;
      }
      jsonRpcHttpError(response, 503, 'Authentication service unavailable');
      return null;
    }
  };

  app.get('/mcp', async (request, response) => {
    if (!await authenticate(request, response)) {
      return;
    }
    response.setHeader('Allow', 'POST, GET');
    response.status(405).send('Method Not Allowed');
  });

  app.delete('/mcp', async (request, response) => {
    if (!await authenticate(request, response)) {
      return;
    }
    response.setHeader('Allow', 'POST, GET');
    response.status(405).send('Method Not Allowed');
  });

  app.post(
    '/mcp',
    express.json({
      type: ['application/json', 'application/*+json'],
      limit: options.requestBodyLimitBytes,
      strict: true,
    }),
    async (request, response) => {
      if (!acceptsMcpResponse(request.header('accept'))) {
        jsonRpcHttpError(
          response,
          406,
          'Accept must include application/json and text/event-stream',
        );
        return;
      }

      const message = request.body as JsonRpcMessage;
      if (Array.isArray(message) || typeof message !== 'object' || message === null) {
        jsonRpcHttpError(response, 400, 'MCP request body must be one JSON-RPC message');
        return;
      }
      if (!isInitialize(message) && !protocolVersionAllowed(request.header('mcp-protocol-version'))) {
        jsonRpcHttpError(response, 400, 'Unsupported MCP protocol version');
        return;
      }

      const actor = await authenticate(request, response);
      if (!actor) {
        return;
      }

      const rate = limiter.consume(actor.identity.userId);
      if (!rate.allowed) {
        response.setHeader('Retry-After', String(rate.retryAfterSeconds));
        jsonRpcHttpError(response, 429, 'Rate limit exceeded');
        return;
      }

      const result = await options.handler.handle(message, actor);
      setSecureResponseHeaders(response);
      if (result.notification) {
        response.status(202).end();
        return;
      }
      response.type('application/json').status(200).json(result.response);
    },
  );

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) {
      jsonRpcHttpError(response, 400, 'Invalid JSON request body');
      return;
    }
    jsonRpcHttpError(response, 500, 'Internal server error');
  });

  return app;
}
