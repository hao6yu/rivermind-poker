export interface ActionBubbleCopyParts {
  after: string;
  before: string;
  emphasis: string;
}

/**
 * Select the authoritative action word at the end of a playful line. Using
 * the last match avoids bolding a coincidental verb in the personality copy.
 */
export function splitActionBubbleCopy(
  text: string,
  emphasis: string,
): ActionBubbleCopyParts {
  if (!emphasis) return { after: '', before: text, emphasis: '' };
  const normalizedText = text.toLocaleLowerCase();
  const normalizedEmphasis = emphasis.toLocaleLowerCase();
  const needsLatinWordBoundary = /^[a-z]+$/i.test(emphasis);
  let index = normalizedText.lastIndexOf(normalizedEmphasis);
  while (index >= 0 && needsLatinWordBoundary) {
    const before = normalizedText[index - 1] ?? '';
    const after = normalizedText[index + normalizedEmphasis.length] ?? '';
    if (!/[a-z]/i.test(before) && !/[a-z]/i.test(after)) break;
    index = normalizedText.lastIndexOf(normalizedEmphasis, index - 1);
  }
  if (index < 0) return { after: '', before: text, emphasis: '' };
  return {
    after: text.slice(index + emphasis.length),
    before: text.slice(0, index),
    emphasis: text.slice(index, index + emphasis.length),
  };
}
