import { SupabaseRestClient, type FetchLike } from '../supabase/rest-client';

export type OrganizationRole = 'owner' | 'admin' | 'operator' | 'member' | 'viewer';

export interface ActiveOrganizationMembership {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}

export interface OrganizationMembershipResolver {
  resolve(
    organizationId: string,
    userId: string,
    accessToken: string,
  ): Promise<ActiveOrganizationMembership | null>;
}

export interface SupabaseOrganizationMembershipResolverOptions {
  supabaseUrl: string;
  publishableKey: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

const ROLES = new Set<OrganizationRole>(['owner', 'admin', 'operator', 'member', 'viewer']);

export function roleCanCreateDraft(role: OrganizationRole): boolean {
  return role !== 'viewer';
}

export class SupabaseOrganizationMembershipResolver implements OrganizationMembershipResolver {
  private readonly supabaseUrl: string;
  private readonly publishableKey: string;
  private readonly fetchFn?: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: SupabaseOrganizationMembershipResolverOptions) {
    this.supabaseUrl = options.supabaseUrl;
    this.publishableKey = options.publishableKey;
    this.fetchFn = options.fetchFn;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async resolve(
    organizationId: string,
    userId: string,
    accessToken: string,
  ): Promise<ActiveOrganizationMembership | null> {
    const query = new URLSearchParams({
      select: 'organization_id,user_id,role,status',
      organization_id: `eq.${organizationId}`,
      user_id: `eq.${userId}`,
      status: 'eq.active',
      limit: '1',
    });
    const client = new SupabaseRestClient({
      supabaseUrl: this.supabaseUrl,
      apiKey: this.publishableKey,
      accessToken,
      fetchFn: this.fetchFn,
      timeoutMs: this.timeoutMs,
    });
    const payload = await client.requestJson(`/rest/v1/memberships?${query.toString()}`);
    if (!Array.isArray(payload) || payload.length === 0) {
      return null;
    }

    const row = typeof payload[0] === 'object' && payload[0] !== null
      ? payload[0] as Record<string, unknown>
      : {};
    const role = row.role;
    if (
      row.organization_id !== organizationId
      || row.user_id !== userId
      || row.status !== 'active'
      || typeof role !== 'string'
      || !ROLES.has(role as OrganizationRole)
    ) {
      return null;
    }

    return {
      organizationId,
      userId,
      role: role as OrganizationRole,
    };
  }
}
