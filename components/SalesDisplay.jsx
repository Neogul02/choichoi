'use client';

export default function SalesDisplay({ sales, isLoading }) {
  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f0f8ff',
        borderRadius: '8px',
        marginBottom: '20px',
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: '0 0 16px 0' }}>당일 매출</h2>

      {isLoading ? (
        <div style={{ color: '#999' }}>로딩 중...</div>
      ) : (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <p style={{ margin: '0 0 4px 0', color: '#666', fontSize: '14px' }}>총 주문</p>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold' }}>
              {sales?.totalOrders || 0}건
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px 0', color: '#666', fontSize: '14px' }}>총 매출</p>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>
              ₩{(sales?.totalRevenue || 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
