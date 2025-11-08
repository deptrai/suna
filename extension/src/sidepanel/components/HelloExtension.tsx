/**
 * Hello Extension Component
 * 
 * Basic component to verify React setup in side panel.
 * This will be replaced with full UI in Story 12.1.
 */

export function HelloExtension() {
  return (
    <div
      style={{
        padding: '20px',
        textAlign: 'center',
        color: '#333',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Hello Extension</h1>
      <p style={{ fontSize: '16px', color: '#666' }}>
        Side panel is working! 🎉
      </p>
      <p style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
        Full UI will be implemented in Story 12.1
      </p>
    </div>
  );
}

