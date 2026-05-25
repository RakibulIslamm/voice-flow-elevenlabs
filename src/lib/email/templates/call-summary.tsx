import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { CaptureType } from '@/lib/db/models/capture';

export type CallSummaryEmailProps = {
  appUrl: string;
  agentName: string;
  businessName: string;
  channel: 'browser' | 'phone';
  callerLabel: string;
  durationLabel: string;
  outcome: string;
  summary: string;
  callId: string;
  captures: Array<{ type: CaptureType; details: string }>;
};

/**
 * React-Email template rendered server-side by `@react-email/render`
 * and shipped via Resend. Inline styles (no Tailwind in email) keep
 * compatibility with Gmail, Outlook desktop, Apple Mail.
 */
export function CallSummaryEmail({
  appUrl,
  agentName,
  businessName,
  channel,
  callerLabel,
  durationLabel,
  outcome,
  summary,
  callId,
  captures,
}: CallSummaryEmailProps) {
  const callUrl = `${appUrl}/dashboard/calls/${callId}`;
  return (
    <Html>
      <Head />
      <Preview>{outcome}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading as="h1" style={styles.brand}>
            VoiceFlow
          </Heading>
          <Text style={styles.eyebrow}>Call summary</Text>
          <Heading as="h2" style={styles.title}>
            {agentName}
            {businessName ? <span style={styles.subtle}> · {businessName}</span> : null}
          </Heading>
          <Text style={styles.meta}>
            {channel === 'browser' ? 'Web call' : 'Phone call'} · {callerLabel} · {durationLabel}
          </Text>

          <Hr style={styles.hr} />

          <Section>
            <Text style={styles.h3}>Outcome</Text>
            <Text style={styles.body1}>{outcome}</Text>
          </Section>

          <Section>
            <Text style={styles.h3}>Summary</Text>
            <Text style={styles.body1}>{summary}</Text>
          </Section>

          {captures.length > 0 ? (
            <Section>
              <Text style={styles.h3}>Captured during the call</Text>
              <table style={styles.table} cellPadding={0} cellSpacing={0}>
                <tbody>
                  {captures.map((c, i) => (
                    <tr key={i} style={styles.tr}>
                      <td style={styles.td1}>{titleCase(c.type)}</td>
                      <td style={styles.td2}>{c.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          <Section style={{ textAlign: 'center', marginTop: 28 }}>
            <Link href={callUrl} style={styles.button}>
              View full transcript
            </Link>
          </Section>

          <Hr style={styles.hr} />

          <Text style={styles.footer}>
            Manage your AI receptionist at{' '}
            <Link href={appUrl} style={styles.footerLink}>
              VoiceFlow
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function titleCase(s: string): string {
  return s.replace(/(^|[-_\s])(\w)/g, (_, sep, ch) => (sep === '-' ? ' ' : sep) + ch.toUpperCase());
}

const styles = {
  body: {
    backgroundColor: '#f6f4ee',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
    margin: 0,
    padding: 0,
  },
  container: {
    maxWidth: 560,
    margin: '0 auto',
    padding: '32px 24px',
    backgroundColor: '#ffffff',
    border: '1px solid #ece5d6',
    borderRadius: 12,
  },
  brand: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#d97706',
    margin: 0,
    paddingBottom: 4,
  },
  eyebrow: {
    fontSize: 11,
    color: '#8a7d65',
    margin: '8px 0 0',
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
  },
  title: {
    margin: '4px 0 0',
    fontSize: 22,
    fontWeight: 600,
    color: '#1a1208',
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  subtle: { color: '#8a7d65', fontWeight: 400 },
  meta: { margin: '6px 0 0', fontSize: 13, color: '#7a6f5a' },
  hr: { borderColor: '#ece5d6', margin: '24px 0' },
  h3: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: '#8a7d65', margin: '0 0 6px' },
  body1: { fontSize: 14, lineHeight: 1.55, color: '#1a1208', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  tr: { borderTop: '1px solid #f1eadb' },
  td1: { padding: '8px 8px 8px 0', fontSize: 13, fontWeight: 600, color: '#1a1208', width: 120 },
  td2: { padding: '8px 0', fontSize: 13, color: '#3c3424', lineHeight: 1.5 },
  button: {
    display: 'inline-block',
    padding: '10px 20px',
    backgroundColor: '#1a1208',
    color: '#fffaee',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 999,
    textDecoration: 'none',
  },
  footer: { fontSize: 11, color: '#8a7d65', textAlign: 'center' as const, margin: 0 },
  footerLink: { color: '#8a7d65', textDecoration: 'underline' },
};
