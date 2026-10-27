import React from 'react';
import Link from 'next/link';
import { FileText, ArrowLeft, AlertTriangle, ShieldCheck, Scale, Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service | Motif',
  description: 'Terms of Service, Audio Recording Wiretap Disclaimers, and Usage Agreement for Motif by Wolf Cub Ventures.',
};

export default function TermsOfServicePage() {
  const lastUpdated = "October 26, 2026";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-primary-500/30">
      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to Motif</span>
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-primary-500/10 text-primary-400 border border-primary-500/20">
            <Scale size={14} />
            <span>Legal Agreement</span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Terms of Service
          </h1>
          <p className="text-sm text-zinc-400">
            Effective Date: {lastUpdated} • Operated by Wolf Cub Ventures LLC (&quot;Motif&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
          </p>
          <p className="text-base text-zinc-300 leading-relaxed pt-2">
            Please read these Terms of Service (&quot;Terms&quot;) carefully before using Motif applications, websites, and associated services (&quot;Services&quot;). By creating an account or accessing our Services, you agree to be legally bound by these Terms.
          </p>
        </div>

        {/* Wiretapping & Recording Critical Legal Notice Card */}
        <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-200 space-y-3">
          <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm sm:text-base">
            <AlertTriangle size={20} className="shrink-0" />
            <span>Important Legal Notice: Audio Recording &amp; Wiretapping Laws</span>
          </div>
          <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
            Many jurisdictions (including at least 11 U.S. states such as California, Florida, Illinois, Pennsylvania, Massachusetts, Washington, Maryland, Connecticut, Montana, New Hampshire, and Delaware, as well as international jurisdictions under GDPR) have <strong>two-party or all-party consent laws</strong> that make it a crime to record audio or conversations without the knowledge and consent of all participants. You are strictly responsible for complying with all applicable recording laws and obtaining all required consents prior to recording.
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">1.</span> User Eligibility &amp; Accounts
            </h2>
            <p>
              To access Motif, you must be at least 13 years of age (or 16 in certain international jurisdictions). By registering, you agree that all information provided is accurate and that you are responsible for maintaining the confidentiality of your login credentials. You are solely responsible for all activities that occur under your account.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">2.</span> Audio Recording &amp; Participant Consent Obligations
            </h2>
            <p>
              Motif provides audio capture, transcription, and meeting summarization tools. Your use of these features is conditioned on the following strict commitments:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li>
                <strong className="text-zinc-200">Consent Obligation:</strong> You represent and warrant that before initiating any recording of a conversation, meeting, lecture, or phone call, you have provided clear notice and obtained any and all legally required consents from all participating individuals.
              </li>
              <li>
                <strong className="text-zinc-200">Compliance with Wiretap Statutes:</strong> You agree to abide by all local, state, federal, and international wiretapping, eavesdropping, and biometric privacy laws (e.g., California Penal Code § 632, Illinois Biometric Information Privacy Act).
              </li>
              <li>
                <strong className="text-zinc-200">Indemnification:</strong> You agree to fully indemnify, defend, and hold harmless Wolf Cub Ventures LLC, its officers, directors, employees, and licensors from any and all claims, regulatory investigations, fines, damages, or liabilities arising out of your failure to obtain required consent or your violation of wiretapping and privacy laws.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">3.</span> Intellectual Property &amp; Content Ownership
            </h2>
            <p>
              <strong className="text-white">You own your data.</strong> You retain full intellectual property ownership of all notes, documents, audio recordings, images, and text you input into Motif. We do not claim any ownership rights over your content.
            </p>
            <p className="text-zinc-400">
              By using the Services, you grant Motif a limited, worldwide, non-exclusive license solely to host, store, transfer, and process your content as strictly required to provide and improve the Services (e.g., synchronizing across devices and generating requested AI transcriptions).
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">4.</span> Artificial Intelligence (AI) Features &amp; Disclaimers
            </h2>
            <p>
              Motif utilizes third-party artificial intelligence technologies, including Google Gemini API, to provide speech recognition, automated summaries, flowchart generation, and conversational search.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li><strong className="text-zinc-200">No Professional Advice:</strong> AI-generated outputs are for informational and productivity purposes only and do not constitute legal, medical, financial, or engineering advice.</li>
              <li><strong className="text-zinc-200">Inherent AI Limitations:</strong> Generative AI models can occasionally produce hallucinations, omissions, or inaccuracies. You should independently verify critical business decisions or factual claims.</li>
              <li><strong className="text-zinc-200">Reporting Prohibited AI Content:</strong> You may report inaccurate, harmful, or prohibited AI responses directly in the app via the reporting button or by emailing <a href="mailto:support@wolfcubventures.com" className="text-primary-400 hover:underline">support@wolfcubventures.com</a>.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">5.</span> Acceptable Use Policy
            </h2>
            <p>You agree not to misuse Motif or assist others in doing so. You will not:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Use the Services for unlawful covert surveillance or unauthorized wiretapping.</li>
              <li>Generate, upload, or transmit hate speech, harassment, sexually explicit material involving minors (CSAM), or threats of violence.</li>
              <li>Attempt to reverse-engineer, decompile, or compromise the security of our infrastructure or APIs.</li>
              <li>Interfere with real-time collaboration or disrupt service availability for other users.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">6.</span> Account Deletion &amp; Data Purging
            </h2>
            <p>
              You may terminate your account at any time. Upon selecting &quot;Delete Account&quot; in the Settings menu or through our web portal at <Link href="/delete-account" className="text-primary-400 hover:underline">motif.wolfcubventures.com/delete-account</Link>, your account credentials, notebooks, documents, page versions, and audio files will be permanently purged from active databases.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">7.</span> Disclaimer of Warranties &amp; Limitation of Liability
            </h2>
            <p className="uppercase text-xs text-zinc-400 tracking-wide font-mono">
              THE SERVICES ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WOLF CUB VENTURES LLC DISCLAIMS ALL WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL WOLF CUB VENTURES LLC BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICES OR THIRD-PARTY RECORDINGS.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3 border-t border-zinc-800 pt-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">8.</span> Governing Law &amp; Dispute Resolution
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Utah, United States, without regard to conflict of law principles. Any legal action or proceeding arising under these Terms shall be brought exclusively in the courts located in Utah.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3 border-t border-zinc-800 pt-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">9.</span> Contact Us
            </h2>
            <p>For questions or notices regarding these Terms, contact us at:</p>
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-1">
              <p className="font-semibold text-white">Wolf Cub Ventures LLC</p>
              <p className="text-zinc-400">Email: <a href="mailto:support@wolfcubventures.com" className="text-primary-400 hover:underline">support@wolfcubventures.com</a></p>
              <p className="text-zinc-400">Legal: <a href="mailto:legal@wolfcubventures.com" className="text-primary-400 hover:underline">legal@wolfcubventures.com</a></p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800/80 pt-6 text-center text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} Wolf Cub Ventures LLC. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <Link href="/terms" className="hover:text-zinc-300 transition-colors text-zinc-300">Terms of Service</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link href="/delete-account" className="hover:text-zinc-300 transition-colors">Delete Account</Link>
          </div>
        </div>

      </div>
    </div>
  );
}
