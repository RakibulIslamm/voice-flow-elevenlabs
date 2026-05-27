import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { LegalShell, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service · VoiceFlow',
  description: 'VoiceFlow terms of service.',
  path: '/legal/terms',
});

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="May 2026">
      <LegalSection title="1. Service description">
        <p>
          VoiceFlow ("the Service") is an orchestration platform that lets you configure and operate
          AI voice agents on your website and, optionally, your phone line. The Service connects to
          third-party providers you bring — primarily ElevenLabs for voice and Twilio for telephony —
          using credentials you supply.
        </p>
      </LegalSection>

      <LegalSection title="2. User accounts">
        <p>
          You are responsible for maintaining the confidentiality of your account and for all
          activity under it. You must provide accurate information and promptly update it as needed.
          You must be at least 18 years old to use the Service.
        </p>
      </LegalSection>

      <LegalSection title="3. Bring-your-own-key (BYOK) responsibility">
        <p>
          You are responsible for your ElevenLabs and Twilio accounts and their billing
          relationships. VoiceFlow charges only its platform fee; all voice and telecom usage is
          billed to you directly by those providers. You are responsible for keeping those accounts
          funded and in good standing. Service interruptions caused by depleted balances, suspended
          third-party accounts, or revoked API keys are outside VoiceFlow's control.
        </p>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Violate any law or the terms of any third-party provider (including ElevenLabs and Twilio);</li>
          <li>Place calls or deploy agents without required disclosures or consent where law requires them;</li>
          <li>Impersonate any person or organization in a deceptive manner;</li>
          <li>Transmit malware, spam, or unlawful, harassing, or fraudulent content;</li>
          <li>Attempt to disrupt, reverse-engineer, or gain unauthorized access to the Service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Fees and billing">
        <p>
          Paid plans are billed in advance on a recurring basis. Plan changes are prorated per the
          billing provider's rules. You may cancel at any time; access continues until the end of the
          current billing period. Fees are non-refundable except where required by law.
        </p>
      </LegalSection>

      <LegalSection title="6. Termination">
        <p>
          You may close your account at any time. We may suspend or terminate access for breach of
          these terms, non-payment, or misuse. On termination, your right to use the Service ends;
          you remain responsible for your separate ElevenLabs and Twilio accounts.
        </p>
      </LegalSection>

      <LegalSection title="7. Disclaimers and limitation of liability">
        <p>
          The Service is provided "as is" without warranties of any kind. To the maximum extent
          permitted by law, VoiceFlow is not liable for indirect, incidental, or consequential
          damages, or for any loss arising from third-party providers, missed or mishandled calls, or
          AI-generated content. Our total liability is limited to the amount you paid VoiceFlow in the
          twelve months preceding the claim.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes to these terms">
        <p>
          We may update these terms from time to time. Material changes will be communicated through
          the Service or by email. Continued use after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          Questions about these terms? Email{' '}
          <a className="text-voice underline-offset-4 hover:underline" href="mailto:hello@voiceflow.app">
            hello@voiceflow.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
