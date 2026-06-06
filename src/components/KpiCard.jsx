export default function KpiCard({ label, value, sub, subColor }) {
  const colors = {
    up: 'var(--color-success)',
    down: 'var(--color-danger)',
    neutral: 'var(--color-text-tertiary)'
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
    }}>
      <div style={{
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        marginBottom: 4
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18,
        fontWeight: 500,
        color: 'var(--color-text)',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 10,
          marginTop: 3,
          color: colors[subColor] || 'var(--color-text-tertiary)'
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}