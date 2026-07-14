const dotMap: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

type DieProps = { value: number; scoring?: boolean; rolling?: boolean; delay?: number }

export function Die({ value, scoring, rolling, delay = 0 }: DieProps) {
  return (
    <div
      className={`die ${scoring ? 'die--scoring' : ''} ${rolling ? 'die--rolling' : ''}`}
      style={{ '--delay': `${delay}ms` } as React.CSSProperties}
      aria-label={`Кость: ${value}`}
    >
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} className={dotMap[value]?.includes(index) ? 'pip pip--on' : 'pip'} />
      ))}
    </div>
  )
}
