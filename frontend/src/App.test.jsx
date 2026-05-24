import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';

// Interactive Mock for react-force-graph-2d exposing zoomToFit ref helper
vi.mock('react-force-graph-2d', async () => {
  const React = await import('react');
  const MockForceGraph = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      zoomToFit: vi.fn(),
      d3ReheatSimulation: vi.fn()
    }));

    React.useEffect(() => {
      if (props.graphData && props.graphData.nodes) {
        const mockCtx = {
          save: () => {},
          restore: () => {},
          beginPath: () => {},
          arc: () => {},
          clip: () => {},
          drawImage: () => {},
          fill: () => {},
          stroke: () => {},
          fillText: () => {}
        };
        props.graphData.nodes.forEach(node => {
          if (props.nodeCanvasObject) {
            props.nodeCanvasObject(node, mockCtx, 1);
          }
        });
        props.graphData.links?.forEach(link => {
          if (props.linkColor) props.linkColor(link);
          if (props.linkWidth) props.linkWidth(link);
        });
      }
      if (props.onEngineStop) {
        props.onEngineStop();
      }
    }, [props.graphData]);

    const handleNodeClick = () => {
      if (props.onNodeClick && props.graphData?.nodes?.[0]) {
        props.onNodeClick(props.graphData.nodes[0]);
      }
    };

    const handleHover = () => {
      if (props.onNodeHover && props.graphData?.nodes?.[0]) {
        props.onNodeHover(props.graphData.nodes[0]);
      }
    };

    const handleHoverOut = () => {
      if (props.onNodeHover) {
        props.onNodeHover(null);
      }
    };

    const handleBgClick = () => {
      if (props.onBackgroundClick) {
        props.onBackgroundClick();
      }
    };

    return (
      <div 
        data-testid="mock-force-graph"
        style={{ width: props.width, height: props.height }}
      >
        <button data-testid="graph-node-click" onClick={handleNodeClick}>Click Node</button>
        <button data-testid="graph-node-hover" onMouseEnter={handleHover} onMouseLeave={handleHoverOut}>Hover Node</button>
        <button data-testid="graph-bg-click" onClick={handleBgClick}>Click Background</button>
        {props.nodeColor && props.graphData?.nodes?.map(node => (
          <div key={node.id} data-testid="node-color-indicator">
            {props.nodeColor(node)}
          </div>
        ))}
      </div>
    );
  });

  return {
    default: MockForceGraph
  };
});

// Mock global fetch with robust path-based routing
const mockFetch = vi.fn((url, options) => {
  const urlStr = typeof url === 'string' ? url : (url?.url || '');
  console.log("TEST FETCH CALL:", urlStr);
  const pathname = urlStr.split('?')[0];

  if (pathname.endsWith('/login')) {
    if (options && options.body && JSON.parse(options.body).passwd === 'wrong') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: false,
          error: { code: 401 }
        })
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: { sid: 'sid_123', synotoken: 'token_123', account: 'alice' }
      })
    });
  }
  
  if (pathname.endsWith('/filters')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        families: ['Family Alpha'],
        persons: ['Alice', 'Bob'],
        countries: ['Germany']
      })
    });
  }
  
  if (pathname.endsWith('/graph')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        nodes: [
          { id: 'photo_1', type: 'Photo', label: 'img1.jpg', unit_id: 1, cache_key: 'k1', takentime: 1000 },
          { id: 'person_alice', type: 'Person', label: 'Alice' }
        ],
        links: [{ source: 'photo_1', target: 'person_alice', type: 'HAS_PERSON' }]
      })
    });
  }
  
  if (pathname.endsWith('/photos/grouped')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        {
          group_name: 'Family Alpha',
          photos: [{ id: 1, cache_key: 'k1', takentime: 1000 }]
        }
      ])
    });
  }
  
  if (pathname.endsWith('/photos')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        owner: 'alice',
        photos: [{ id: 1, cache_key: 'k1', takentime: 1000 }]
      })
    });
  }
  
  if (pathname.includes('/photo/') && pathname.endsWith('/details')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        persons_in_photo: ['Alice'],
        families: [{ name: 'Family Alpha', members: ['Alice', 'Bob'] }]
      })
    });
  }
  
  return Promise.reject(new Error(`Unhandled fetch mock: ${urlStr}`));
});

vi.stubGlobal('fetch', mockFetch);

