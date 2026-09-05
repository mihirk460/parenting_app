// Month calendar. dotsFor(dateStr) returns an array of status classes
// ('approved' | 'submitted' | 'missed' | 'open') shown as dots under the day.
import { toDateStr, today } from './store.js';
import { on } from './ui.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function mountCalendar(container, { dotsFor, onSelect }) {
  let selected = today();
  let [year, month] = selected.split('-').map(Number);
  month -= 1;

  function draw() {
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(year, month, 1 - startOffset + i);
      const ds = toDateStr(d);
      const other = d.getMonth() !== month;
      const dots = other ? [] : dotsFor(ds).slice(0, 4);
      cells.push(`<button class="cal-day ${other ? 'other' : ''} ${ds === today() ? 'today' : ''} ${ds === selected ? 'selected' : ''}" data-date="${ds}">
        <span>${d.getDate()}</span>
        <span class="dots">${dots.map((c) => `<i class="${c}"></i>`).join('')}</span>
      </button>`);
      if (i >= startOffset + daysInMonth - 1 && (i + 1) % 7 === 0) break;
    }
    const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    container.innerHTML = `
      <div class="cal-head">
        <button class="btn sm neutral" data-nav="-1">‹</button>
        <strong>${title}</strong>
        <button class="btn sm neutral" data-nav="1">›</button>
      </div>
      <div class="cal-grid">
        ${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells.join('')}
      </div>`;
  }

  on(container, 'click', '[data-nav]', (el) => {
    month += Number(el.dataset.nav);
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    draw();
  });
  on(container, 'click', '[data-date]', (el) => {
    selected = el.dataset.date;
    draw();
    onSelect(selected);
  });

  draw();
  onSelect(selected);
  return { redraw: draw };
}
