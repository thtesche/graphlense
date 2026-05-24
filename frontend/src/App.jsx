import React, { useState, useEffect, useRef, Component, useMemo, useCallback } from 'react';
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

const translations = {
  de: {
    grouped: '🗂️ Gruppiert',
    filter: '🔍 Filtern',
    graph: '🌐 Graph',
    family: 'Familie',
    person: 'Person',
    location: 'Land/Ort',
    country: 'Land',
    allFamilies: 'Alle Familien',
    allPersons: 'Alle Personen',
    allCountries: 'Alle Länder',
    resetFilters: '✕ Filter zurücksetzen',
    searchingPhotos: 'Suche Fotos...',
    noPhotos: 'Keine Fotos gefunden.',
    groupingPhotos: 'Gruppiere Fotos...',
    noGroupedPhotos: 'Keine gruppierten Fotos gefunden.',
    collapse: '▲ Einklappen',
    showAll: (count) => `▼ Alle anzeigen (${count} Bilder)`,
    imagesCount: (count) => count === 1 ? '1 Bild' : `${count} Bilder`,
    hello: (name) => `Hallo, ${name} 👋`,
    guest: 'Gast',
    logout: 'Logout',
    nasLogin: 'NAS Login',
    account: 'Account',
    password: 'Passwort',
    otp: 'OTP Code (Optional)',
    loggingIn: 'Logge ein...',
    login: 'Einloggen',
    loading: '🚀 GraphStation lädt...',
    error: (msg) => `❌ Fehler: ${msg}`,
    unknown: 'Unbekannt',
  },
  en: {
    grouped: '🗂️ Grouped',
    filter: '🔍 Filter',
    graph: '🌐 Graph',
    family: 'Family',
    person: 'Person',
    location: 'Location',
    country: 'Country',
    allFamilies: 'All Families',
    allPersons: 'All Persons',
    allCountries: 'All Countries',
    resetFilters: '✕ Reset Filters',
    searchingPhotos: 'Searching Photos...',
    noPhotos: 'No photos found.',
    groupingPhotos: 'Grouping photos...',
    noGroupedPhotos: 'No grouped photos found.',
    collapse: '▲ Collapse',
    showAll: (count) => `▼ Show all (${count} Images)`,
    imagesCount: (count) => count === 1 ? '1 Image' : `${count} Images`,
    hello: (name) => `Hello, ${name} 👋`,
    guest: 'Guest',
    logout: 'Logout',
    nasLogin: 'NAS Login',
    account: 'Account',
    password: 'Password',
    otp: 'OTP Code (Optional)',
    loggingIn: 'Logging in...',
    login: 'Login',
    loading: '🚀 GraphStation is loading...',
    error: (msg) => `❌ Error: ${msg}`,
    unknown: 'Unknown',
  }
};

const getInitialLanguage = () => {
  const stored = localStorage.getItem('language');
  if (stored === 'de' || stored === 'en') return stored;
  
  const browserLang = navigator.language || navigator.userLanguage || '';
  if (browserLang.toLowerCase().startsWith('de')) {
    return 'de';
  }
  return 'en';
};

