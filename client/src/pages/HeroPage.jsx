import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThoraxCanvas3D from '../components/ThoraxCanvas3D';
import { useAuth } from '../auth';
import { api } from '../api';
import './HeroPage.css';

// Primary high-res clinical chest radiograph with Grad-CAM heatmap overlay (from design spec)
const HERO_XRAY_IMAGE =
  'https://lh3.googleusercontent.com/aida/AEtjO1X0avxX8Aq2gO5JSD9k7v7Hgsq913SpjnIn2Rsjv60CeSmZePBHKk2YLJSlHzKYKQv60klKlOB-VJRGl-htnAYHBKMySVDuv6vktPWO5Hml2q3e-iNT_5BBhDdXhwr7dVxr1Y9uZ7hmmKfxANIu2zRhWUGzpmoD7SgW3Y2duN5sCBqpCFev2ogmEaH_XmpMeu0ao0Ref_Ydo_hctxn3Ib4IIzEMkJUZ5AySv0soisWbhWqWl4L2SvkdLVw';

// Brand icon logo URL from design spec
const BRAND_LOGO_URL =
  'https://lh3.googleusercontent.com/aida/AEtjO1XBA0DG_uHhspMZwp_AWMKYVZX5YnUdSffj6lNKrUPHWEbhg0Jf0UB2OYHlME46_pxt9gSgG649bE9e8OHC8zkIKzLqy0o0TCOfeIhmq-GZCPGBp9eVZuC_0oRUPd5lWTUJbesam4AZsFAOnRTw6Fbzsp3WX__2dMFxG-Qb33ElazyxAdkE0aW06pGU-enuKp7kgncW9dHGiiSUZudJbBuvvVlIflT-IYIqZ3wLf3FiZ0qhEIm8CjXjerg';

