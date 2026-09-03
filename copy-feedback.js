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
  resets.set(button, setTimeout(() => {
    icon.className = 'fa-regular fa-copy';
    button.setAttribute('aria-label', '自分の番号をコピー');
    button.title = '自分の番号をコピー';
    resets.delete(button);
  }, 2500));
}
