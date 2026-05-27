import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { LegalShell, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy · VoiceFlow',
  description: 'How VoiceFlow collects, uses, and protects your data.',
  path: '/legal/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="May 2026">
      <LegalSection title="Data we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account info:</strong> your email and name.</li>
          <li><strong>Agent configurations:</strong> templates, business details, FAQs, prompts, and voice selections.</li>
          <li><strong>Call transcripts:</strong> the text of conversations handled by your agents.</li>
          <li><strong>Captures:</strong> structured data your agents collect (e.g. leads and bookings).</li>
        </ul>
      </LegalSection>

      <LegalSection title="BYOK data handling">
        <p>
          We encrypt your ElevenLabs and Twilio credentials with AES-256-GCM. We use these only to
          make API calls on your behalf. We never use them for any other purpose, and we never log or
          display them in plaintext.
        </p>
      </LegalSection>

      <LegalSection title="Data retention">
        <p>
          Calls and Captures are retained until you delete them or close your account. Error logs
          auto-delete after 30 days. When you close your account, we delete your data within a
          reasonable period, except where retention is required by law.
        </p>
      </LegalSection>

      <LegalSection title="Third parties">
        <p>We rely on the following processors to provide the Service:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>ElevenLabs</strong> — voice (your account)</li>
          <li><strong>Twilio</strong> — telephony (your account)</li>
          <li><strong>Stripe</strong> — payment processing</li>
          <li><strong>Resend</strong> — transactional email</li>
          <li><strong>MongoDB Atlas</strong> — data storage</li>
          <li><strong>Vercel</strong> — hosting</li>
          <li><strong>OpenRouter / Anthropic</strong> — post-call summaries</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can export or delete your data at any time, and you may contact us with any privacy
          request. Depending on your jurisdiction you may have additional rights to access, correct,
          or restrict processing of your personal data.
        </p>
        <p>
          To exercise any of these rights, email{' '}
          <a className="text-voice underline-offset-4 hover:underline" href="mailto:hello@voiceflow.app">
            hello@voiceflow.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
