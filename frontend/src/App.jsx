import React, { useState, useEffect, useRef, Component } from 'react';
import ForceGraph2D from 'react-force-graph-2d';


import './App.css';

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function setCookie(name, value, days) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${value}; max-age=${maxAge}; path=/`;
}

function deleteCookie(name) {
  document.cookie = `${name}=; max-age=0; path=/`;
}

// Simple Error Boundary
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#ef4444', background: '#0f172a', height: '100vh' }}>
          <h2>Graph Error</h2>
          <pre>{this.state.error?.toString()}</pre>
          <button onClick={() => window.location.reload()}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}


function App() {
  const [authData, setAuthData] = useState({
    sid: getCookie('sid'),
    synotoken: getCookie('synotoken')
  });
  const [loginForm, setLoginForm] = useState({ account: '', password: '', otp: '' });
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [user, setUser] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'graph'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [thumbnailSize, setThumbnailSize] = useState(() => {
    return getCookie('thumbnailSize') || 'm';
  });

  useEffect(() => {
    setCookie('thumbnailSize', thumbnailSize, 14);
  }, [thumbnailSize]);

  const fgRef = useRef();
  const imageCache = useRef({});

  console.log("App component executing...");



  // Configuration - using relative paths for Synology Web Station compatibility
  const API_BASE = '/graphstation-api';
  const NAS_BASE = `${window.location.protocol}//${window.location.hostname}`;

  const getThumbnailUrl = (id, cacheKey) => {
    let url = `${NAS_BASE}:5001/synofoto/api/v2/p/Thumbnail/get?id=${id}&cache_key="${id}_${cacheKey}"&type="unit"&size="${thumbnailSize}"`;
    if (authData.synotoken) url += `&SynoToken=${authData.synotoken}`;
    if (authData.sid) url += `&_sid=${authData.sid}`;
    return url;
  };

  const handleImageError = (e) => {
    const img = e.target;
    let retries = parseInt(img.dataset.retries || '0', 10);
    if (retries < 5) {
      setTimeout(() => {
        img.dataset.retries = retries + 1;
        const originalSrc = img.src.split('&retry=')[0];
        img.src = `${originalSrc}&retry=${Date.now()}`;
      }, 2000);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: loginForm.account,
          passwd: loginForm.password,
          otp_code: loginForm.otp
        })
      });

      const result = await response.json();
      if (result.success) {
        const { sid, synotoken } = result.data;
        setCookie('sid', sid, 14); // 14 days = 2 weeks
        setCookie('synotoken', synotoken, 14);
        setAuthData({ sid, synotoken });
      } else {
        setLoginError(`Login fehlgeschlagen: Code ${result.error?.code || 'Unbekannt'}`);
      }
    } catch (err) {
      setLoginError(`Netzwerkfehler: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    deleteCookie('sid');
    deleteCookie('synotoken');
    setAuthData({ sid: null, synotoken: null });
  };

  useEffect(() => {
    async function initApp() {
      if (!authData.sid || !authData.synotoken) return; // Do not fetch if not authenticated
      try {
        setLoading(true);
        const photosRes = await fetch(`${API_BASE}/photos`, { credentials: 'include' });

        if (!photosRes.ok) {
          if (photosRes.status === 401) {
            handleLogout();
            return;
          }
          const errorData = await photosRes.json().catch(() => ({}));
          const errorMsg = errorData.details || errorData.error || `Status ${photosRes.status}`;
          throw new Error(`Backend error: ${errorMsg}`);
        }

        const photosData = await photosRes.json();
        setPhotos(photosData.photos || []);
        if (photosData.owner) setUser(photosData.owner);

        // Pre-fetch graph data
        const graphRes = await fetch(`${API_BASE}/graph?limit=30`, { credentials: 'include' });
        if (!graphRes.ok) {
          if (graphRes.status === 401) {
            handleLogout();
            return;
          }
        } else {
          const gData = await graphRes.json();
          setGraphData(gData);
        }

      } catch (err) {
        console.error("Initialization failed:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    initApp();
  }, [authData.sid, authData.synotoken]);

  const toggleView = () => {
    setViewMode(viewMode === 'grid' ? 'graph' : 'grid');
  };

  console.log("Rendering Graph with:", graphData.nodes.length, "nodes and", graphData.links.length, "links");

  if (!authData.sid || !authData.synotoken) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="login-card" style={{ background: '#1e293b', padding: '2rem', borderRadius: '8px', width: '300px', border: '1px solid #334155' }}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem', textAlign: 'center' }}>NAS Login</h2>
          {loginError && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>{loginError}</div>}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="text" 
              placeholder="Account" 
              value={loginForm.account}
              onChange={e => setLoginForm({...loginForm, account: e.target.value})}
              required
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}
            />
            <input 
              type="password" 
              placeholder="Passwort" 
              value={loginForm.password}
              onChange={e => setLoginForm({...loginForm, password: e.target.value})}
              required
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}
            />
            <input 
              type="text" 
              placeholder="OTP Code (Optional)" 
              value={loginForm.otp}
              onChange={e => setLoginForm({...loginForm, otp: e.target.value})}
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}
            />
            <button 
              type="submit" 
              disabled={isLoggingIn}
              style={{ padding: '0.75rem', borderRadius: '4px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: 'bold', cursor: isLoggingIn ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}
            >
              {isLoggingIn ? 'Logge ein...' : 'Einloggen'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading">🚀 GraphStation lädt...</div>;

  if (error) return <div className="error">❌ Fehler: {error}</div>;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>GraphStation</h1>
        <div className="header-controls">
          <div className="stats-info" style={{ marginRight: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Nodes: {graphData.nodes.length} | Links: {graphData.links.length}
          </div>
          
          <div className="size-selector-chips" style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            {['sm', 'm', 'xl'].map(size => (
              <button
                key={size}
                onClick={() => setThumbnailSize(size)}
                style={{
                  background: thumbnailSize === size ? 'var(--accent-color)' : 'transparent',
                  color: thumbnailSize === size ? 'var(--bg-color)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  transition: 'all 0.2s ease',
                }}
              >
                {size}
              </button>
            ))}
          </div>

          <button onClick={toggleView} className="view-toggle">
            {viewMode === 'grid' ? '🌐 Graph Ansicht' : '📱 Grid Ansicht'}
          </button>
          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>{user ? `Hallo, ${user} 👋` : 'Gast'}</span>
            <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="content-area">
        {viewMode === 'grid' ? (
          <div className={`photo-grid size-${thumbnailSize}`}>
            {photos.length > 0 ? (
              photos.map(photo => (
                <div key={photo.id} className="photo-card">
                  <img
                    src={getThumbnailUrl(photo.id, photo.cache_key)}
                    alt="NAS Photo"
                    loading="lazy"
                    onError={handleImageError}
                  />
                  <div className="photo-date">
                    {new Date(photo.takentime * 1000).toLocaleDateString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-photos">Keine Fotos gefunden.</div>
            )}
          </div>
        ) : (
          <ErrorBoundary>
            <div className="graph-view" style={{ width: '100vw', height: 'calc(100vh - 70px)', background: '#020617' }}>
              <ForceGraph2D
                graphData={graphData}
                width={window.innerWidth}
                height={window.innerHeight - 70}
                nodeLabel="label"
                nodeAutoColorBy="type"
                linkDirectionalParticles={1}
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const size = node.val || 3;
                  if (node.type === 'Photo') {
                    const imgUrl = getThumbnailUrl(node.unit_id, node.cache_key);

                    const imageKey = `${node.id}_${thumbnailSize}`;
                    if (!imageCache.current[imageKey]) {
                      const img = new Image();
                      img.src = imgUrl;
                      img.retries = 0;
                      img.onerror = () => {
                        if (img.retries < 5) {
                          setTimeout(() => {
                            img.retries++;
                            const originalSrc = imgUrl.split('&retry=')[0];
                            img.src = `${originalSrc}&retry=${Date.now()}`;
                          }, 2000);
                        }
                      };
                      imageCache.current[imageKey] = img;
                    }

                    const img = imageCache.current[imageKey];

                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                    ctx.clip();
                    try {
                      if (img.complete && img.naturalWidth !== 0) {
                        ctx.drawImage(img, node.x - size, node.y - size, size * 2, size * 2);
                      } else {
                        ctx.fillStyle = '#1e293b';
                        ctx.fill();
                      }
                    } catch (e) { }
                    ctx.strokeStyle = '#38bdf8';
                    ctx.lineWidth = 1 / globalScale;
                    ctx.stroke();
                    ctx.restore();
                  } else {
                    // Metadata node
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                    ctx.fillStyle = node.color || '#818cf8';
                    ctx.fill();

                    // Label
                    const label = node.label;
                    const fontSize = 10 / globalScale;
                    ctx.font = `${fontSize}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'white';
                    ctx.fillText(label, node.x, node.y + size + fontSize);
                  }
                }}
                onNodeClick={node => {
                  if (node.type === 'Photo') setViewMode('grid');
                }}
              />

            </div>
          </ErrorBoundary>








        )}
      </main>
    </div>
  );
}

export default App;
