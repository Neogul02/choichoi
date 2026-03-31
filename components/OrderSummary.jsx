'use client';

export default function OrderSummary({ items, counts, totalPrice, onCheckout, isLoading }) {
  const orderedItems = items.filter((item) => counts[item.id] > 0);

  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f9f9f9',
        borderRadius: '8px',
        marginTop: '20px',
      }}
    >
      <h2 style={{ margin: '0 0 16px 0' }}>주문 현황</h2>

      {orderedItems.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center' }}>주문하신 항목이 없습니다</p>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          {orderedItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid #eee',
              }}
            >
              <div>
                <span>{item.name}</span>
                <span style={{ marginLeft: '12px', color: '#666' }}>×{counts[item.id]}</span>
              </div>
              <span style={{ fontWeight: 'bold' }}>
                ₩{(item.price * counts[item.id]).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '20px',
          fontWeight: 'bold',
          padding: '12px 0',
          borderTop: '2px solid #333',
          marginTop: '12px',
        }}
      >
        <span>합계</span>
        <span>₩{totalPrice.toLocaleString()}</span>
      </div>

      <button
        onClick={onCheckout}
        disabled={orderedItems.length === 0 || isLoading}
        style={{
          width: '100%',
          padding: '16px',
          marginTop: '16px',
          fontSize: '16px',
          fontWeight: 'bold',
          backgroundColor: orderedItems.length === 0 ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: orderedItems.length === 0 || isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading ? '처리 중...' : '결제완료'}
      </button>
    </div>
  );
}
