import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveRequiredSecret, type SecretResolver } from '../secrets/resolver';

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export class MetaWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaWebhookVerificationError';
  }
}

export interface MetaWebhookSignatureVerifierOptions {
  appSecretRef: string;
  verifyTokenSecretRef: string;
  secretResolver: SecretResolver;
}

export class MetaWebhookSignatureVerifier {
  private readonly appSecretRef: string;
  private readonly verifyTokenSecretRef: string;
  private readonly secretResolver: SecretResolver;

  constructor(options: MetaWebhookSignatureVerifierOptions) {
    this.appSecretRef = options.appSecretRef.trim();
    this.verifyTokenSecretRef = options.verifyTokenSecretRef.trim();
    if (!this.appSecretRef || !this.verifyTokenSecretRef) {
      throw new Error('Webhook app-secret and verify-token references are required');
    }
    this.secretResolver = options.secretResolver;
  }

  async verifyDelivery(rawBody: Buffer, signatureHeader: string | undefined): Promise<void> {
    if (!signatureHeader) {
      throw new MetaWebhookVerificationError('Missing X-Hub-Signature-256 header');
    }

    const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
    if (!match) {
      throw new MetaWebhookVerificationError('Malformed X-Hub-Signature-256 header');
    }

    const secret = await resolveRequiredSecret(this.secretResolver, this.appSecretRef);
    const expected = createHmac('sha256', secret.value).update(rawBody).digest('hex');
    const supplied = match[1].toLowerCase();
    if (!safeEqualText(expected, supplied)) {
      throw new MetaWebhookVerificationError('Webhook signature mismatch');
    }
  }

  async verifyChallenge(
    mode: string | undefined,
    verifyToken: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    if (mode !== 'subscribe' || !verifyToken || challenge === undefined) {
      throw new MetaWebhookVerificationError('Invalid webhook verification challenge');
    }

    const expected = await resolveRequiredSecret(this.secretResolver, this.verifyTokenSecretRef);
    if (!safeEqualText(expected.value, verifyToken)) {
      throw new MetaWebhookVerificationError('Webhook verify token mismatch');
    }

    return challenge;
  }
}
