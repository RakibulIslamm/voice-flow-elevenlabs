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

export type ToolNotificationKind =
  | 'appointment'
  | 'reservation'
  | 'lead'
  | 'transfer'
  | 'cancellation'
  | 'reschedule';

export type ToolNotificationProps = {
  appUrl: string;
  kind: ToolNotificationKind;
  agentName: string;
  businessName: string;
  callId: string;
  rows: Array<{ label: string; value: string }>;
  urgent?: boolean;
};

const COPY: Record<
  ToolNotificationKind,
  { eyebrow: string; title: (biz: string) => string; cta: string }
> = {
  appointment: {
    eyebrow: 'New appointment',
    title: (biz) => `${biz} just booked an appointment`,
    cta: 'View call & confirmation',
  },
  reservation: {
    eyebrow: 'New reservation',
    title: (biz) => `${biz} just received a reservation`,
    cta: 'View call & confirmation',
  },
  lead: {
    eyebrow: 'New lead',
    title: (biz) => `${biz} captured a new lead`,
    cta: 'View lead & call',
  },
  transfer: {
    eyebrow: 'Transfer requested',
    title: (biz) => `${biz} — caller requested a human`,
    cta: 'View call & respond',
  },
  cancellation: {
    eyebrow: 'Booking cancelled',
    title: (biz) => `${biz} — caller cancelled a booking`,
    cta: 'View call & details',
  },
  reschedule: {
    eyebrow: 'Booking rescheduled',
    title: (biz) => `${biz} — caller rescheduled a booking`,
    cta: 'View call & new time',
  },
};

export function ToolNotificationEmail({
  appUrl,
  kind,
  agentName,
  businessName,
  callId,
  rows,
  urgent,
}: ToolNotificationProps) {
  const copy = COPY[kind];
  const url = `${appUrl}/dashboard/calls/${callId}`;
  const accent = urgent ? '#b91c1c' : '#d97706';
  return (
    <Html>
      <Head />
      <Preview>
        {copy.eyebrow} · {agentName}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading as="h1" style={styles.brand}>
            VoiceFlow
          </Heading>
          <Text style={{ ...styles.eyebrow, color: accent }}>{copy.eyebrow}</Text>
          <Heading as="h2" style={styles.title}>
            {copy.title(businessName || agentName)}
          </Heading>
          <Text style={styles.meta}>via {agentName}</Text>

          <Hr style={styles.hr} />

          <Section>
            <table style={styles.table} cellPadding={0} cellSpacing={0}>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={styles.tr}>
                    <td style={styles.td1}>{r.label}</td>
                    <td style={styles.td2}>{r.value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section style={{ textAlign: 'center', marginTop: 24 }}>
            <Link href={url} style={{ ...styles.button, backgroundColor: accent }}>
              {copy.cta}
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
    margin: '8px 0 0',
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    fontWeight: 600,
  },
  title: {
    margin: '4px 0 0',
    fontSize: 22,
    fontWeight: 600,
    color: '#1a1208',
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  meta: { margin: '6px 0 0', fontSize: 13, color: '#7a6f5a' },
  hr: { borderColor: '#ece5d6', margin: '24px 0' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  tr: { borderTop: '1px solid #f1eadb' },
  td1: { padding: '10px 8px 10px 0', fontSize: 13, fontWeight: 600, color: '#1a1208', width: 140, verticalAlign: 'top' as const },
  td2: { padding: '10px 0', fontSize: 13, color: '#3c3424', lineHeight: 1.5 },
  button: {
    display: 'inline-block',
    padding: '10px 22px',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 999,
    textDecoration: 'none',
  },
  footer: { fontSize: 11, color: '#8a7d65', textAlign: 'center' as const, margin: 0 },
  footerLink: { color: '#8a7d65', textDecoration: 'underline' },
};
