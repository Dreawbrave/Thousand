export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'logo--compact' : ''}`} aria-label="Тысяча">
      <span className="logo__mark"><i>1</i><i>0</i><i>0</i><i>0</i></span>
      {!compact && <span className="logo__word">ТЫСЯЧА</span>}
    </div>
  )
}
