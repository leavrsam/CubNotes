import React from 'react';
import Link from 'next/link';
import { Shield, ArrowLeft, Lock, Trash2, Mail, FileText, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | Motif',
  description: 'Privacy Policy and Data Protection Practices for Motif by Wolf Cub Ventures.',
};

export default function PrivacyPolicyPage() {
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
            <Shield size={14} />
            <span>Official Policy</span>
          </div>
        </div>

        {/* Title & Introduction */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Privacy Policy
          </h1>
          <p className="text-sm text-zinc-400">
            Effective Date: {lastUpdated} • Operated by Wolf Cub Ventures LLC (&quot;Motif&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
          </p>
          <p className="text-base text-zinc-300 leading-relaxed pt-2">
            At Motif, we believe your personal notes, meeting recordings, and intellectual property belong exclusively to you. This Privacy Policy details how we collect, process, store, and protect your information when you use our web platform, mobile applications, and native desktop clients.
          </p>
        </div>

        {/* Highlight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Lock size={16} />
            </div>
            <h3 className="text-sm font-semibold text-white">Encrypted & Private</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              All communications are encrypted in transit via TLS 1.3 and at rest with industry-standard AES-256.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-400 flex items-center justify-center">
              <Shield size={16} />
            </div>
            <h3 className="text-sm font-semibold text-white">No Model Training</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              We never sell your personal data or use your private notes and recordings to train public foundation AI models.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Trash2 size={16} />
            </div>
            <h3 className="text-sm font-semibold text-white">Full Control & Deletion</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              You can permanently delete your notes, audio recordings, or entire account at any time with complete data purging.
            </p>
          </div>
        </div>

        {/* Main Content Sections */}
        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">1.</span> Information We Collect
            </h2>
            <p>We collect only the information necessary to provide you with note-taking, live meeting transcription, and collaborative workspace features:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li><strong className="text-zinc-200">Account Credentials:</strong> Email address, optional profile name, and authentication tokens managed securely through Supabase Auth.</li>
              <li><strong className="text-zinc-200">User Content:</strong> Text documents, canvas drawings, shapes, images, uploaded attachments, and organization structures (notebooks, sections, pages).</li>
              <li><strong className="text-zinc-200">Audio & Voice Recordings:</strong> Audio captured through your microphone when you deliberately initiate a recording or meeting transcription.</li>
              <li><strong className="text-zinc-200">AI-Generated Derivatives:</strong> Automated speech-to-text transcripts, meeting summaries, action items, and semantic embeddings created on your behalf.</li>
              <li><strong className="text-zinc-200">Device & Usage Diagnostics:</strong> Crash logs, application version, operating system, and performance telemetry used strictly for stability troubleshooting.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">2.</span> How Audio & Voice Data Is Handled
            </h2>
            <p>
              Microphone access is requested solely for user-initiated audio recordings and meeting documentation. Motif does not listen to or record ambient conversations in the background without your explicit action.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li><strong className="text-zinc-200">Foreground Notification:</strong> On Android devices, an active recording displays a persistent notification with visible recording status and stop controls.</li>
              <li><strong className="text-zinc-200">Audio Retention & Expiration:</strong> Meeting audio recordings are ephemeral by default and automatically scheduled for deletion after 7 days unless you deliberately save them permanently or mark them as a journal entry.</li>
              <li><strong className="text-zinc-200">Immediate User Deletion:</strong> You can delete any audio block at any moment, which immediately purges the binary file from our cloud storage.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">3.</span> AI Subprocessors & Third-Party Service Providers
            </h2>
            <p>We work with trusted infrastructure providers who adhere to strict confidentiality and security agreements:</p>
            <div className="space-y-2 pt-1">
              <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
                <span className="font-semibold text-white">Google Gemini API (Google LLC):</span>
                <p className="text-xs text-zinc-400 mt-0.5">Used for speech-to-text transcription, text summarization, and semantic embeddings. Google does not use customer data submitted via the Gemini API to train Google models.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
                <span className="font-semibold text-white">Supabase Inc.:</span>
                <p className="text-xs text-zinc-400 mt-0.5">Provides user authentication, encrypted PostgreSQL database management, and real-time collaboration with strict Row Level Security (RLS).</p>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
                <span className="font-semibold text-white">Amazon Web Services (AWS S3) / Cloudflare:</span>
                <p className="text-xs text-zinc-400 mt-0.5">Encrypted cloud object storage for user media, attachments, and audio recordings.</p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">4.</span> Your Rights & Account Deletion (GDPR & CCPA)
            </h2>
            <p>
              Under global data privacy laws including the General Data Protection Regulation (GDPR) and California Consumer Privacy Act (CCPA), you retain full rights over your personal data:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li><strong className="text-zinc-200">Right to Access & Portability:</strong> You can export your notes, reports, and data in standard Markdown or document formats.</li>
              <li><strong className="text-zinc-200">Right to Erasure (Account Deletion):</strong> You may permanently delete your account and all associated data at any time directly in the app under <code className="text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded">Settings &gt; Danger Zone &gt; Delete Account</code> or via our dedicated web deletion portal at <Link href="/delete-account" className="text-primary-400 hover:underline">motif.wolfcubventures.com/delete-account</Link>.</li>
              <li><strong className="text-zinc-200">No Sale of Personal Information:</strong> We do not sell, rent, or monetize your personal information to third-party data brokers or advertisers.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">5.</span> Children&apos;s Privacy (COPPA Compliance)
            </h2>
            <p>
              Motif is intended for business professionals, students, and general productivity users aged 13 and older (or 16 in the European Economic Area). We do not knowingly collect or solicit personal data from children under 13. If you believe a minor has registered an account without appropriate consent, please contact us immediately for prompt deletion.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">6.</span> Security Architecture
            </h2>
            <p>
              We enforce administrative, technical, and physical safeguards designed to protect your data against accidental loss, unauthorized access, and malicious modification. All data transmitted between client devices and cloud servers is encrypted using modern TLS cryptographic protocols, and databases enforce isolated tenant boundaries via Row Level Security.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3 border-t border-zinc-800 pt-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-primary-400">7.</span> Contact & Inquiries
            </h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or your data rights, please contact our privacy compliance team at:
            </p>
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-1">
              <p className="font-semibold text-white">Wolf Cub Ventures LLC — Privacy Officer</p>
              <p className="text-zinc-400">Email: <a href="mailto:privacy@wolfcubventures.com" className="text-primary-400 hover:underline">privacy@wolfcubventures.com</a></p>
              <p className="text-zinc-400">Support: <a href="mailto:support@wolfcubventures.com" className="text-primary-400 hover:underline">support@wolfcubventures.com</a></p>
              <p className="text-zinc-400">Website: <a href="https://motif.wolfcubventures.com" className="text-primary-400 hover:underline">https://motif.wolfcubventures.com</a></p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800/80 pt-6 text-center text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} Wolf Cub Ventures LLC. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors text-zinc-300">Privacy Policy</Link>
            <span>•</span>
            <Link href="/delete-account" className="hover:text-zinc-300 transition-colors">Delete Account</Link>
          </div>
        </div>

      </div>
    </div>
  );
}
