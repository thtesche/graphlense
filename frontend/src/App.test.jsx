import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock react-force-graph-2d to prevent canvas/WebGL issues in jsdom
vi.mock('react-force-graph-2d', () => ({
  default: () => <div data-testid="mock-force-graph" />
}));

describe('App Component', () => {
  it('renders NAS Login screen when not authenticated', () => {
    // Render the App
    render(<App />);
    
    // Check if the NAS Login title is rendered
    expect(screen.getByText('NAS Login')).toBeInTheDocument();
    
    // Check if Account input is rendered
    expect(screen.getByPlaceholderText('Account')).toBeInTheDocument();
    
    // Check if Password input is rendered
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });
});