describe('App Component', () => {
  beforeEach(() => {
    // Clear cookies before each test
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    localStorage.clear();
    localStorage.setItem('language', 'de'); // Set German language to make UI text deterministic
    window.location.hash = '';
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders NAS Login screen when not authenticated', () => {
    render(<App />);
    expect(screen.getByText('NAS Login')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Passwort')).toBeInTheDocument();
  });

  it('handles failed login flow', async () => {
    render(<App />);
    
    fireEvent.change(screen.getByPlaceholderText('Account'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Passwort'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einloggen' }));

    await waitFor(() => {
      expect(screen.getByText('Login fehlgeschlagen: Code 401')).toBeInTheDocument();
    });
  });

  it('handles successful login flow and transitions to dashboard', async () => {
    render(<App />);
    
    fireEvent.change(screen.getByPlaceholderText('Account'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Passwort'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einloggen' }));

    expect(await screen.findByText('GraphStation')).toBeInTheDocument();
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();
    expect(document.cookie).toContain('sid=sid_123');
  });

  it('logs in automatically if cookies exist', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    
    expect(await screen.findByText('GraphStation')).toBeInTheDocument();
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();
  });

  it('handles logout flow', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    
    const logoutBtn = await screen.findByRole('button', { name: 'Logout' });
    fireEvent.click(logoutBtn);
    
    expect(await screen.findByText('NAS Login')).toBeInTheDocument();
    expect(document.cookie).not.toContain('sid=sid_123');
  });

  it('allows switching views via tabs', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    
    expect(await screen.findByText('🗂️ Gruppiert')).toBeInTheDocument();
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();

    const filterTab = screen.getByRole('button', { name: '🔍 Filtern' });
    fireEvent.click(filterTab);
    
    expect(await screen.findByLabelText('Familie')).toBeInTheDocument();
    expect(screen.getByLabelText('Person')).toBeInTheDocument();
    expect(screen.getByLabelText('Land')).toBeInTheDocument();

    const graphTab = screen.getByRole('button', { name: '🌐 Graph' });
    fireEvent.click(graphTab);
    
    expect(screen.getByTestId('mock-force-graph')).toBeInTheDocument();
  });

  it('allows filtering and resetting filters', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();
    
    const filterTab = screen.getByRole('button', { name: '🔍 Filtern' });
    fireEvent.click(filterTab);

    const familySelect = await screen.findByLabelText('Familie');
    fireEvent.change(familySelect, { target: { value: 'Family Alpha' } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/photos?family=Family+Alpha'), expect.any(Object));
    });

    const resetBtn = await screen.findByRole('button', { name: '✕ Filter zurücksetzen' });
    fireEvent.click(resetBtn);

    expect(familySelect.value).toBe('');
  });

  it('handles grouped photo interactions', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();
    
    const familyElements = await screen.findAllByText(/Family Alpha/);
    expect(familyElements.length).toBeGreaterThan(0);
    
    // Toggle collapse/expand
    const toggleBtn = familyElements[0];
    fireEvent.click(toggleBtn);
    
    // Change grouping key
    const personChip = screen.getByRole('button', { name: '👤 Person' });
    fireEvent.click(personChip);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/photos/grouped?by=person'), expect.any(Object));
    });
  });

  it('handles opening and closing the photo details modal and hash history', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();
    
    const filterTab = screen.getByRole('button', { name: '🔍 Filtern' });
    fireEvent.click(filterTab);

    const photoCard = await screen.findByAltText('NAS Photo');
    fireEvent.click(photoCard);

    expect(window.location.hash).toBe('#detail');
    expect(await screen.findByAltText('NAS Original Photo')).toBeInTheDocument();
    expect(screen.getAllByText(/Family Alpha/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);

    // Hover the modal detail graph to exercise link colors and highlight branches
    const modalHoverBtn = screen.getAllByTestId('graph-node-hover')[0];
    fireEvent.mouseEnter(modalHoverBtn);
    fireEvent.mouseLeave(modalHoverBtn);

    // Close via Close button (reverts history)
    const closeBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(window.location.hash).toBe('');
    });

    // Open again to test hash back navigation
    fireEvent.click(photoCard);
    expect(window.location.hash).toBe('#detail');

    // Simulate browser back button click by removing #detail hash
    act(() => {
      window.location.hash = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.queryByAltText('NAS Original Photo')).not.toBeInTheDocument();
  });

  it('allows clicking photo card inside grouped container to open detail modal', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();
    
    const photoCard = await screen.findByAltText('NAS Photo');
    fireEvent.click(photoCard);
    
    expect(window.location.hash).toBe('#detail');
    expect(await screen.findByAltText('NAS Original Photo')).toBeInTheDocument();
  });

  it('exercises ForceGraph interactions, node clicks, hovering, and background click', async () => {
    document.cookie = 'sid=sid_123; path=/';
    document.cookie = 'synotoken=token_123; path=/';
    
    render(<App />);
    expect(await screen.findByText('Hallo, alice 👋')).toBeInTheDocument();
    
    // Switch to graph view
    const graphTab = screen.getByRole('button', { name: '🌐 Graph' });
    fireEvent.click(graphTab);
    
    // Check that graph renders
    expect(screen.getByTestId('mock-force-graph')).toBeInTheDocument();

    // Trigger Node Click inside the force graph mock
    const clickBtn = screen.getAllByTestId('graph-node-click')[0];
    fireEvent.click(clickBtn);

    // Trigger hover events inside the force graph mock
    const hoverBtn = screen.getAllByTestId('graph-node-hover')[0];
    fireEvent.mouseEnter(hoverBtn);
    fireEvent.mouseLeave(hoverBtn);

    // Trigger background click inside the force graph mock
    const bgClickBtn = screen.getAllByTestId('graph-bg-click')[0];
    fireEvent.click(bgClickBtn);
  });
});
