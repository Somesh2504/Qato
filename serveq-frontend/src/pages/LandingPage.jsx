// src/pages/LandingPage.jsx
// Brand: QRAVE
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, ArrowRight, ChevronRight } from 'lucide-react';
import { Player } from '@lottiefiles/react-lottie-player';
import scanToOrderAnimation from '../assets/scan-to-order.json';
import BottomSheet from '../components/ui/BottomSheet';
import Button from '../components/ui/Button';
import './LandingPage.css';

const FOOD_EMOJIS = ['🍕', '🍔', '🍜', '🥘', '🍛', '🍣', '🥗', '🍰', '🧁', '🍩', '🥐', '🌮'];

const FEATURES = [
  {
    icon: '📱',
    color: 'orange',
    title: 'QR Code Menu',
    desc: 'Generate stunning QR codes instantly. Customers scan and browse your full menu on their phones.',
  },
  {
    icon: '⚡',
    color: 'green',
    title: 'Real-time Orders',
    desc: 'Orders flow straight to your dashboard in real-time. No missed orders or miscommunication.',
  },
  {
    icon: '📊',
    color: 'blue',
    title: 'Smart Analytics',
    desc: 'Track revenue, popular items, peak hours and more with beautiful visual analytics.',
  },
  {
    icon: '💳',
    color: 'purple',
    title: 'Payment Integration',
    desc: 'Accept payments seamlessly with Razorpay integration. UPI, cards, wallets — all supported.',
  },
  {
    icon: '🍽️',
    color: 'amber',
    title: 'Menu Management',
    desc: 'Add categories, items, prices with a simple drag-and-drop interface. Update anytime.',
  },
  {
    icon: '🌟',
    color: 'rose',
    title: 'Customer Ratings',
    desc: 'Collect feedback and ratings after every order to improve your service continuously.',
  },
];

const TESTIMONIALS = [
  {
    name: 'Rajesh Kumar',
    role: 'Owner, Spice Garden',
    initials: 'RK',
    text: 'QRAVE transformed how we take orders. Our efficiency went up 40% and customers love the QR experience!',
  },
  {
    name: 'Priya Sharma',
    role: 'Manager, Tandoor House',
    initials: 'PS',
    text: 'Setting up was incredibly easy. Within 10 minutes we had our full menu live with QR codes printed.',
  },
  {
    name: 'Amit Patel',
    role: 'Owner, Chai & More',
    initials: 'AP',
    text: 'The analytics dashboard alone is worth it. Now I know what sells and when. Brilliant platform!',
  },
];

