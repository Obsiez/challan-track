import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', textAlign: 'center', marginTop: '50px' }}>
          <div style={{ display: 'inline-block', backgroundColor: '#fee2e2', color: '#991b1b', padding: '20px', borderRadius: '8px', border: '1px solid #f87171', maxWidth: '600px', wordBreak: 'break-word' }}>
            <h1 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 'bold' }}>Application Error</h1>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Something went wrong. Please screenshot this and share it:</p>
            <pre style={{ backgroundColor: '#fff', padding: '10px', borderRadius: '4px', textAlign: 'left', overflowX: 'auto', fontSize: '12px' }}>
              {this.state.error && this.state.error.toString()}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{ marginTop: '15px', padding: '10px 15px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Clear Local Data & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
