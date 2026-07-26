import { auditStore, withSystem } from '@cleanquote/database';

/**
 * Transactional email.
 *
 * Two rules shape this module:
 *
 *  1. **Delivery never blocks persistence.** A quote that was approved is
 *     approved whether or not the notification left the building. Every send is
 *     recorded with its outcome, and a failure is a logged row rather than a
 *     thrown request.
 *  2. **A missing provider is a working state.** The local provider writes the
 *     message to `email_deliveries`, which the development inbox renders. The
 *     flow is fully exercisable with no credentials.
 */

export type EmailKind =
  | 'invitation'
  | 'email_verification'
  | 'password_reset'
  | 'approval_request'
  | 'approval_decision'
  | 'proposal_sent'
  | 'client_comment'
  | 'revision_request'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_expiring';

export interface EmailMessage {
  readonly kind: EmailKind;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly organisationId?: string | null;
  readonly relatedEntityType?: string | null;
  readonly relatedEntityId?: string | null;
}

export interface DeliveryResult {
  readonly status: 'sent' | 'failed' | 'suppressed';
  readonly providerMessageId: string | null;
  readonly error?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<DeliveryResult>;
}

/**
 * Development provider.
 *
 * Records the message and reports success. Nothing leaves the machine, which is
 * the correct behaviour for a development environment holding real addresses.
 */
export class LocalEmailProvider implements EmailProvider {
  readonly name = 'local';

  async send(): Promise<DeliveryResult> {
    return { status: 'sent', providerMessageId: `local-${Date.now().toString(36)}` };
  }
}

/**
 * Generic HTTP provider for a hosted service (Resend, Postmark, SES).
 *
 * Deliberately thin: the endpoint and payload shape are configuration, so
 * changing provider does not change any calling code.
 */
export class HttpEmailProvider implements EmailProvider {
  readonly name: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fromAddress: string;

  constructor(config: { name: string; endpoint: string; apiKey: string; fromAddress: string }) {
    this.name = config.name;
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.fromAddress = config.fromAddress;
  }

  async send(message: EmailMessage): Promise<DeliveryResult> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
      });

      if (!response.ok) {
        return {
          status: 'failed',
          providerMessageId: null,
          error: `Provider returned ${response.status}`,
        };
      }

      const payload = (await response.json().catch(() => ({}))) as { id?: string };
      return { status: 'sent', providerMessageId: payload.id ?? null };
    } catch (error) {
      return {
        status: 'failed',
        providerMessageId: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

let provider: EmailProvider | undefined;

export function configureEmailProvider(next: EmailProvider): void {
  provider = next;
}

export function getEmailProvider(): EmailProvider {
  if (!provider) provider = new LocalEmailProvider();
  return provider;
}

/**
 * Sends and records.
 *
 * Never throws. A caller that has just approved a quote must not have its
 * transaction unwound because a mail server was unreachable.
 */
export async function sendEmail(message: EmailMessage): Promise<DeliveryResult> {
  const active = getEmailProvider();
  let result: DeliveryResult;
  try {
    result = await active.send(message);
  } catch (error) {
    result = {
      status: 'failed',
      providerMessageId: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    await withSystem(async (db) => {
      await auditStore.recordEmail(db, {
        organisationId: message.organisationId ?? null,
        kind: message.kind,
        toEmail: message.to,
        subject: message.subject,
        bodyText: message.body,
        provider: active.name,
        providerMessageId: result.providerMessageId,
        status: result.status,
        error: result.error ?? null,
        relatedEntityType: message.relatedEntityType ?? null,
        relatedEntityId: message.relatedEntityId ?? null,
      });
    });
  } catch {
    // The delivery record is best-effort. Losing it must not turn a successful
    // send into a failed request.
  }

  return result;
}

export { LocalEmailProvider as DevelopmentEmailProvider };
