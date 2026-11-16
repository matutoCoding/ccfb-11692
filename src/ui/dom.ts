/** 极简 DOM 构建工具 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v as unknown as EventListener);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === 'string' ? c : c);
  return node;
}

export function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, [el('span', {}, [label]), input]);
}

export function numberInput(value: number, onChange: (v: number) => void, opts: { min?: number; max?: number; step?: number } = {}): HTMLInputElement {
  const inp = el('input', { type: 'number', value: String(value) }) as HTMLInputElement;
  if (opts.min !== undefined) inp.min = String(opts.min);
  if (opts.max !== undefined) inp.max = String(opts.max);
  if (opts.step !== undefined) inp.step = String(opts.step);
  inp.addEventListener('change', () => {
    const v = Number(inp.value);
    if (Number.isFinite(v)) onChange(v);
  });
  return inp;
}

export function slider(value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLInputElement {
  const inp = el('input', { type: 'range', value: String(value) }) as HTMLInputElement;
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.addEventListener('input', () => onInput(Number(inp.value)));
  return inp;
}

export function colorInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const inp = el('input', { type: 'color', value }) as HTMLInputElement;
  inp.addEventListener('input', () => onChange(inp.value));
  return inp;
}

export function checkbox(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const inp = el('input', { type: 'checkbox' }) as HTMLInputElement;
  inp.checked = value;
  inp.addEventListener('change', () => onChange(inp.checked));
  return inp;
}

export function selectInput<T extends string>(options: Array<[T, string]>, value: T, onChange: (v: T) => void): HTMLSelectElement {
  const sel = el('select', {}) as HTMLSelectElement;
  for (const [v, label] of options) {
    const opt = el('option', { value: v }, [label]);
    sel.append(opt);
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value as T));
  return sel;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { class: cls }, [label]) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

export function fmt(n: number, digits = 1): string {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtDistance(m: number): string {
  return m >= 1000 ? `${fmt(m / 1000, 2)} km` : `${fmt(m, 0)} m`;
}
