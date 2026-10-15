import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThoraxCanvas3D from '../components/ThoraxCanvas3D';
import { useAuth } from '../auth';
import { api } from '../api';

export default function HeroPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);

  const handleLogin = async (u, p) => {
    setLoginBusy(true);
    setLoginErr('');
    try {
      await login(u, p);
      setShowLoginModal(false);
      navigate('/');
    } catch (e) {
      setLoginErr(e.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleDownloadSamplePdf = async () => {
    setDownloadBusy(true);
    try {
      // First ensure session or login as dr.sharma to get PDF if not logged in
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem('chestx.session')); } catch {}
      if (!s?.token) {
        // Authenticate silently as dr.sharma for the public sample download
        const res = await api.login('dr.sharma', 'doctor123');
        sessionStorage.setItem('chestx.session', JSON.stringify(res));
      }
      await api.download('/studies/1/report.pdf', 'Aarav_Sharma_STD-2026-001_Clinical_Report.pdf');
    } catch (e) {
      alert(`Could not download PDF: ${e.message}`);
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#060B14', color: '#F8FAFC', fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", overflowX: 'hidden' }}>
      {/* 1. Ultra-sleek Cyber-Medical Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(16px)', background: 'rgba(6, 11, 20, 0.85)', borderBottom: '1px solid rgba(0, 242, 254, 0.15)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)', display: 'grid', placeItems: 'center', fontWeight: 900, color: '#060B14', fontSize: 18, boxShadow: '0 0 20px rgba(0, 242, 254, 0.5)' }}>
            X
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #FFFFFF 0%, #BAE6FD 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Chest-X AI
            </div>
            <div style={{ fontSize: 10, color: '#38BDF8', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              Thoracic Intelligence v2.4
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 13, fontWeight: 500, color: '#94A3B8' }}>
          <a href="#hero-3d" style={{ color: '#E2E8F0', textDecoration: 'none' }}>3D Thorax</a>
          <a href="#features" style={{ color: '#E2E8F0', textDecoration: 'none' }}>TorchXRayVision</a>
          <a href="#pdf-report" style={{ color: '#E2E8F0', textDecoration: 'none' }}>Clinical PDF</a>
          <a href="#pathologies" style={{ color: '#E2E8F0', textDecoration: 'none' }}>14 Pathologies</a>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleDownloadSamplePdf}
            disabled={downloadBusy}
            style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(0, 242, 254, 0.4)', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#00F2FE', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
            title="Download verified institutional PDF report for Aarav Sharma"
          >
            <span>📄</span> {downloadBusy ? 'Generating PDF…' : 'Sample PDF Report'}
          </button>

          {user ? (
            <button
              onClick={() => navigate('/')}
              style={{ background: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, color: '#060B14', cursor: 'pointer', boxShadow: '0 4px 18px rgba(0, 242, 254, 0.4)' }}
            >
              Open Workstation →
            </button>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              style={{ background: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, color: '#060B14', cursor: 'pointer', boxShadow: '0 4px 18px rgba(0, 242, 254, 0.4)' }}
            >
              Sign In / Launch
            </button>
          )}
        </div>
      </header>

      {/* 2. Main Hero Section */}
      <section id="hero-3d" style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 32px 60px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1.15fr)', gap: 40, alignItems: 'center' }}>
        {/* Left Side: Headline & Mission */}
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0, 242, 254, 0.08)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: 999, padding: '5px 14px', marginBottom: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00F2FE', boxShadow: '0 0 10px #00F2FE' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#38BDF8', letterSpacing: '0.04em' }}>
              TORCHXRAYVISION DENSENET-121 + GRAD-CAM EXPLAINABLE AI
            </span>
          </div>

          <h1 style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.03em', margin: '0 0 20px 0', background: 'linear-gradient(135deg, #FFFFFF 20%, #E0F2FE 60%, #38BDF8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Next-Generation AI Thoracic Imaging & Diagnostic Radiography.
          </h1>

          <p style={{ fontSize: 17, lineHeight: 1.6, color: '#94A3B8', margin: '0 0 32px 0', maxWidth: '58ch' }}>
            Transforming chest radiograph interpretation with academic-grade deep neural networks. Automated detection across 14 cardiopulmonary findings, sub-second Grad-CAM heatmaps, physician sign-off, and institutional PDF reporting.
          </p>

          {/* Action Button Row */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 40 }}>
            <button
              onClick={() => {
                if (user) navigate('/');
                else setShowLoginModal(true);
              }}
              style={{ background: 'linear-gradient(135deg, #00F2FE 0%, #2563EB 100%)', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0, 242, 254, 0.35)', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span>⚡</span> Launch Diagnostic Workstation
            </button>

            <button
              onClick={handleDownloadSamplePdf}
              disabled={downloadBusy}
              style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(0, 242, 254, 0.35)', borderRadius: 10, padding: '14px 24px', fontSize: 15, fontWeight: 600, color: '#38BDF8', cursor: 'pointer', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span>📄</span> {downloadBusy ? 'Generating PDF…' : 'Download Sample PDF'}
            </button>
          </div>

          {/* KPI Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: 24 }}>
            {[
              ['14', 'NIH Pathologies', 'Multi-label sigmoid'],
              ['< 1.2s', 'Inference Speed', 'Sub-second classification'],
              ['Grad-CAM', 'Visual Saliency', 'Layer denseblock4'],
              ['AIIMS / PDF', 'Clinical Format', 'Board-signed reports'],
            ].map(([num, label, desc]) => (
              <div key={label}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#00F2FE', letterSpacing: '-0.02em' }}>{num}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#F1F5F9', marginTop: 2 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: The 3D Interactive Thorax Viewport */}
        <div style={{ height: 600, position: 'relative' }}>
          <ThoraxCanvas3D />
        </div>
      </section>

      {/* 3. Deep Features Grid */}
      <section id="features" style={{ maxWidth: 1400, margin: '40px auto', padding: '0 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#00F2FE', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ENGINEERING & MEDICAL RIGOR
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: '#FFFFFF', marginTop: 8 }}>
            Designed for Clinical Decision Support
          </h2>
          <p style={{ color: '#94A3B8', maxWidth: '64ch', margin: '8px auto 0', fontSize: 15 }}>
            Every layer from the deep convolutional backbone to the legal PDF report is built to empower radiologists and safeguard patient care.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {/* Feature Card 1 */}
          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(0, 242, 254, 0.2)', borderRadius: 14, padding: 26, backdropFilter: 'blur(10px)', transition: 'transform 0.2s' }}>
            <div style={{ fontSize: 28, marginBottom: 14 }}>🧠</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px 0' }}>
              TorchXRayVision DenseNet-121
            </h3>
            <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5, margin: 0 }}>
              Trained on hundreds of thousands of chest radiographs across NIH, CheXpert, and MIMIC. Outputs independent multi-label Sigmoid probabilities calibrated for cardiopulmonary screening.
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, background: 'rgba(0, 242, 254, 0.1)', color: '#38BDF8', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>224×224 Tensor</span>
              <span style={{ fontSize: 11, background: 'rgba(0, 242, 254, 0.1)', color: '#38BDF8', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>Independent Sigmoids</span>
            </div>
          </div>

          {/* Feature Card 2 */}
          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: 14, padding: 26, backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: 28, marginBottom: 14 }}>🎯</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px 0' }}>
              Explainable Grad-CAM Heatmaps
            </h3>
            <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5, margin: 0 }}>
              Calculates target disease gradients back to the final convolutional denseblock. Visualizes the exact thoracic region that triggered the detection, eliminating black-box uncertainty.
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, background: 'rgba(244, 63, 94, 0.1)', color: '#FB7185', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>Jet / Turbo Colormaps</span>
              <span style={{ fontSize: 11, background: 'rgba(244, 63, 94, 0.1)', color: '#FB7185', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>Dynamic Alpha Blend</span>
            </div>
          </div>

          {/* Feature Card 3 */}
          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 14, padding: 26, backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: 28, marginBottom: 14 }}>📑</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px 0' }}>
              Institutional Clinical PDF Reports
            </h3>
            <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5, margin: 0 }}>
              Instant single-click generation of professional diagnostic PDF reports formatted according to Indian / AIIMS institutional standards with MRN, findings table, impression, and doctor signatures.
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.1)', color: '#34D399', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>Vector Typography</span>
              <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.1)', color: '#34D399', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>Legal Disclaimers</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The 14 Pathologies Strip */}
      <section id="pathologies" style={{ maxWidth: 1400, margin: '60px auto', padding: '0 32px' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(6, 11, 20, 0.9) 100%)', border: '1px solid rgba(0, 242, 254, 0.2)', borderRadius: 16, padding: 32 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#BAE6FD', margin: '0 0 16px 0' }}>
            Comprehensive 14-Finding Thoracic Detection Matrix
          </h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              'Atelectasis', 'Cardiomegaly', 'Consolidation', 'Edema', 'Effusion',
              'Emphysema', 'Fibrosis', 'Hernia', 'Infiltration', 'Mass',
              'Nodule', 'Pleural Thickening', 'Pneumonia', 'Pneumothorax'
            ].map((p) => (
              <span key={p} style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(0, 242, 254, 0.25)', color: '#E2E8F0', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 5. PDF Spotlight & Indian Clinical Patients */}
      <section id="pdf-report" style={{ maxWidth: 1400, margin: '60px auto 100px', padding: '0 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 32, alignItems: 'center', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 16, padding: 36 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              OFFICIAL CLINICAL RECORD
            </span>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: '#FFFFFF', marginTop: 8, marginBottom: 16 }}>
              Diagnostic PDF Reports Ready for Hospital Discharge & OPD
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px 0' }}>
              Finalized clinical reports feature patient details (Aarav Sharma, MRN-IN-1001), detailed findings categorization, doctor's final impression, follow-up recommendations, and digital sign-off from senior radiologists at AIIMS New Delhi and Apollo Hospitals.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleDownloadSamplePdf}
                disabled={downloadBusy}
                style={{ background: '#10B981', border: 'none', borderRadius: 8, padding: '12px 22px', fontSize: 14, fontWeight: 700, color: '#060B14', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 6px 20px rgba(16, 185, 129, 0.3)' }}
              >
                <span>📥</span> {downloadBusy ? 'Generating PDF…' : 'Download Aarav Sharma PDF'}
              </button>
            </div>
          </div>

          {/* Miniature PDF preview mockup */}
          <div style={{ background: '#FFFFFF', color: '#0F172A', borderRadius: 10, padding: 24, boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)', border: '1px solid #CBD5E1', fontSize: 11, fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0284C7', paddingBottom: 10, marginBottom: 12 }}>
              <div>
                <b style={{ fontSize: 14, color: '#0369A1' }}>CHEST-X AI CLINICAL DIAGNOSTICS</b>
                <div style={{ fontSize: 9, color: '#64748B' }}>All India Institute of Medical Sciences (AIIMS)</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 9, color: '#64748B' }}>
                <div>STUDY: STD-2026-001</div>
                <div style={{ color: '#16A34A', fontWeight: 700 }}>STATUS: FINALIZED</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#F8FAFC', padding: 8, borderRadius: 4, marginBottom: 12 }}>
              <div><b>Patient:</b> Aarav Sharma</div>
              <div><b>MRN:</b> MRN-IN-1001</div>
              <div><b>Age / Gender:</b> 42 Y / Male</div>
              <div><b>Attending:</b> Dr. Rajesh Sharma, MD</div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <b style={{ color: '#0F172A' }}>AI FINDINGS SUMMARY (TorchXRayVision)</b>
              <div style={{ color: '#B91C1C', marginTop: 2, fontWeight: 600 }}>• Infiltration (Score: 82.4%)</div>
              <div style={{ color: '#475569', marginTop: 1 }}>• Effusion (Score: 48.1%)</div>
            </div>

            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 8, color: '#334155' }}>
              <b>PHYSICIAN IMPRESSION:</b>
              <div style={{ fontSize: 10, marginTop: 2, fontStyle: 'italic' }}>
                "Bilateral basal infiltration noted consistent with bacterial pneumonia. Mild pleural thickening. Advised oral antibiotics and repeat radiograph in 14 days."
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Quick Sign-In Modal */}
      {showLoginModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ background: '#0F172A', border: '1px solid rgba(0, 242, 254, 0.4)', borderRadius: 16, maxWidth: 440, width: '100%', padding: 32, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)', position: 'relative' }}>
            <button
              onClick={() => setShowLoginModal(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#94A3B8', fontSize: 18, cursor: 'pointer' }}
            >
              ✕
            </button>

            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px 0' }}>Sign In to Chest-X</h3>
            <p style={{ color: '#94A3B8', fontSize: 13, margin: '0 0 20px 0' }}>Enter your clinic credentials or use quick demo profiles.</p>

            {loginErr && (
              <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid #F43F5E', color: '#FECDD3', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
                {loginErr}
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleLogin(username, password); }} style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#CBD5E1', marginBottom: 4 }}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, background: '#1E293B', border: '1px solid #334155', color: '#FFFFFF', fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#CBD5E1', marginBottom: 4 }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, background: '#1E293B', border: '1px solid #334155', color: '#FFFFFF', fontSize: 14 }}
                />
              </div>

              <button
                type="submit"
                disabled={loginBusy}
                style={{ background: 'linear-gradient(135deg, #00F2FE 0%, #2563EB 100%)', border: 'none', borderRadius: 8, padding: '12px', color: '#FFFFFF', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 6 }}
              >
                {loginBusy ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div style={{ borderTop: '1px solid #334155', marginTop: 22, paddingTop: 18 }}>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10, fontWeight: 600 }}>Quick Indian Demo Profiles:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <button
                  disabled={loginBusy}
                  onClick={() => handleLogin('dr.sharma', 'doctor123')}
                  style={{ background: '#1E293B', border: '1px solid #334155', color: '#38BDF8', borderRadius: 6, padding: '7px 4px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Dr. Sharma (MD)
                </button>
                <button
                  disabled={loginBusy}
                  onClick={() => handleLogin('patient.aarav', 'patient123')}
                  style={{ background: '#1E293B', border: '1px solid #334155', color: '#34D399', borderRadius: 6, padding: '7px 4px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Aarav (Patient)
                </button>
                <button
                  disabled={loginBusy}
                  onClick={() => handleLogin('admin', 'admin123')}
                  style={{ background: '#1E293B', border: '1px solid #334155', color: '#F43F5E', borderRadius: 6, padding: '7px 4px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Admin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Institutional Footer */}
      <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', padding: '32px', textAlign: 'center', color: '#64748B', fontSize: 13 }}>
        <div>Chest-X AI Decision Support System · Academic Research & Clinical Prototype</div>
        <div style={{ marginTop: 6, fontSize: 11 }}>For research and educational assistance. Clinical decisions remain the sole responsibility of the attending physician.</div>
      </footer>
    </div>
  );
}
