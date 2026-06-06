export default function PeriodeFilter({
  moisDe, setMoisDe,
  moisA, setMoisA,
  year1, setYear1,
  year2, setYear2,
  shortcut, setShortcut,
  availableYears = [2024, 2023, 2022]
}) {
  const mois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  const shortcuts = [
    { key: 'annee', label: 'Année complète', de: 0, a: 11 },
    { key: 's1', label: 'Semestre 1', de: 0, a: 5 },
    { key: 's2', label: 'Semestre 2', de: 6, a: 11 },
    { key: 't1', label: 'T1', de: 0, a: 2 },
    { key: 't2', label: 'T2', de: 3, a: 5 },
    { key: 't3', label: 'T3', de: 6, a: 8 },
    { key: 't4', label: 'T4', de: 9, a: 11 },
  ]

  const handleShortcut = (sc) => {
    setShortcut(sc.key)
    setMoisDe(sc.de)
    setMoisA(sc.a)
  }

  const handleMoisChange = (field, val) => {
    setShortcut('custom')
    if (field === 'de') setMoisDe(Number(val))
    else setMoisA(Number(val))
  }

  const btnBase = {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 16,
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s'
  }

  const btnActive = {
    ...btnBase,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontWeight: 500,
    borderColor: 'var(--color-text-tertiary)'
  }

  const selectStyle = {
    fontSize: 12,
    padding: '4px 6px',
    borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginRight: 2 }}>
          Période rapide
        </span>
        {shortcuts.map(sc => (
          <button
            key={sc.key}
            onClick={() => handleShortcut(sc)}
            style={shortcut === sc.key ? btnActive : btnBase}
          >
            {sc.label}
          </button>
        ))}
        {shortcut === 'custom' && (
          <button style={btnActive}>Personnalisé</button>
        )}
      </div>

      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>De</span>
          <select style={selectStyle} value={moisDe} onChange={e => handleMoisChange('de', e.target.value)}>
            {mois.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>à</span>
          <select style={selectStyle} value={moisA} onChange={e => handleMoisChange('a', e.target.value)}>
            {mois.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>

        <div style={{ width: '0.5px', height: 24, background: 'var(--color-border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select style={selectStyle} value={year1} onChange={e => setYear1(Number(e.target.value))}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>vs</span>
          <select style={selectStyle} value={year2} onChange={e => setYear2(Number(e.target.value))}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}