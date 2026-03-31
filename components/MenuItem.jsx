'use client';

import { useState } from 'react';

export default function MenuItem({ item, count, onIncrease, onDecrease }) {
  return (
    <div
      style={{
        backgroundColor: item.color || '#f0f0f0',
        padding: '20px',
        borderRadius: '8px',
        textAlign: 'center',
        cursor: 'pointer',
        minHeight: '150px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
          {item.name}
        </h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
          ₩{item.price.toLocaleString()}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={onDecrease}
          style={{
            width: '40px',
            height: '40px',
            fontSize: '20px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#ddd',
            cursor: 'pointer',
          }}
        >
          −
        </button>
        <span style={{ fontSize: '18px', fontWeight: 'bold', minWidth: '30px', textAlign: 'center' }}>
          {count}
        </span>
        <button
          onClick={onIncrease}
          style={{
            width: '40px',
            height: '40px',
            fontSize: '20px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#4CAF50',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
