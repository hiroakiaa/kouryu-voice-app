const resets = new WeakMap();

export async function copyNumberFeedback(button, value, write = text => navigator.clipboard.writeText(text)) {
  try {
    await write(value);
  } catch (_) {
    throw new Error('コピーできませんでした。もう一度お試しください。');
  }
  clearTimeout(resets.get(button));
  const icon = button.querySelector('i');
  icon.className = 'fa-solid fa-check';
  button.setAttribute('aria-label', 'コピー済み');
  button.title = 'コピー済み';
  let note = button.querySelector('.phone-copy-note');
  if (!note) {
    note = document.createElement('span');
    note.className = 'phone-copy-note';
    note.setAttribute('role', 'status');
    button.append(note);
  }
  note.textContent = '自分の番号をコピーしました。';
  note.hidden = false;
  resets.set(button, setTimeout(() => {
    icon.className = 'fa-regular fa-copy';
    button.setAttribute('aria-label', '自分の番号をコピー');
    button.title = '自分の番号をコピー';
    note.hidden = true;
    resets.delete(button);
  }, 2500));
}
