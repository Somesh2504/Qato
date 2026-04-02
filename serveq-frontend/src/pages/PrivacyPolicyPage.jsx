// src/pages/PrivacyPolicyPage.jsx
import { Link } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }}>
      {/* Simple top bar */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid #f0f0f0',
          padding: '14px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 800,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              fontFamily: "'Outfit','Inter',sans-serif",
              fontWeight: 700,
              fontSize: '1.2rem',
              color: '#1A1A2E',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #FF6B35, #FF8F5E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 4px 12px rgba(255,107,53,0.3)',
              }}
            >
              <Zap size={16} />
            </div>
            QATO
          </Link>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.88rem',
              fontWeight: 500,
              color: '#FF6B35',
              textDecoration: 'none',
              padding: '8px 16px',
              borderRadius: 10,
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,107,53,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '48px 24px 80px',
          fontFamily: "'Inter',sans-serif",
        }}
      >
        <h1
          style={{
            fontFamily: "'Outfit','Inter',sans-serif",
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 800,
            color: '#1A1A2E',
            marginBottom: 8,
            letterSpacing: '-0.01em',
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: '#999', fontSize: '0.9rem', marginBottom: 40 }}>
          Last updated: April 2026
        </p>

        <div style={{ color: '#444', fontSize: '0.95rem', lineHeight: 1.75 }}>
          <Section title="1. Introduction">
            Welcome to QATO ("we", "our", or "us"). We are committed to protecting your
            personal information and your right to privacy. This Privacy Policy explains
            what information we collect, how we use it, and what rights you have in
            relation to it.
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect information that you provide directly to us, including:</p>
            <ul style={ulStyle}>
              <li>Account information (email address, password)</li>
              <li>Restaurant profile information (name, phone, address, logo)</li>
              <li>Menu data (categories, items, prices)</li>
              <li>Order data and transaction history</li>
              <li>Customer contact information for order fulfillment</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              We also automatically collect certain technical data when you use our
              service, including browser type, IP address, device information, and usage
              analytics.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul style={ulStyle}>
              <li>Provide, maintain, and improve our services</li>
              <li>Process orders and payments</li>
              <li>Send you technical notices and support messages</li>
              <li>Generate analytics and reports for your dashboard</li>
              <li>Detect, investigate, and prevent fraudulent activities</li>
              <li>Comply with legal obligations</li>
            </ul>
          </Section>

          <Section title="4. Data Storage & Security">
            Your data is stored securely using Supabase infrastructure with
            industry-standard encryption. We implement appropriate technical and
            organizational measures to protect your personal information against
            unauthorized access, alteration, disclosure, or destruction.
          </Section>

          <Section title="5. Third-Party Services">
            <p>We may share your information with the following third-party service providers:</p>
            <ul style={ulStyle}>
              <li><strong>Supabase</strong> — Database and authentication services</li>
              <li><strong>Razorpay</strong> — Payment processing</li>
              <li><strong>Google</strong> — OAuth authentication</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              These providers have their own privacy policies governing the use of your
              information.
            </p>
          </Section>

          <Section title="6. Your Rights">
            <p>You have the right to:</p>
            <ul style={ulStyle}>
              <li>Access and receive a copy of your personal data</li>
              <li>Rectify or update inaccurate personal data</li>
              <li>Request deletion of your personal data</li>
              <li>Object to processing of your personal data</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </Section>

          <Section title="7. Cookies">
            We use essential cookies to maintain your session and preferences.
            We do not use third-party tracking cookies or advertising cookies.
          </Section>

          <Section title="8. Changes to This Policy">
            We may update this Privacy Policy from time to time. We will notify you
            of any changes by posting the new policy on this page and updating the
            "Last updated" date above.
          </Section>

          <Section title="9. Contact Us">
            <p>
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p style={{ marginTop: 8 }}>
              <a
                href="mailto:support@serveq.in"
                style={{ color: '#FF6B35', textDecoration: 'none', fontWeight: 600 }}
              >
                support@serveq.in
              </a>
            </p>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: '#1A1A2E',
          padding: '24px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '0.82rem',
        }}
      >
        © {new Date().getFullYear()} QATO. All rights reserved.
      </footer>
    </div>
  );
}

const ulStyle = {
  paddingLeft: 24,
  margin: '8px 0 0',
  lineHeight: 1.9,
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontFamily: "'Outfit','Inter',sans-serif",
          fontSize: '1.25rem',
          fontWeight: 700,
          color: '#1A1A2E',
          margin: '0 0 12px',
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </div>
  );
}
