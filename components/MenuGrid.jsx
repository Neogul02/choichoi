'use client';

import MenuItem from './MenuItem';

export default function MenuGrid({ items, counts, onIncrease, onDecrease }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        padding: '16px',
      }}
    >
      {items?.map((item) => (
        <MenuItem
          key={item.id}
          item={item}
          count={counts[item.id] || 0}
          onIncrease={() => onIncrease(item.id)}
          onDecrease={() => onDecrease(item.id)}
        />
      ))}
    </div>
  );
}
