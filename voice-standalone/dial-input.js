const compact = value => value.normalize('NFKC').replace(/[\s-]/g, '');
export const formatDial = value => {
  const raw = compact(value);
  return /^\d{5,}$/.test(raw) ? raw.slice(0, 4) + ' ' + raw.slice(4) : raw;
};
export function bindDialInput(input) {
  let selection = null;
  const remember = () => { selection = [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length]; };
  input.addEventListener('blur', remember);
  input.addEventListener('select', () => { if (document.activeElement === input) remember(); });
  function assign(raw, position) {
    input.value = formatDial(raw);
    const caret = position + (/^\d{5,}$/.test(raw) && position > 4 ? 1 : 0);
    input.setSelectionRange(caret, caret);
    selection = [caret, caret];
  }
  function edit(key, forward = false) {
    const raw = compact(input.value);
    const range = document.activeElement === input ? [input.selectionStart, input.selectionEnd] : selection;
    let start = compact(input.value.slice(0, range?.[0] ?? input.value.length)).length;
    let end = compact(input.value.slice(0, range?.[1] ?? input.value.length)).length;
    if (key === null && start === end) {
      if (forward) end = Math.min(raw.length, end + 1);
      else start = Math.max(0, start - 1);
    }
    const next = raw.slice(0, start) + (key || '') + raw.slice(end);
    if (formatDial(next).length > input.maxLength) return;
    assign(next, start + (key?.length || 0));
  }
  input.addEventListener('input', e => {
    if (e.isComposing) return;
    const position = compact(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
    assign(compact(input.value), position);
  });
  input.addEventListener('compositionend', () => input.dispatchEvent(new Event('input')));
  input.addEventListener('beforeinput', e => {
    if (!e.isComposing && ['deleteContentBackward', 'deleteContentForward'].includes(e.inputType)) {
      e.preventDefault(); edit(null, e.inputType === 'deleteContentForward');
    }
  });
  return edit;
}
