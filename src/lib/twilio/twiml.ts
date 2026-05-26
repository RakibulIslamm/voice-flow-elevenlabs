import 'server-only';

/**
 * Builds a TwiML response that plays a brief unavailable message and
 * hangs up. Used when an inbound call lands but the agent is paused,
 * the user disconnected ElevenLabs, or quota is exhausted.
 *
 * Twilio expects `Content-Type: text/xml` (not application/xml) — the
 * NextResponse caller is responsible for that header.
 */
export function buildUnavailableTwiml(message?: string): string {
  const text =
    message ??
    'Sorry, this service is temporarily unavailable. Please call back later.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Bridges the call into ElevenLabs's Conversational AI by setting up a
 * Twilio Media Stream pointed at the signed WSS URL. Twilio handles the
 * μ-law transcoding; ElevenLabs handles the rest.
 *
 * NOTE: the `<Stream>` URL must be `wss://` — `getSignedConversationUrl`
 * returns the right scheme already.
 */
export function buildBridgeToElevenLabsTwiml(signedUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(signedUrl)}"/>
  </Connect>
</Response>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