function App() {
  const [language, setLanguage] = useState(getInitialLanguage);

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key, ...args) => {
    const entry = translations[language]?.[key] || translations['en']?.[key];
    if (typeof entry === 'function') return entry(...args);
    return entry || key;
  };

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
  const [viewMode, setViewMode] = useState('group'); // 'group', 'filter', or 'graph'
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [groupedPhotos, setGroupedPhotos] = useState([]);
  const [groupedLoading, setGroupedLoading] = useState(false);
  const [groupKey, setGroupKey] = useState('family'); // 'family', 'person', 'location'
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState(null);
  const [thumbnailSize, setThumbnailSize] = useState(() => {
    return getCookie('thumbnailSize') || 'm';
  });

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoDetails, setPhotoDetails] = useState(null);

  // Filter States
  const [filters, setFilters] = useState({ families: [], persons: [], countries: [] });
  const [selectedFamily, setSelectedFamily] = useState('');
  const [selectedPerson, setSelectedPerson] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');


  useEffect(() => {
    setCookie('thumbnailSize', thumbnailSize, 14);
  }, [thumbnailSize]);



  useEffect(() => {
    if (selectedPhoto) {
      document.body.style.overflow = 'hidden';
      setPhotoDetails(null); // Reset while loading
      fetch(`${API_BASE}/photo/${selectedPhoto.id}/details`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setPhotoDetails(data);
          }
        })
        .catch(err => console.error("Error fetching photo details:", err));
    } else {
      document.body.style.overflow = '';
      setPhotoDetails(null);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedPhoto]);

  const fgRef = useRef();
  const modalFgRef = useRef();
  const imageCache = useRef({});

  const [clickedNode, setClickedNode] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);

  const handleCloseOverlay = useCallback(() => {
    if (window.location.hash === '#detail') {
      window.history.back();
    } else {
      setSelectedPhoto(null);
      setClickedNode(null);
    }
  }, [setSelectedPhoto, setClickedNode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCloseOverlay();
      }
    };
    if (selectedPhoto) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPhoto, handleCloseOverlay]);

  // --- Browser History (Back Button) Management for Overlays ---
  const overlayWasOpen = useRef(false);

  useEffect(() => {
    const isOverlayOpen = !!(selectedPhoto || clickedNode);
    const currentHash = window.location.hash;
    
    if (isOverlayOpen && currentHash !== '#detail') {
      window.history.pushState(null, '', window.location.pathname + window.location.search + '#detail');
      overlayWasOpen.current = true;
    } else if (!isOverlayOpen && currentHash === '#detail') {
      if (overlayWasOpen.current) {
        window.history.back();
        overlayWasOpen.current = false;
      } else {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } else if (isOverlayOpen) {
      overlayWasOpen.current = true;
    } else {
      overlayWasOpen.current = false;
    }
  }, [selectedPhoto, clickedNode]);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash !== '#detail') {
        if (selectedPhoto) setSelectedPhoto(null);
        if (clickedNode) setClickedNode(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [selectedPhoto, clickedNode]);
  // -------------------------------------------------------------

  const filteredGraphData = useMemo(() => {
    const nodes = graphData.nodes.filter(n => n.type !== 'Object');
    const objectNodeIds = new Set(graphData.nodes.filter(n => n.type === 'Object').map(n => n.id));
    const links = graphData.links.filter(l => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      return !objectNodeIds.has(sourceId) && !objectNodeIds.has(targetId);
    });
    return { nodes, links };
  }, [graphData]);

  const displayGraphData = useMemo(() => {
    if (!clickedNode) return filteredGraphData;

    const hops = new Map();
    hops.set(clickedNode.id, 0);

    filteredGraphData.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sourceId === clickedNode.id) hops.set(targetId, 1);
      if (targetId === clickedNode.id) hops.set(sourceId, 1);
    });

    filteredGraphData.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (hops.get(sourceId) === 1 && !hops.has(targetId)) hops.set(targetId, 2);
      if (hops.get(targetId) === 1 && !hops.has(sourceId)) hops.set(sourceId, 2);
    });

    const nodes = filteredGraphData.nodes.filter(n => hops.has(n.id));
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = filteredGraphData.links.filter(l => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    return { nodes, links };
  }, [filteredGraphData, clickedNode]);

  const highlightNodes = useMemo(() => {
    const set = new Set();
    if (hoverNode) {
      const hId = String(hoverNode.id);
      set.add(hId);
      displayGraphData.links.forEach(link => {
        const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
        const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
        if (sourceId === hId) set.add(targetId);
        if (targetId === hId) set.add(sourceId);
      });
    }
    return set;
  }, [hoverNode, displayGraphData.links]);

  const highlightLinks = useMemo(() => {
    const set = new Set();
    if (hoverNode) {
      const hId = String(hoverNode.id);
      displayGraphData.links.forEach(link => {
        const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
        const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
        if (sourceId === hId || targetId === hId) {
          set.add(`${sourceId}-${targetId}`);
        }
      });
    }
    return set;
  }, [hoverNode, displayGraphData.links]);

  const modalGraphData = useMemo(() => {
    if (!selectedPhoto || !photoDetails) return { nodes: [], links: [] };

    const nodes = [];
    const links = [];

    const photoNodeId = String(selectedPhoto.id);
    nodes.push({
      id: photoNodeId,
      unit_id: selectedPhoto.id,
      cache_key: selectedPhoto.cache_key,
      type: 'Photo',
      name: `Photo ${selectedPhoto.id}`,
      val: 5
    });

    if (photoDetails.persons_in_photo) {
      photoDetails.persons_in_photo.forEach(person => {
        const personNodeId = `person_${person}`;
        nodes.push({
          id: personNodeId,
          type: 'Person',
          label: person,
          name: person,
          color: '#fbbf24',
          val: 3
        });
        links.push({ source: photoNodeId, target: personNodeId });
      });
    }

    if (photoDetails.families) {
      photoDetails.families.forEach(family => {
        const familyNodeId = `family_${family.name}`;
        nodes.push({
          id: familyNodeId,
          type: 'Family',
          label: family.name,
          name: family.name,
          color: '#ec4899',
          val: 4
        });
        
        family.members.forEach(member => {
          const memberNodeId = `person_${member}`;
          if (!nodes.find(n => n.id === memberNodeId)) {
            nodes.push({
              id: memberNodeId,
              type: 'Person',
              label: member,
              name: member,
              color: '#fcd34d',
              val: 2
            });
          }
          links.push({ source: memberNodeId, target: familyNodeId });
        });
      });
    }
    return { nodes, links };
  }, [selectedPhoto, photoDetails]);

  const modalHighlightNodes = useMemo(() => {
    const set = new Set();
    if (hoverNode) {
      const hId = String(hoverNode.id);
      set.add(hId);
      modalGraphData.links.forEach(link => {
        const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
        const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
        if (sourceId === hId) set.add(targetId);
        if (targetId === hId) set.add(sourceId);
      });
    }
    return set;
  }, [hoverNode, modalGraphData.links]);

  const modalHighlightLinks = useMemo(() => {
    const set = new Set();
    if (hoverNode) {
      const hId = String(hoverNode.id);
      modalGraphData.links.forEach(link => {
        const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
        const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
        if (sourceId === hId || targetId === hId) {
          set.add(`${sourceId}-${targetId}`);
        }
      });
    }
    return set;
  }, [hoverNode, modalGraphData.links]);

  // Clustering forces for the GraphView
  useEffect(() => {
    if (fgRef.current && viewMode === 'graph') {
      const fg = fgRef.current;
      fg.d3ReheatSimulation();
    }
  }, [viewMode, displayGraphData]);

  console.log("App component executing...");



  // Configuration - using relative paths or environment variables for API URL
  const API_BASE = import.meta.env.GRAPHSTATION_API_URL || '/graphstation-api';
  // For backwards compatibility, fallback to hostname:5001 if no environment variable is provided
  const SYNOLOGY_URL = import.meta.env.VITE_SYNOLOGY_URL 
    ? import.meta.env.VITE_SYNOLOGY_URL.replace(/\/$/, "") 
    : `${window.location.protocol}//${window.location.hostname}:5001`;

  const getThumbnailUrl = (id, cacheKey) => {
    let url = `${SYNOLOGY_URL}/synofoto/api/v2/p/Thumbnail/get?id=${id}&cache_key="${id}_${cacheKey}"&type="unit"&size="${thumbnailSize}"`;
    if (authData.synotoken) url += `&SynoToken=${authData.synotoken}`;
    if (authData.sid) url += `&_sid=${authData.sid}`;
    return url;
  };

  const getOriginalUrl = (id, cacheKey) => {
    let url = `${SYNOLOGY_URL}/webapi/entry.cgi?cache_key="${id}_${cacheKey}"&unit_id=[${id}]&api="SYNO.Foto.Download"&method="download"&version=2`;
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
    setSelectedFamily('');
    setSelectedPerson('');
    setSelectedCountry('');
    setFilters({ families: [], persons: [], countries: [] });
  };

  // Fetch filters and graph data once upon login
  useEffect(() => {
    async function loadInitialData() {
      if (!authData.sid || !authData.synotoken) return;
      try {
        setLoading(true);
        setError(null);
        
        // Fetch filters
        const filtersRes = await fetch(`${API_BASE}/filters`, { credentials: 'include' });
        if (filtersRes.ok) {
          const filtersData = await filtersRes.json();
          setFilters(filtersData);
        }

        // Fetch graph data
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
        console.error("Initial load failed:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [authData.sid, authData.synotoken]);

  // Fetch photos whenever filters change
  useEffect(() => {
    async function fetchPhotos() {
      if (!authData.sid || !authData.synotoken) return;
      try {
        setPhotosLoading(true);
        
        const params = new URLSearchParams();
        if (selectedFamily) params.append('family', selectedFamily);
        if (selectedPerson) params.append('person', selectedPerson);
        if (selectedCountry) params.append('country', selectedCountry);
        
        const queryString = params.toString() ? `?${params.toString()}` : '';
        const photosRes = await fetch(`${API_BASE}/photos${queryString}`, { credentials: 'include' });

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
      } catch (err) {
        console.error("Failed to fetch photos:", err);
      } finally {
        setPhotosLoading(false);
      }
    }
    fetchPhotos();
  }, [authData.sid, authData.synotoken, selectedFamily, selectedPerson, selectedCountry]);

  // Window resize handler for graph sizing
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch grouped photos
  useEffect(() => {
    async function fetchGroupedPhotos() {
      if (!authData.sid || !authData.synotoken || viewMode !== 'group') return;
      try {
        setGroupedLoading(true);
        setExpandedGroups({});
        const res = await fetch(`${API_BASE}/photos/grouped?by=${groupKey}`, { credentials: 'include' });
        if (!res.ok) {
          if (res.status === 401) {
            handleLogout();
            return;
          }
          throw new Error(`Backend error: status ${res.status}`);
        }
        const data = await res.json();
        setGroupedPhotos(data || []);
      } catch (err) {
        console.error("Failed to fetch grouped photos:", err);
      } finally {
        setGroupedLoading(false);
      }
    }
    fetchGroupedPhotos();
  }, [authData.sid, authData.synotoken, viewMode, groupKey]);

  console.log("Rendering Graph with:", filteredGraphData.nodes.length, "nodes and", filteredGraphData.links.length, "links");

  if (!authData.sid || !authData.synotoken) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '1.5rem', right: '2rem', zIndex: 10 }}>
          <div className="language-selector" style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <select
              value={language}
              onChange={(e) => changeLanguage(e.target.value)}
              style={{
                background: 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            >
              <option value="de" style={{ background: '#1e293b', color: 'white' }}>DE</option>
              <option value="en" style={{ background: '#1e293b', color: 'white' }}>EN</option>
            </select>
          </div>
        </div>
        <div className="login-card" style={{ background: '#1e293b', padding: '2rem', borderRadius: '8px', width: '300px', border: '1px solid #334155' }}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem', textAlign: 'center' }}>{t('nasLogin')}</h2>
          {loginError && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>{loginError}</div>}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="text" 
              placeholder={t('account')} 
              value={loginForm.account}
              onChange={e => setLoginForm({...loginForm, account: e.target.value})}
              required
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}
            />
            <input 
              type="password" 
              placeholder={t('password')} 
              value={loginForm.password}
              onChange={e => setLoginForm({...loginForm, password: e.target.value})}
              required
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}
            />
            <input 
              type="text" 
              placeholder={t('otp')} 
              value={loginForm.otp}
              onChange={e => setLoginForm({...loginForm, otp: e.target.value})}
              style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: 'white' }}
            />
            <button 
              type="submit" 
              disabled={isLoggingIn}
              style={{ padding: '0.75rem', borderRadius: '4px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: 'bold', cursor: isLoggingIn ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}
            >
              {isLoggingIn ? t('loggingIn') : t('login')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const sharedNodePointerAreaPaint = (node, color, ctx) => {
    const size = (node.val || 3) * (node.type === 'Photo' ? 3 : 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
    ctx.fill();
  };

  const sharedNodeCanvasObject = (node, ctx, globalScale, activeHighlightNodes) => {
    const isDimmed = hoverNode && activeHighlightNodes && !activeHighlightNodes.has(String(node.id));
    ctx.globalAlpha = isDimmed ? 0.2 : 1.0;

    const size = (node.val || 3) * (node.type === 'Photo' ? 3 : 1);
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
    
    ctx.globalAlpha = 1.0;
  };

  if (loading) return <div className="loading">{t('loading')}</div>;

  if (error) return <div className="error">{t('error', error)}</div>;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${viewMode === 'group' ? 'active' : ''}`}
            onClick={() => setViewMode('group')}
          >
            {t('grouped')}
          </button>
          <button 
            className={`nav-item ${viewMode === 'filter' ? 'active' : ''}`}
            onClick={() => setViewMode('filter')}
          >
            {t('filter')}
          </button>
          <button 
            className={`nav-item ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => setViewMode('graph')}
          >
            {t('graph')}
          </button>
        </nav>
      </aside>

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

          <div className="language-selector" style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <select
              value={language}
              onChange={(e) => changeLanguage(e.target.value)}
              style={{
                background: 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            >
              <option value="de" style={{ background: '#1e293b', color: 'white' }}>DE</option>
              <option value="en" style={{ background: '#1e293b', color: 'white' }}>EN</option>
            </select>
          </div>

          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>{user ? t('hello', user) : t('guest')}</span>
            <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
              {t('logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="content-area">
        {viewMode === 'filter' && (
          <div className="grid-container">
            <div className="filter-bar">
              <div className="filter-group">
                <label htmlFor="filter-family">{t('family')}</label>
                <select
                  id="filter-family"
                  value={selectedFamily}
                  onChange={(e) => setSelectedFamily(e.target.value)}
                >
                  <option value="">{t('allFamilies')}</option>
                  {filters.families.map(fam => (
                    <option key={fam} value={fam}>{fam}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label htmlFor="filter-person">{t('person')}</label>
                <select
                  id="filter-person"
                  value={selectedPerson}
                  onChange={(e) => setSelectedPerson(e.target.value)}
                >
                  <option value="">{t('allPersons')}</option>
                  {filters.persons.map(pers => (
                    <option key={pers} value={pers}>{pers}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label htmlFor="filter-country">{t('country')}</label>
                <select
                  id="filter-country"
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                >
                  <option value="">{t('allCountries')}</option>
                  {filters.countries.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {(selectedFamily || selectedPerson || selectedCountry) && (
                <button
                  className="clear-filters-btn"
                  onClick={() => {
                    setSelectedFamily('');
                    setSelectedPerson('');
                    setSelectedCountry('');
                  }}
                >
                  {t('resetFilters')}
                </button>
              )}
            </div>

            <div className={`photo-grid size-${thumbnailSize} ${photosLoading ? 'loading-opacity' : ''}`}>
              {photos.length > 0 ? (
                photos.map(photo => (
                  <div key={photo.id} className="photo-card" onClick={() => {
                    setSelectedPhoto(photo);
                    const node = graphData?.nodes?.find(n => n.unit_id === photo.id);
                    if (node) setClickedNode(node);
                  }}>
                    <img
                      src={getThumbnailUrl(photo.id, photo.cache_key)}
                      alt="NAS Photo"
                      loading="lazy"
                      onError={handleImageError}
                    />
                    <div className="photo-date">
                      {new Date(photo.takentime * 1000).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-photos">
                  {photosLoading ? t('searchingPhotos') : t('noPhotos')}
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'group' && (
          <div className="group-container">
            <div className="group-header">
              <div className="group-chips">
                <button
                  className={`group-chip ${groupKey === 'family' ? 'active' : ''}`}
                  onClick={() => setGroupKey('family')}
                >
                  👪 {t('family')}
                </button>
                <button
                  className={`group-chip ${groupKey === 'person' ? 'active' : ''}`}
                  onClick={() => setGroupKey('person')}
                >
                  👤 {t('person')}
                </button>
                <button
                  className={`group-chip ${groupKey === 'location' ? 'active' : ''}`}
                  onClick={() => setGroupKey('location')}
                >
                  📍 {t('location')}
                </button>
              </div>
            </div>

            <div className={`grouped-content ${groupedLoading ? 'loading-opacity' : ''}`}>
              {groupedPhotos.length > 0 ? (
                groupedPhotos.map(group => {
                  const getRowLimit = (size) => {
                    if (size === 'sm') return 10;
                    if (size === 'm') return 6;
                    return 4; // 'xl'
                  };
                  const getDomLimit = (size) => {
                    if (size === 'sm') return 35;
                    if (size === 'm') return 20;
                    return 10; // 'xl'
                  };
                  const buttonThreshold = getRowLimit(thumbnailSize);
                  const domLimit = getDomLimit(thumbnailSize);
                  const isExpanded = expandedGroups[group.group_name];
                  const hasMoreThanOneRow = group.photos.length > buttonThreshold;
                  const visiblePhotos = isExpanded ? group.photos : group.photos.slice(0, domLimit);

                  // Calculate youngest and oldest photo years
                  const years = group.photos
                    .map(p => p.takentime)
                    .filter(t => typeof t === 'number' && t > 0)
                    .map(t => new Date(t * 1000).getFullYear());
                  
                  let groupMeta = "";
                  if (years.length > 0) {
                    const maxYear = Math.max(...years);
                    const minYear = Math.min(...years);
                    const yearRange = maxYear === minYear ? `${maxYear}` : `${maxYear}-${minYear}`;
                    groupMeta = `(${yearRange})`;
                  }

                  return (
                    <div key={group.group_name} className="group-section">
                      <div className="group-section-header">
                        <h2 className="group-section-title">
                          {groupKey === 'family' && '👪 '}
                          {groupKey === 'person' && '👤 '}
                          {groupKey === 'location' && '📍 '}
                          {group.group_name} {groupMeta && <span className="group-count">{groupMeta}</span>}
                        </h2>
                        {hasMoreThanOneRow ? (
                          <button 
                            className="group-expand-btn"
                            onClick={() => toggleGroup(group.group_name)}
                          >
                            {isExpanded ? t('collapse') : t('showAll', group.photos.length)}
                          </button>
                        ) : (
                          <span className="group-info-badge">
                            {t('imagesCount', group.photos.length)}
                          </span>
                        )}
                      </div>
                      <div className={`photo-grid size-${thumbnailSize} ${!isExpanded ? 'collapsed' : ''}`}>
                        {visiblePhotos.map(photo => (
                          <div key={photo.id} className="photo-card" onClick={() => {
                            setSelectedPhoto(photo);
                            const node = graphData?.nodes?.find(n => n.unit_id === photo.id);
                            if (node) setClickedNode(node);
                          }}>
                            <img
                              src={getThumbnailUrl(photo.id, photo.cache_key)}
                              alt="NAS Photo"
                              loading="lazy"
                              onError={handleImageError}
                            />
                            <div className="photo-date">
                              {photo.takentime ? new Date(photo.takentime * 1000).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US') : t('unknown')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="no-photos">
                  {groupedLoading ? t('groupingPhotos') : t('noGroupedPhotos')}
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'graph' && (
          <ErrorBoundary>
            <div className="graph-view" style={{ width: '100%', height: 'calc(100vh - 70px)', background: '#020617' }}>
              <ForceGraph2D
                ref={fgRef}
                graphData={displayGraphData}
                width={windowSize.width - 240}
                height={windowSize.height - 70}
                nodeLabel="label"
                nodeAutoColorBy="type"
                linkDirectionalParticles={1}
                linkColor={link => {
                  if (!hoverNode) return 'rgba(255, 255, 255, 0.2)';
                  const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
                  const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
                  return highlightLinks.has(`${sourceId}-${targetId}`) ? 'rgba(56, 189, 248, 1)' : 'rgba(255, 255, 255, 0.05)';
                }}
                linkWidth={link => {
                  if (!hoverNode) return 1;
                  const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
                  const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
                  return highlightLinks.has(`${sourceId}-${targetId}`) ? 2 : 1;
                }}
                nodePointerAreaPaint={sharedNodePointerAreaPaint}
                nodeCanvasObject={(node, ctx, globalScale) => sharedNodeCanvasObject(node, ctx, globalScale, highlightNodes)}
                onNodeClick={node => {
                  const isSame = clickedNode && String(node.id) === String(clickedNode.id);
                  setClickedNode(isSame ? null : node);
                  
                  if (fgRef.current) {
                    setTimeout(() => {
                      if (fgRef.current) fgRef.current.zoomToFit(800, 50);
                    }, 500);
                  }
                  
                  if (node.type === 'Photo') {
                    setSelectedPhoto({
                      id: node.unit_id,
                      cache_key: node.cache_key,
                      takentime: node.takentime
                    });
                  }
                }}
                onNodeHover={node => {
                  if (hoverNode?.id !== node?.id) {
                    setHoverNode(node || null);
                  }
                }}
                onBackgroundClick={handleCloseOverlay}
              />
            </div>
          </ErrorBoundary>
        )}
      </main>

      {selectedPhoto && (
        <div className="overlay-modal" onClick={handleCloseOverlay}>
          <button className="overlay-close" onClick={handleCloseOverlay}>✕</button>
          
          <div className="overlay-left-pane" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-image-container">
              <img 
                className="overlay-image"
                src={getOriginalUrl(selectedPhoto.id, selectedPhoto.cache_key)} 
                alt="NAS Original Photo" 
              />
            </div>
            
            <div className="overlay-metadata">
              {selectedPhoto.takentime && (
                <div style={{ marginBottom: photoDetails?.families?.length ? '1rem' : 0 }}>
                  📅 {new Date(selectedPhoto.takentime * 1000).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
                </div>
              )}
              
              {photoDetails && photoDetails.families && photoDetails.families.length > 0 && (
                <div className="family-details">
                  {photoDetails.families.map(family => (
                    <div key={family.name} className="family-container">
                      <h4 className="family-name">{family.name}</h4>
                      <div className="person-chips">
                        {family.members.map(member => {
                          const inPhoto = photoDetails.persons_in_photo.includes(member);
                          return (
                            <span 
                              key={member} 
                              className={`person-chip ${inPhoto ? 'in-photo' : ''}`}
                              title={inPhoto ? "Person im Bild" : "Familienmitglied (nicht im Bild)"}
                            >
                              {member}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="overlay-right-pane" onClick={(e) => e.stopPropagation()}>
            <ErrorBoundary>
              <ForceGraph2D
                ref={modalFgRef}
                width={Math.floor(windowSize.width / 3)}
                height={windowSize.height}
                graphData={modalGraphData}
                nodeId="id"
                nodeLabel="name"
                nodeColor={node => node.color || '#38bdf8'}
                linkColor={link => {
                  if (!hoverNode) return 'rgba(255, 255, 255, 0.2)';
                  const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
                  const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
                  return modalHighlightLinks.has(`${sourceId}-${targetId}`) ? 'rgba(244, 63, 94, 0.8)' : 'rgba(255, 255, 255, 0.2)';
                }}
                linkWidth={link => {
                  if (!hoverNode) return 1;
                  const sourceId = String(typeof link.source === 'object' ? link.source.id : link.source);
                  const targetId = String(typeof link.target === 'object' ? link.target.id : link.target);
                  return modalHighlightLinks.has(`${sourceId}-${targetId}`) ? 2 : 1;
                }}
                nodeCanvasObject={(node, ctx, globalScale) => sharedNodeCanvasObject(node, ctx, globalScale, modalHighlightNodes)}
                nodePointerAreaPaint={sharedNodePointerAreaPaint}
                onEngineStop={() => {
                  if (modalFgRef.current) {
                    modalFgRef.current.zoomToFit(400, 50);
                  }
                }}
                onNodeHover={node => {
                  if (hoverNode?.id !== node?.id) {
                    setHoverNode(node || null);
                  }
                }}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
