import { Component } from 'react';

/**
 * કોઈપણ React એરર આવે તો સફેદ પાનાને બદલે સમજ પડે એવો સંદેશ દેખાય —
 * deploy પછી "login પછી white page" જેવી સ્થિતિમાં અસલી કારણ વાંચી શકાય.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // કન્સોલમાં વિગતવાર છોડો (dev console / Render logs માટે)
    console.error('[EMS] UI error:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error || '');
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', padding: 24, fontFamily: 'Inter, "Noto Sans Gujarati", system-ui, sans-serif' }}>
          <div style={{ maxWidth: 560, width: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 10px 30px rgba(15,23,42,.08)', padding: '32px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <h1 style={{ margin: '12px 0 6px', fontSize: 20, color: '#0f172a' }}>કંઈક ખોટું થયું</h1>
            <p style={{ margin: 0, color: '#475569', fontSize: 14, lineHeight: 1.7 }}>
              પેજ લોડ કરતી વખતે એરર આવી છે. નીચેની વિગત સાથે ફરી પ્રયત્ન કરો; ન ચાલે તો backend ચાલુ છે કે નહીં
              (<code>/api/health</code>) અને API URL સેટિંગ (<code>public/config.js</code>) ચકાસો.
            </p>
            <pre style={{ textAlign: 'left', marginTop: 16, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 10, fontSize: 12, overflow: 'auto', maxHeight: 160 }}>
              {msg || 'Unknown error'}
            </pre>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{ background: '#4f46e5', color: '#fff', border: 0, borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}
              >
                ફરી લોડ કરો
              </button>
              <a
                href="/login"
                style={{ background: '#eef2ff', color: '#3730a3', borderRadius: 10, padding: '10px 18px', fontSize: 14, textDecoration: 'none' }}
              >
                લોગિન પેજ
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