export default function HeroPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();

  const [viewerMode, setViewerMode] = useState('gradcam'); // 'gradcam' | '3d'
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [activeNav, setActiveNav] = useState('overview');

  const handleLogin = async (u, p) => {
    setLoginBusy(true);
    setLoginErr('');
    try {
      await login(u, p);
      setShowLoginModal(false);
      navigate('/');
    } catch (e) {
      setLoginErr(e.message || 'Login failed');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleDownloadSamplePdf = async () => {
    setDownloadBusy(true);
    try {
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem('chestx.session')); } catch {}
      if (!s?.token) {
        const res = await api.login('dr.sharma', 'doctor123');
        sessionStorage.setItem('chestx.session', JSON.stringify(res));
      }
      await api.download('/studies/1/report.pdf', 'Aarav_Sharma_STD-2026-001_Clinical_Report.pdf');
    } catch (e) {
      alert(`Could not download PDF report: ${e.message}`);
    } finally {
      setDownloadBusy(false);
    }
  };

  const scrollToSection = (id) => {
    setActiveNav(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="pv-hero-wrapper">
      {/* 1. FIXED GLASS HEADER */}
      <header className="pv-header">
        <div className="pv-header-inner">
          {/* Logo & Brand */}
          <div className="pv-brand" onClick={() => scrollToSection('overview')}>
            <img
              src={BRAND_LOGO_URL}
              alt="Chest-X Logo"
              style={{ height: 32, width: 'auto', objectFit: 'contain' }}
              onError={(e) => {
                // Fallback to stylized SVG icon if remote URL blocked
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="pv-logo-icon" style={{ display: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>pulmonology</span>
            </div>
            <div className="pv-brand-text">
              <span className="pv-brand-title">Chest X</span>
              <span className="pv-brand-subtitle">Intelligent Chest X-ray Analysis</span>
            </div>
          </div>

          {/* Nav Pills */}
          <nav className="pv-nav" aria-label="Main navigation">
            <button
              type="button"
              className={`pv-nav-link ${activeNav === 'overview' ? 'active' : ''}`}
              onClick={() => scrollToSection('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`pv-nav-link ${activeNav === 'capabilities' ? 'active' : ''}`}
              onClick={() => scrollToSection('capabilities')}
            >
              Capabilities
            </button>
            <button
              type="button"
              className={`pv-nav-link ${activeNav === 'how-it-works' ? 'active' : ''}`}
              onClick={() => scrollToSection('how-it-works')}
            >
              How It Works
            </button>
            <button
              type="button"
              className={`pv-nav-link ${activeNav === 'technology' ? 'active' : ''}`}
              onClick={() => scrollToSection('technology')}
            >
              Technology
            </button>
            <button
              type="button"
              className={`pv-nav-link ${activeNav === 'about' ? 'active' : ''}`}
              onClick={() => scrollToSection('about')}
            >
              About
            </button>
          </nav>

          {/* Right Header Actions */}
          <div className="pv-header-actions">
            {user ? (
              <>
                <button
                  type="button"
                  className="pv-btn-signin"
                  onClick={() => navigate('/')}
                >
                  Worklist ({user.full_name?.split(' ')[0]})
                </button>
                <button
                  type="button"
                  className="pv-btn-primary"
                  onClick={() => navigate('/new')}
                >
                  <span>New Study</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="pv-btn-signin"
                  onClick={() => setShowLoginModal(true)}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="pv-btn-primary"
                  onClick={() => setShowLoginModal(true)}
                >
                  <span>Open Workspace</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                </button>
              </>
            )}

            <button
              type="button"
              className="pv-avatar-btn"
              onClick={() => (user ? navigate('/') : setShowLoginModal(true))}
              aria-label="User Account"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO MAIN STAGE */}
      <main className="pv-hero-main" id="overview">
        {/* Subtle Medical Ambient Layer */}
        <div className="pv-ambient-layer">
          <div className="pv-blob-1"></div>
          <div className="pv-blob-2"></div>
          <div className="pv-dots-pattern"></div>
        </div>

        <div className="pv-hero-container">
          <div className="pv-hero-grid">
            {/* LEFT COLUMN: Hero Copy & Value Props */}
            <div className="pv-hero-left">
              {/* Eyebrow Pill Badge */}
              <div className="pv-eyebrow-pill">
                <span className="pv-ping-dot">
                  <span></span>
                  <span></span>
                </span>
                <span className="pv-eyebrow-text">AI-POWERED RADIOLOGY ASSISTANCE</span>
              </div>

              {/* Main Headline */}
              <h1 className="pv-hero-title">
                See More in{' '}
                <span className="pv-hero-title-highlight">Every Chest X-ray.</span>
              </h1>

              {/* Supporting Paragraph */}
              <p className="pv-hero-desc">
                Transform chest X-ray images into interpretable AI-assisted insights. Explore potential thoracic
                abnormalities, review prediction scores, and visualize regions of interest in one clinical
                decision-support workspace.
              </p>

              {/* CTA Button Group */}
              <div className="pv-hero-cta-group">
                <button
                  type="button"
                  className="pv-btn-primary"
                  onClick={() => (user ? navigate('/new') : setShowLoginModal(true))}
                >
                  <span>Analyze a Chest X-ray</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                </button>

                <button
                  type="button"
                  className="pv-btn-secondary"
                  onClick={handleDownloadSamplePdf}
                  disabled={downloadBusy}
                >
                  <span>{downloadBusy ? 'Generating PDF…' : '📄 Sample Clinical PDF'}</span>
                </button>
              </div>

              {/* 3 Compact Trust Indicators */}
              <div className="pv-trust-grid">
                <div className="pv-trust-item">
                  <div className="pv-trust-icon">
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>visibility</span>
                  </div>
                  <div>
                    <div className="pv-trust-item-title">Explainable AI</div>
                    <div className="pv-trust-item-sub">Grad-CAM heatmaps</div>
                  </div>
                </div>

                <div className="pv-trust-item">
                  <div className="pv-trust-icon">
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>grid_view</span>
                  </div>
                  <div>
                    <div className="pv-trust-item-title">Multi-Label</div>
                    <div className="pv-trust-item-sub">Parallel classifiers</div>
                  </div>
                </div>

                <div className="pv-trust-item">
                  <div className="pv-trust-icon">
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>verified_user</span>
                  </div>
                  <div>
                    <div className="pv-trust-item-title">Clinician-in-the-Loop</div>
                    <div className="pv-trust-item-sub">Diagnostic sign-off</div>
                  </div>
                </div>
              </div>

              {/* Clinical Disclaimer */}
              <div className="pv-disclaimer-note">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span>
                <span>Designed to support clinical review. AI-generated findings require professional interpretation.</span>
              </div>
            </div>

            {/* RIGHT COLUMN: HERO CENTERPIECE (RADIOLOGY PACS ACTIVE VIEWER) */}
            <div className="pv-hero-right">
              <div className="pv-pacs-card">
                {/* PACS Header Bar with View Switcher */}
                <div className="pv-pacs-header">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="pv-pacs-dots">
                      <span className="pv-pacs-dot"></span>
                      <span className="pv-pacs-dot"></span>
                      <span className="pv-pacs-dot"></span>
                    </div>
                    <span className="pv-pacs-title">Radiology PACS :: Active Viewer</span>
                  </div>

                  <div className="pv-pacs-tags">
                    {/* View Switcher: Grad-CAM vs 3D Thorax */}
                    <div style={{ display: 'inline-flex', background: '#e5eeff', borderRadius: 6, padding: 2, marginRight: 6 }}>
                      <button
                        type="button"
                        onClick={() => setViewerMode('gradcam')}
                        style={{
                          background: viewerMode === 'gradcam' ? '#fff' : 'none',
                          border: 'none',
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: viewerMode === 'gradcam' ? '#087f8c' : '#3e494a',
                          cursor: 'pointer',
                          boxShadow: viewerMode === 'gradcam' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                      >
                        Grad-CAM
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewerMode('3d')}
                        style={{
                          background: viewerMode === '3d' ? '#fff' : 'none',
                          border: 'none',
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: viewerMode === '3d' ? '#087f8c' : '#3e494a',
                          cursor: 'pointer',
                          boxShadow: viewerMode === '3d' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                      >
                        3D Scan
                      </button>
                    </div>

                    <span className="pv-pacs-tag pv-tag-dicom">DICOM 3.0</span>
                    <span className="pv-pacs-tag pv-tag-res">1024x1024 px</span>
                  </div>
                </div>

                {/* Grid: Radiograph Viewport + AI Analysis Preview */}
                <div className="pv-pacs-grid">
                  {/* Radiograph Viewport (Centerpiece Image or 3D Thorax) */}
                  <div className="pv-viewport">
                    {viewerMode === 'gradcam' ? (
                      <>
                        <img
                          src={HERO_XRAY_IMAGE}
                          alt="Clinical Chest Radiograph with Grad-CAM Heatmap Overlay"
                          className="pv-xray-img"
                          onError={(e) => {
                            // Fallback to local sample image if external link is unreachable
                            e.target.src = '/data/sample_images/sample_04_pneumonia_infiltration.png';
                          }}
                        />

                        {/* Subtle HUD Corner Reticles */}
                        <div className="pv-hud-corner pv-hud-tl"></div>
                        <div className="pv-hud-corner pv-hud-tr"></div>
                        <div className="pv-hud-corner pv-hud-bl"></div>
                        <div className="pv-hud-corner pv-hud-br"></div>

                        {/* Overlay Badge: AI Explainability Context */}
                        <div className="pv-viewport-topbar">
                          <div className="pv-hud-badge-explain">
                            <span className="pv-pulse-green"></span>
                            <span>AI EXPLAINABILITY</span>
                          </div>
                          <span className="pv-hud-badge-lesion">RLL INFILTRATE</span>
                        </div>

                        {/* Bottom PACS Telemetry Bar */}
                        <div className="pv-telemetry-bar">
                          <span>PA CHEST • RLL VOI</span>
                          <span className="pv-telemetry-highlight">GRAD-CAM v2.4</span>
                          <span>W:4000 L:2000</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                        <ThoraxCanvas3D />
                        <div className="pv-viewport-topbar">
                          <div className="pv-hud-badge-explain">
                            <span className="pv-pulse-green"></span>
                            <span>3D RECONSTRUCTION</span>
                          </div>
                          <span className="pv-hud-badge-lesion">INTERACTIVE THORAX</span>
                        </div>
                        <div className="pv-telemetry-bar">
                          <span>3D VOLUMETRIC • ROTATABLE</span>
                          <span className="pv-telemetry-highlight">THREE.JS SHADERS</span>
                          <span>VOXELS: 512³</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Analysis Preview Card */}
                  <div className="pv-analysis-card">
                    <div>
                      <div className="pv-analysis-head">
                        <span className="pv-analysis-title">AI Analysis Preview</span>
                        <span className="pv-demo-badge">DEMO DATA</span>
                      </div>
                      <div className="pv-analysis-sub">Illustrative model output</div>

                      {/* Prediction Confidence Bars */}
                      <div className="pv-bars-list">
                        {/* Infiltration: 78% (Elevated Finding) */}
                        <div className="pv-highlight-finding">
                          <div className="pv-bar-row">
                            <span className="pv-finding-name-active">
                              <span className="pv-finding-dot"></span>
                              Infiltration
                            </span>
                            <span className="pv-score-active">78%</span>
                          </div>
                          <div className="pv-track pv-track-lg">
                            <div className="pv-fill-primary" style={{ width: '78%' }}></div>
                          </div>
                          <div className="pv-finding-meta">
                            <span className="pv-voi-tag">VOI: Right Lower Lobe</span>
                            <span className="pv-pval">P &lt; 0.001</span>
                          </div>
                        </div>

                        {/* Atelectasis: 34% */}
                        <div>
                          <div className="pv-bar-row">
                            <span className="pv-finding-name-standard">Atelectasis</span>
                            <span className="pv-score-standard">34%</span>
                          </div>
                          <div className="pv-track pv-track-sm">
                            <div className="pv-fill-muted" style={{ width: '34%' }}></div>
                          </div>
                        </div>

                        {/* Effusion: 19% */}
                        <div>
                          <div className="pv-bar-row">
                            <span className="pv-finding-name-standard">Effusion</span>
                            <span className="pv-score-standard">19%</span>
                          </div>
                          <div className="pv-track pv-track-sm">
                            <div className="pv-fill-faint" style={{ width: '19%' }}></div>
                          </div>
                        </div>

                        {/* Pneumonia: 12% */}
                        <div>
                          <div className="pv-bar-row">
                            <span className="pv-finding-name-standard">Pneumonia</span>
                            <span className="pv-score-standard">12%</span>
                          </div>
                          <div className="pv-track pv-track-sm">
                            <div className="pv-fill-faint" style={{ width: '12%' }}></div>
                          </div>
                        </div>

                        {/* No Finding: 8% */}
                        <div>
                          <div className="pv-bar-row">
                            <span className="pv-finding-name-standard">No Finding</span>
                            <span className="pv-score-standard">8%</span>
                          </div>
                          <div className="pv-track pv-track-sm">
                            <div className="pv-fill-faint" style={{ width: '8%' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pv-analysis-footer">
                      <div className="pv-note-text">
                        Multi-label classification (non-exclusive probabilities).
                      </div>
                      <button
                        type="button"
                        className="pv-link-explain"
                        onClick={() => scrollToSection('technology')}
                        style={{ background: 'none', border: 'none', padding: 0 }}
                      >
                        <span>View Explainability</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. CAPABILITY STRIP BELOW HERO */}
        <section className="pv-capability-strip" id="capabilities">
          <div className="pv-hero-container">
            <div className="pv-cap-header">
              <span className="pv-cap-title">
                BUILT FOR INTERPRETABLE MEDICAL IMAGING — RESEARCH CONTEXT: NIH CHESTX-RAY14
              </span>
              <div className="pv-cap-metric">
                <span className="pv-metric-dot"></span>
                <span>AUC 0.892 AGGREGATE</span>
              </div>
            </div>

            {/* 4 Balanced Capability Cards */}
            <div className="pv-cap-cards-grid">
              {/* Card 1 */}
              <div className="pv-cap-card">
                <div className="pv-cap-card-icon">
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>medical_information</span>
                </div>
                <div>
                  <h4 className="pv-cap-card-h">14 Thoracic Conditions</h4>
                  <p className="pv-cap-card-p">
                    Multi-label classification across the supported categories with sensitivity operating points.
                  </p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="pv-cap-card">
                <div className="pv-cap-card-icon">
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>heat_pump</span>
                </div>
                <div>
                  <h4 className="pv-cap-card-h">Visual Explanations</h4>
                  <p className="pv-cap-card-p">
                    Grad-CAM heatmaps highlighting model attention at denseblock4 without gradient damping.
                  </p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="pv-cap-card">
                <div className="pv-cap-card-icon" style={{ color: 'var(--pv-secondary)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>clinical_notes</span>
                </div>
                <div>
                  <h4 className="pv-cap-card-h">Structured Reports</h4>
                  <p className="pv-cap-card-p">
                    AI-assisted clinical summaries, immutable physician sign-offs, and audited PDF generation.
                  </p>
                </div>
              </div>

              {/* Card 4 */}
              <div className="pv-cap-card">
                <div className="pv-cap-card-icon">
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>supervised_user_circle</span>
                </div>
                <div>
                  <h4 className="pv-cap-card-h">Clinical Decision Support</h4>
                  <p className="pv-cap-card-p">
                    Human-in-the-loop review with role separation across doctors, patients, and admins.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. HOW IT WORKS SECTION */}
        <section className="pv-hero-container" id="how-it-works" style={{ paddingTop: 60, paddingBottom: 60 }}>
          <div style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 40px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#087f8c' }}>
              CLINICAL WORKFLOW LIFECYCLE
            </span>
            <h2 style={{ fontFamily: 'var(--pv-font-display)', fontSize: 32, fontWeight: 800, marginTop: 8, color: '#0b1c30' }}>
              How Chest X AI Empowers Radiologists
            </h2>
            <p style={{ fontSize: 15, color: '#3e494a', lineHeight: 1.6, marginTop: 10 }}>
              From initial DICOM upload to finalized signed PDF reports, our workflow preserves clinician oversight at every step.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #dce9ff', boxShadow: '0 2px 8px rgba(11,28,48,0.03)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff4ff', color: '#087f8c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, marginBottom: 16 }}>1</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#0b1c30' }}>Image Ingestion & Preprocessing</h3>
              <p style={{ fontSize: 13, color: '#3e494a', lineHeight: 1.5 }}>
                DICOM, PNG, and JPEG radiographs are validated, converted to 1-channel grayscale, aspect-ratio center-cropped, and normalized into [-1024, 1024] range.
              </p>
            </div>

            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #dce9ff', boxShadow: '0 2px 8px rgba(11,28,48,0.03)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff4ff', color: '#087f8c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, marginBottom: 16 }}>2</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#0b1c30' }}>TorchXRayVision DenseNet Inference</h3>
              <p style={{ fontSize: 13, color: '#3e494a', lineHeight: 1.5 }}>
                Pretrained DenseNet-121 (densenet121-res224-all) evaluates 14 thoracic findings, computing independent multi-label sigmoid probabilities evaluated against operating thresholds.
              </p>
            </div>

            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #dce9ff', boxShadow: '0 2px 8px rgba(11,28,48,0.03)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff4ff', color: '#087f8c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, marginBottom: 16 }}>3</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#0b1c30' }}>Grad-CAM Feature Attribution</h3>
              <p style={{ fontSize: 13, color: '#3e494a', lineHeight: 1.5 }}>
                Backpropagation on pre-sigmoid logits at denseblock4 creates transparent 2D attention heatmaps, showing clinicians the exact anatomical regions driving model scores.
              </p>
            </div>

            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #dce9ff', boxShadow: '0 2px 8px rgba(11,28,48,0.03)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff4ff', color: '#087f8c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, marginBottom: 16 }}>4</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#0b1c30' }}>Physician Sign-Off & PDF Report</h3>
              <p style={{ fontSize: 13, color: '#3e494a', lineHeight: 1.5 }}>
                Doctors confirm or reject findings, enter clinical impressions, and lock finalized reports. Patients gain access to download their official sealed PDF report.
              </p>
            </div>
          </div>
        </section>

        {/* 5. TECHNOLOGY SECTION */}
        <section className="pv-hero-container" id="technology" style={{ paddingBottom: 60 }}>
          <div style={{ background: '#eff4ff', borderRadius: 18, padding: '36px 32px', border: '1px solid #dce9ff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#087f8c' }}>
                  STATE-OF-THE-ART INFORMATICS
                </span>
                <h3 style={{ fontFamily: 'var(--pv-font-display)', fontSize: 26, fontWeight: 800, marginTop: 8, color: '#0b1c30' }}>
                  Engineered with Rigorous Academic Standards
                </h3>
                <p style={{ fontSize: 14, color: '#3e494a', lineHeight: 1.6, marginTop: 12 }}>
                  Unlike opaque black-box AI tools, Chest X- AI integrates open scientific checkpoints, aspect-preserving image transforms, explicit operating-point thresholds, and audited PDF exports.
                </p>
                <div style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    className="pv-btn-primary"
                    onClick={() => (user ? navigate('/model') : setShowLoginModal(true))}
                  >
                    <span>Inspect Model & Operating Points</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: '1px solid #dce9ff' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#087f8c' }}>18</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0b1c30', marginTop: 2 }}>Pathology Heads</div>
                  <div style={{ fontSize: 11, color: '#6e797b', marginTop: 4 }}>Trained across 7 major hospital repositories</div>
                </div>

                <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: '1px solid #dce9ff' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#087f8c' }}>224²</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0b1c30', marginTop: 2 }}>Native Resolution</div>
                  <div style={{ fontSize: 11, color: '#6e797b', marginTop: 4 }}>Aspect-preserving center-crop normalization</div>
                </div>

                <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: '1px solid #dce9ff' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#087f8c' }}>100%</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0b1c30', marginTop: 2 }}>Deterministic</div>
                  <div style={{ fontSize: 11, color: '#6e797b', marginTop: 4 }}>Identical inputs yield zero score variance</div>
                </div>

                <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: '1px solid #dce9ff' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#087f8c' }}>PDF</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0b1c30', marginTop: 2 }}>Institutional Reports</div>
                  <div style={{ fontSize: 11, color: '#6e797b', marginTop: 4 }}>Audited addenda with doctor digital seal</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. ABOUT SECTION */}
        <section className="pv-hero-container" id="about" style={{ paddingBottom: 60 }}>
          <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#087f8c' }}>
              RESEARCH CONTEXT & CITATION
            </span>
            <h3 style={{ fontFamily: 'var(--pv-font-display)', fontSize: 24, fontWeight: 800, marginTop: 8, color: '#0b1c30' }}>
              Chest-X AI v2 / Chest-X AI Decision Support System
            </h3>
            <p style={{ fontSize: 13, color: '#3e494a', lineHeight: 1.6, marginTop: 10 }}>
              Developed as an educational and research decision-support prototype. TorchXRayVision DenseNet-121 weights (Wang et al., IEEE CVPR 2017 & Cohen et al., 2022). Patient data is encrypted and partitioned strictly by medical record number.
            </p>
          </div>
        </section>
      </main>

      {/* 7. FOOTER */}
      <footer className="pv-footer">
        <div className="pv-footer-inner">
          <div className="pv-footer-left">
            <img
              src={BRAND_LOGO_URL}
              alt="Chest-X AI Logo"
              style={{ height: 24, width: 'auto', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span className="pv-footer-copy">
              © 2025 Chest-X AI Inc. Clinical Diagnostic Informatics. All rights reserved.
            </span>
          </div>

          <div className="pv-footer-links">
            <button
              type="button"
              className="pv-footer-link"
              onClick={() => scrollToSection('overview')}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Overview
            </button>
            <button
              type="button"
              className="pv-footer-link"
              onClick={() => scrollToSection('technology')}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Security & Compliance
            </button>
            <button
              type="button"
              className="pv-footer-link"
              onClick={() => scrollToSection('about')}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Institutional Inquiries
            </button>
          </div>
        </div>
      </footer>

      {/* 8. QUICK DEMO LOGIN MODAL */}
      {showLoginModal && (
        <div className="pv-modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="pv-modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5eeff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0b1c30' }}>Sign In to Chest-X AI</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#3e494a' }}>Select a role or enter your credentials</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: '#6e797b', cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {loginErr && (
                <div style={{ background: '#ffdad6', color: '#93000a', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                  {loginErr}
                </div>
              )}

              {/* 1-Click Role Login Buttons */}
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6e797b', display: 'block', marginBottom: 8 }}>
                  Fast Demo Access (1-Click)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    disabled={loginBusy}
                    onClick={() => handleLogin('dr.sharma', 'doctor123')}
                    style={{ background: '#eff4ff', border: '1px solid #dce9ff', borderRadius: 8, padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#087f8c' }}>Dr. Rajesh Sharma</div>
                    <div style={{ fontSize: 10.5, color: '#3e494a' }}>Attending Radiologist</div>
                  </button>

                  <button
                    type="button"
                    disabled={loginBusy}
                    onClick={() => handleLogin('dr.patel', 'doctor123')}
                    style={{ background: '#eff4ff', border: '1px solid #dce9ff', borderRadius: 8, padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#087f8c' }}>Dr. Priya Patel</div>
                    <div style={{ fontSize: 10.5, color: '#3e494a' }}>Pulmonologist</div>
                  </button>

                  <button
                    type="button"
                    disabled={loginBusy}
                    onClick={() => handleLogin('aarav.sharma', 'patient123')}
                    style={{ background: '#eff4ff', border: '1px solid #dce9ff', borderRadius: 8, padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#087f8c' }}>Aarav Sharma</div>
                    <div style={{ fontSize: 10.5, color: '#3e494a' }}>Patient (MRN-IND-001)</div>
                  </button>

                  <button
                    type="button"
                    disabled={loginBusy}
                    onClick={() => handleLogin('admin', 'admin123')}
                    style={{ background: '#eff4ff', border: '1px solid #dce9ff', borderRadius: 8, padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#087f8c' }}>Administrator</div>
                    <div style={{ fontSize: 10.5, color: '#3e494a' }}>System Admin</div>
                  </button>
                </div>
              </div>

              {/* Standard Form Login */}
              <div style={{ position: 'relative', textAlign: 'center', margin: '16px 0' }}>
                <hr style={{ border: 'none', borderTop: '1px solid #e5eeff' }} />
                <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 10px', fontSize: 11, color: '#6e797b' }}>
                  or enter credentials
                </span>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleLogin(username, password); }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3e494a', marginBottom: 4 }}>Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. dr.sharma"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #bdc9ca', fontSize: 13 }}
                  />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3e494a', marginBottom: 4 }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #bdc9ca', fontSize: 13 }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="pv-btn-primary"
                  style={{ width: '100%', padding: 11 }}
                >
                  {loginBusy ? 'Signing in…' : 'Sign In to Workspace'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
