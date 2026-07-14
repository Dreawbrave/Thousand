import { X } from 'lucide-react'

export function RulesModal({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="rules" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button rules__close" onClick={close} aria-label="Закрыть"><X /></button>
        <p className="eyebrow">ШПАРГАЛКА</p>
        <h2>Как добраться до косаря</h2>
        <div className="rules__grid">
          <article><b>1 = 10</b><span>Одиночная единица</span></article>
          <article><b>5 = 5</b><span>Одиночная пятёрка</span></article>
          <article><b>×3 / ×4 / ×5</b><span>Три одинаковых: номинал ×10, четыре удваивают, пять дают ×10 от тройки</span></article>
          <article><b>1—5 = 125</b><span>Малый стрит</span></article>
          <article><b>2—6 = 250</b><span>Большой стрит</span></article>
          <article><b>🔥 Все пять</b><span>Кости возвращаются, обязательный новый бросок</span></article>
        </div>
        <div className="rules__notes">
          <p><strong>Вход — 50.</strong> Первый раз нужно накопить минимум 50 за один ход.</p>
          <p><strong>Ямы — 200–300 и 600–700.</strong> Если уже сидишь внутри, банк доступен только после выхода за верхнюю границу.</p>
          <p><strong>Болты.</strong> Пустой бросок сжигает очки хода. Каждый третий болт отнимает 50.</p>
          <p><strong>Самосвал.</strong> Ровно 555 очков — и общий счёт падает до нуля.</p>
        </div>
      </section>
    </div>
  )
}
