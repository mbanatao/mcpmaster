# 14. Tool Definition Contract

```ts
export type ToolRisk = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

export interface ToolDefinition<I, O> {
  name: string;
  version: string;
  provider: string;
  description: string;
  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;
  risk: ToolRisk;
  readOnly: boolean;
  requiredScopes: string[];
  defaultApproval: 'none' | 'single' | 'dual' | 'deny';
  timeoutMs: number;
  maxAttempts: number;
  idempotency: 'not-needed' | 'required' | 'provider-key';
  execute(ctx: ToolContext, input: I): Promise<O>;
  verify?(ctx: ToolContext, input: I, output: O): Promise<VerificationResult>;
  compensate?(ctx: ToolContext, input: I, output: O): Promise<CompensationResult>;
}
```

This replaces the current pattern where the MCP list, HTTP endpoint, registry, and documentation can drift apart.

# 15. Workflow Definition Contract

A workflow template should be a versioned TypeScript definition with a declarative metadata companion:

```ts
export const bugToWorkstream = defineWorkflow({
  key: 'engineering.bug_to_workstream',
  version: '1.0.0',
  riskCeiling: 'R2',
  inputSchema: BugInputSchema,
  permissions: ['github:issues:read', 'github:issues:write'],
  async run(ctx, input) {
    const context = await ctx.step('collect-context', () => collectContext(input));
    const plan = await ctx.step('create-plan', () => createPlan(context));
    await ctx.approval('approve-writes', summarizePlan(plan));
    const issue = await ctx.tool('github.create-issue', plan.githubIssue);
    await ctx.step('verify', () => verifyIssue(issue));
    return buildReport(issue);
  }
});
```

The real implementation must use the current workflow engine API, but the domain abstraction should remain this stable.

# 16. Model Routing and Cost Controls

## 16.1 Routing policy

1. Attempt deterministic code first.
2. Use the cheapest tier that meets the required capability.
3. Escalate only on explicit failure criteria.
4. Limit maximum tokens and tool loops per task.
5. Cache safe, reusable classification and summarization results.
6. Record provider latency, error rate, quality score, and cost.
7. Use a fallback provider for availability, not uncontrolled repeated generation.

## 16.2 Budget controls

- Per-run maximum estimated cost.
- Per-workspace daily and monthly caps.
- Maximum model tier allowed by workflow.
- Maximum number of planning revisions.
- Maximum tool calls per run.
- Automatic pause when a cap is reached.
- Owner notifications at 50%, 80%, and 100% of budget.

## 16.3 Quality evaluation

Create an evaluation set for each workflow:

- Correct workflow chosen.
- Correct tools selected.
- No unauthorized write proposed.
- Important evidence included.
- Assumptions stated.
- Output schema valid.
- Cost below target.
- Human rating of usefulness.

# 17. Security Architecture

## 17.1 Principal threats

- Cross-tenant data access.
- Prompt injection from issues, comments, docs, and logs.
- Credential exposure.
- Over-permissioned connectors.
- Duplicate writes caused by retries.
- Forged webhooks.
- Approval bypass.
- Model hallucination of targets or identifiers.
- Supply-chain compromise in connector dependencies.
- Excessive AI spend or infinite tool loops.

## 17.2 Required controls

- RLS on every exposed tenant table.
- GitHub App and OAuth scopes kept to minimum required permissions.
- Webhook HMAC/signature verification and replay protection.
- Server-only secret resolution.
- Egress allowlist by connector.
- Structured tool arguments; no arbitrary URL fetch in write workflows.
- Resource identifiers read from verified context, not free-form model text when possible.
- Approval records bound to a cryptographic hash of the exact proposed action.
- Re-approval required if arguments change.
- Idempotency key stored before external mutation.
- Read-back verification after mutation.
- CSP, CSRF protection, secure cookies, and session rotation.
- Dependency scanning, secret scanning, and protected production branches.
- Audit export and retention policy.

## 17.3 Prompt-injection policy

Any provider-sourced content must be wrapped as untrusted data and separated from system instructions. Connector content may suggest facts but cannot change policy, reveal secrets, authorize actions, or instruct the runtime to call tools. The policy engine uses server-side metadata, not model claims, to determine authority.

# 18. Observability and Reliability

## 18.1 Required telemetry

- Workflow starts, completions, failures, cancellations, and durations.
- Step retries and failure categories.
- Connector latency and rate limits.
- Model provider, model tier, tokens, cost, and fallback use.
- Approval wait time and rejection rate.
- Duplicate-prevention events.
- Policy allow/deny counts.
- Webhook processing lag.

## 18.2 Initial service objectives

- 100% of writes have an audit event and idempotency key.
- 100% of R2/R3 actions receive the required approval.
- Zero cross-tenant access in automated RLS tests.
- 99.5% monthly availability target for the private beta.
- 95% of read-only workflows start within two seconds.
- No duplicate external mutations in retry tests.
- A failed run always ends in a visible, recoverable state.

## 18.3 Failure states

Every workflow run ends in one of:

- Completed.
- Completed with warnings.
- Waiting for approval.
- Waiting for external event.
- Retrying.
- Failed and compensated.
- Failed and requires manual recovery.
- Cancelled.
- Expired.
