/**
 * Hello Extension Component
 * Basic component to verify React setup works correctly
 */

import React from 'react';

export function HelloExtension() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 'bold',
          marginBottom: '16px',
          color: '#333',
        }}
      >
        Hello Extension
      </h1>
      <p
        style={{
          fontSize: '16px',
          color: '#666',
          margin: 0,
        }}
      >
        Suna Coin Analysis Extension
      </p>
      <p
        style={{
          fontSize: '14px',
          color: '#999',
          marginTop: '8px',
        }}
      >
        Popup is working correctly!
      </p>
    </div>
  );
}