const NAV_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Privacy Policy', href: '/privacy' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [nativeInstallSupported, setNativeInstallSupported] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isAppleDevice, setIsAppleDevice] = useState(false);
  const sectionsRef = useRef([]);

  useEffect(() => {
    const ua = window.navigator.userAgent || '';
    const appleByUA = /iphone|ipad|ipod/i.test(ua);
    const touchMac = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
    setIsAppleDevice(appleByUA || touchMac);

    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      setNativeInstallSupported(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (isStandalone) return;
    const t = window.setTimeout(() => setInstallSheetOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [isStandalone]);

  const handleInstallClick = async () => {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {
      // ignore
    } finally {
      setDeferredInstallPrompt(null);
      setNativeInstallSupported(false);
      setInstallSheetOpen(false);
    }
  };

  // Track scroll for navbar styling
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    const elements = document.querySelectorAll('.scroll-animate');
    elements.forEach((el) => observer.observe(el));
    return () => elements.forEach((el) => observer.unobserve(el));
  }, []);

  // Close mobile menu on resize
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleNavClick = (e, href) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      setMobileMenuOpen(false);
      const el = document.querySelector(href);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="landing-page" style={{ background: '#FFFFFF' }}>
      {/* ── Floating Food Particles ─────────────────────────── */}
      {FOOD_EMOJIS.map((emoji, i) => (
        <span key={i} className="food-particle" aria-hidden="true">
          {emoji}
        </span>
      ))}

      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <Link to="/" className="nav-logo" onClick={(e) => handleNavClick(e, '#home')}>
            <img src="/logo.jpg" alt="QRAVE Logo" className="w-8 h-8 rounded-lg object-contain" />
            QRAVE
          </Link>

          <ul className="nav-links">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                {link.href.startsWith('#') ? (
                  <a href={link.href} onClick={(e) => handleNavClick(e, link.href)}>
                    {link.label}
                  </a>
                ) : (
                  <Link to={link.href}>{link.label}</Link>
                )}
              </li>
            ))}
          </ul>

          <div className="nav-actions">
            <button className="nav-login-btn" onClick={() => navigate('/login')}>
              Login
            </button>
            <button className="nav-register-btn" onClick={() => navigate('/signup')}>
              Register
            </button>
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Nav ─────────────────────────────────────── */}
      <div
        className={`mobile-nav-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      <div className={`mobile-nav-panel ${mobileMenuOpen ? 'open' : ''}`}>
        <button className="mobile-nav-close" onClick={() => setMobileMenuOpen(false)}>
          ✕
        </button>
        {NAV_LINKS.map((link) =>
          link.href.startsWith('#') ? (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
            >
              {link.label}
            </a>
          ) : (
            <Link key={link.label} to={link.href} onClick={() => setMobileMenuOpen(false)}>
              {link.label}
            </Link>
          )
        )}
        <div className="mobile-nav-divider" />
        <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
          Login
        </Link>
        <Link
          to="/signup"
          className="nav-register-btn"
          onClick={() => setMobileMenuOpen(false)}
        >
          Register
        </Link>
      </div>

      {/* ══════════════════════════════════════════════════════
          HERO SECTION
          ══════════════════════════════════════════════════════ */}
      <section className="hero-section" id="home">
        <div className="hero-bg-decoration">
          <div className="circle-1" />
          <div className="circle-2" />
          <div className="grid-pattern" />
        </div>

        {/* ── Hero Floating Food Items ──────────────────────── */}
        <div className="hero-floating-foods" aria-hidden="true">
          <span className="hero-food-item" style={{top:'12%',left:'5%',fontSize:'3rem',animationDelay:'0s',animationDuration:'6s'}}>🍕</span>
          <span className="hero-food-item" style={{top:'18%',right:'8%',fontSize:'2.5rem',animationDelay:'1s',animationDuration:'7s'}}>🍔</span>
          <span className="hero-food-item" style={{top:'55%',left:'3%',fontSize:'2.8rem',animationDelay:'2s',animationDuration:'5s'}}>🍛</span>
          <span className="hero-food-item" style={{top:'60%',right:'5%',fontSize:'2.2rem',animationDelay:'0.5s',animationDuration:'8s'}}>🍜</span>
          <span className="hero-food-item" style={{top:'35%',left:'10%',fontSize:'2rem',animationDelay:'3s',animationDuration:'6.5s'}}>🥘</span>
          <span className="hero-food-item" style={{top:'40%',right:'12%',fontSize:'2.6rem',animationDelay:'1.5s',animationDuration:'5.5s'}}>🍣</span>
          <span className="hero-food-item" style={{top:'75%',left:'15%',fontSize:'2rem',animationDelay:'4s',animationDuration:'7.5s'}}>🌮</span>
          <span className="hero-food-item" style={{top:'80%',right:'15%',fontSize:'2.3rem',animationDelay:'2.5s',animationDuration:'6s'}}>🍰</span>
        </div>

        <div className="hero-content">
          <div className="hero-qato-badge" style={{marginBottom: '20px'}}>
            <span style={{fontFamily:"'Outfit','Inter',sans-serif",fontSize:'clamp(3rem,8vw,5rem)',fontWeight:800,color:'#FF6B35',letterSpacing:'-0.03em',lineHeight:1,display:'block',textAlign:'center'}}>QRAVE</span>
            <span style={{display:'block',textAlign:'center',fontSize:'0.85rem',color:'#888',fontWeight:500,marginTop:'4px',letterSpacing:'0.1em',textTransform:'uppercase'}}>Smart Food Ordering</span>
          </div>

          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Trusted by 500+ restaurants across India
          </div>

          <h1 className="hero-title">
            Revolutionize Your Restaurant with{' '}
            <span className="gradient-text">Smart QR Ordering</span>
          </h1>

          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: '20px 0 10px' }}>
            <Player
              autoplay
              loop
              src={scanToOrderAnimation}
              style={{ width: '100%', maxWidth: '350px', height: 'auto' }}
            />
          </div>

          <p className="hero-subtitle">
            Transform your restaurant experience with digital menus, instant QR ordering,
            real-time kitchen updates, and powerful analytics — all in one platform.
          </p>

          <div className="hero-cta-group">
            <Link to="/signup" className="hero-cta-primary">
              Get Started Free
              <ArrowRight size={20} />
            </Link>
            <a href="#features" className="hero-cta-secondary" onClick={(e) => handleNavClick(e, '#features')}>
              See Features
              <ChevronRight size={18} />
            </a>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">500+</div>
              <div className="hero-stat-label">Restaurants</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">50K+</div>
              <div className="hero-stat-label">Orders Served</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">4.9★</div>
              <div className="hero-stat-label">User Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FEATURES SECTION
          ══════════════════════════════════════════════════════ */}
      <section className="features-section" id="features">
        <div className="section-container">
          <div className="section-header scroll-animate animate-fade-in-up">
            <div className="section-eyebrow">✨ Features</div>
            <h2 className="section-title">Everything You Need to Go Digital</h2>
            <p className="section-desc">
              A complete suite of tools designed specifically for Indian restaurants
              to streamline operations and delight customers.
            </p>
          </div>

          <div className="features-grid">
            {FEATURES.map((feat, i) => (
              <div
                key={feat.title}
                className="feature-card scroll-animate animate-fade-in-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className={`feature-icon ${feat.color}`}>{feat.icon}</div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          HOW IT WORKS SECTION
          ══════════════════════════════════════════════════════ */}
      <section className="how-section" id="how-it-works">
        <div className="section-container">
          <div className="section-header scroll-animate animate-fade-in-up">
            <div className="section-eyebrow">🚀 How It Works</div>
            <h2 className="section-title">Go Live in 3 Simple Steps</h2>
            <p className="section-desc">
              Setting up your digital restaurant takes less than 10 minutes.
              No technical skills required.
            </p>
          </div>

          <div className="steps-container">
            <div className="step-card scroll-animate animate-fade-in-up delay-100">
              <span className="step-emoji">📝</span>
              <div className="step-number">1</div>
              <h3>Sign Up Free</h3>
              <p>Create your account in seconds with email or Google sign-in.</p>
              <div className="step-connector">
                <ChevronRight size={20} />
              </div>
            </div>

            <div className="step-card scroll-animate animate-fade-in-up delay-300">
              <span className="step-emoji">🍽️</span>
              <div className="step-number">2</div>
              <h3>Set Up Your Menu</h3>
              <p>Add your dishes, categories, and prices using our intuitive wizard.</p>
              <div className="step-connector">
                <ChevronRight size={20} />
              </div>
            </div>

            <div className="step-card scroll-animate animate-fade-in-up delay-500">
              <span className="step-emoji">🎉</span>
              <div className="step-number">3</div>
              <h3>Go Live!</h3>
              <p>Print your QR code, place it on tables, and start receiving orders.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          PRICING SECTION
          ══════════════════════════════════════════════════════ */}
      <section className="pricing-section" id="pricing">
        <div className="section-container">
          <div className="section-header scroll-animate animate-fade-in-up">
            <div className="section-eyebrow">💰 Pricing</div>
            <h2 className="section-title">Simple, Transparent Pricing</h2>
            <p className="section-desc">
              Start free, then unlock the inaugural offer for premium access at a lower launch price.
            </p>
          </div>

          <div className="pricing-card scroll-animate animate-scale-in delay-200">
            <div className="pricing-badge">Inaugural Offer · 33.33% Off</div>
            <div className="pricing-amount">
              ₹1,000 <span>/ month</span>
            </div>
            <p className="pricing-desc">Original price ₹1,500. Launch offer available for a limited time only.</p>

            <ul className="pricing-features">
              {[
                'Unlimited QR code menus',
                'Real-time order dashboard',
                'UPI & Cash payments',
                'Advanced analytics & reports',
                'Priority support access',
                'Mobile-optimized menus',
                'Customer rating system',
                'No hidden charges during the offer period',
              ].map((feat) => (
                <li key={feat}>
                  <span className="pricing-check">✓</span>
                  {feat}
                </li>
              ))}
            </ul>

            <button className="pricing-cta" onClick={() => navigate('/signup')}>
              Claim Inaugural Offer
              <ArrowRight size={18} style={{ marginLeft: 8, verticalAlign: 'middle' }} />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          TESTIMONIALS SECTION
          ══════════════════════════════════════════════════════ */}
      <section className="testimonials-section">
        <div className="section-container">
          <div className="section-header scroll-animate animate-fade-in-up">
            <div className="section-eyebrow">💬 Testimonials</div>
            <h2 className="section-title">Loved by Restaurant Owners</h2>
            <p className="section-desc">
              See what restaurant owners across India have to say about QRAVE.
            </p>
          </div>

          <div className="testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={t.name}
                className="testimonial-card scroll-animate animate-fade-in-up"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                <div className="testimonial-stars">★★★★★</div>
                <blockquote>"{t.text}"</blockquote>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{t.initials}</div>
                  <div className="testimonial-info">
                    <strong>{t.name}</strong>
                    <span>{t.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FINAL CTA SECTION
          ══════════════════════════════════════════════════════ */}
      <section className="cta-section">
        <div className="cta-content scroll-animate animate-fade-in-up">
          <span className="cta-emoji animate-wiggle">🚀</span>
          <h2 className="cta-title">Ready to Transform Your Restaurant?</h2>
          <p className="cta-desc">
            Join 500+ restaurant owners who have already switched to smart
            QR ordering with QRAVE. Set up in minutes, completely free.
          </p>
          <Link to="/signup" className="cta-btn">
            Register Your Restaurant
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER
          ══════════════════════════════════════════════════════ */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="footer-brand-logo">
                <img src="/logo.jpg" alt="QRAVE Logo" className="w-8 h-8 rounded-lg object-contain" />
                QRAVE
              </div>
              <p>
                QRAVE — Smart QR-based food ordering platform for Indian restaurants.
                Scan, order, and enjoy without the wait.
              </p>
            </div>

            <div className="footer-links-group">
              <div className="footer-col">
                <h4>Product</h4>
                <ul>
                  <li>
                    <a href="#features" onClick={(e) => handleNavClick(e, '#features')}>
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#pricing" onClick={(e) => handleNavClick(e, '#pricing')}>
                      Pricing
                    </a>
                  </li>
                  <li>
                    <a href="#how-it-works" onClick={(e) => handleNavClick(e, '#how-it-works')}>
                      How It Works
                    </a>
                  </li>
                </ul>
              </div>
              <div className="footer-col">
                <h4>Company</h4>
                <ul>
                  <li>
                    <Link to="/privacy">Privacy Policy</Link>
                  </li>
                  <li>
                    <a href="mailto:support@serveq.in">Contact</a>
                  </li>
                </ul>
              </div>
              <div className="footer-col">
                <h4>Get Started</h4>
                <ul>
                  <li>
                    <Link to="/signup">Register</Link>
                  </li>
                  <li>
                    <Link to="/login">Login</Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p>© {new Date().getFullYear()} QRAVE. All rights reserved.</p>
            <div className="footer-social">
              <a href="#" aria-label="Twitter" title="Twitter">𝕏</a>
              <a href="#" aria-label="Instagram" title="Instagram">📷</a>
              <a href="#" aria-label="LinkedIn" title="LinkedIn">in</a>
            </div>
          </div>
        </div>
      </footer>

      <BottomSheet
        isOpen={installSheetOpen && !isStandalone}
        onClose={() => setInstallSheetOpen(false)}
        title="Install QRAVE App"
        maxHeight="70vh"
        showHandle={false}
      >
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-700">
            Install QRAVE on your device for a faster app-like experience.
          </p>

          {nativeInstallSupported ? (
            <Button variant="primary" fullWidth onClick={handleInstallClick} className="min-h-[44px]">
              Download App
            </Button>
          ) : (
            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
              {isAppleDevice ? (
                <>
                  <p className="font-semibold text-gray-700">On iPhone or iPad:</p>
                  <p>Open in Safari, tap Share, then tap Add to Home Screen.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-700">Install from your browser menu:</p>
                  <p>Look for Install App or Add to Home Screen in browser options.</p>
                </>
              )}
            </div>
          )}

          <Button variant="outline" fullWidth onClick={() => setInstallSheetOpen(false)} className="min-h-[44px]">
            Not now
          </Button>
        </div>
      </BottomSheet>

      {/* ── Scroll Animation Trigger (inline style tag for in-view) ── */}
      <style>{`
        .scroll-animate {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .scroll-animate.in-view {
          opacity: 1;
          transform: translateY(0) translateX(0) scale(1);
        }
      `}</style>
    </div>
  );
}
