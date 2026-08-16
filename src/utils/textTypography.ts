/**
 * Clean Paragraph and Two-Column Typesetting Helper for Russian & Multilingual Books
 * Ensures text never breaks mid-word or mid-sentence across columns.
 */

export interface FormattedProseColumns {
  firstChar: string;
  firstParaRest: string;
  col1Paragraphs: string[];
  col2Paragraphs: string[];
}

export function splitProseIntoTwoColumns(fullText: string): FormattedProseColumns {
  if (!fullText || !fullText.trim()) {
    return { firstChar: '', firstParaRest: '', col1Paragraphs: [], col2Paragraphs: [] };
  }

  const rawParagraphs = fullText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (rawParagraphs.length === 0) {
    return { firstChar: '', firstParaRest: '', col1Paragraphs: [], col2Paragraphs: [] };
  }

  const firstPara = rawParagraphs[0];
  const firstChar = firstPara.charAt(0);
  const firstParaRest = firstPara.slice(1);

  if (rawParagraphs.length === 1) {
    const textToSplit = firstParaRest;
    if (textToSplit.length < 140) {
      return { firstChar, firstParaRest, col1Paragraphs: [], col2Paragraphs: [] };
    }

    const mid = Math.floor(textToSplit.length / 2);
    let splitIdx = mid;
    const windowStart = Math.max(0, mid - 140);
    const windowEnd = Math.min(textToSplit.length, mid + 140);
    const searchWindow = textToSplit.substring(windowStart, windowEnd);

    // Look for sentence ending followed by space
    const match = searchWindow.match(/[.!?…]\s+(?=[А-ЯA-Z0-9«"])/);
    if (match && match.index !== undefined) {
      splitIdx = windowStart + match.index + match[0].length;
    } else {
      const spaceMatch = textToSplit.indexOf(' ', mid);
      splitIdx = spaceMatch !== -1 ? spaceMatch + 1 : mid;
    }

    const p1 = textToSplit.substring(0, splitIdx).trim();
    const p2 = textToSplit.substring(splitIdx).trim();

    return {
      firstChar,
      firstParaRest: p1,
      col1Paragraphs: [],
      col2Paragraphs: p2 ? [p2] : [],
    };
  }

  // Multiple paragraphs: distribute paragraphs cleanly
  const totalLength = rawParagraphs.reduce((sum, p) => sum + p.length, 0);
  let accumulated = firstParaRest.length;
  const col1: string[] = [];
  const col2: string[] = [];

  for (let i = 1; i < rawParagraphs.length; i++) {
    const p = rawParagraphs[i];
    if (accumulated + p.length * 0.4 < totalLength * 0.48 || (col1.length === 0 && rawParagraphs.length > 2)) {
      col1.push(p);
      accumulated += p.length;
    } else {
      col2.push(p);
    }
  }

  return {
    firstChar,
    firstParaRest,
    col1Paragraphs: col1,
    col2Paragraphs: col2,
  };
}

export function splitPlainProseIntoTwoColumns(fullText: string): { col1: string[]; col2: string[] } {
  if (!fullText || !fullText.trim()) return { col1: [], col2: [] };
  const paragraphs = fullText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return { col1: [], col2: [] };

  if (paragraphs.length === 1) {
    const text = paragraphs[0];
    if (text.length < 140) return { col1: [text], col2: [] };
    const mid = Math.floor(text.length / 2);
    const windowStart = Math.max(0, mid - 140);
    const windowEnd = Math.min(text.length, mid + 140);
    const searchWindow = text.substring(windowStart, windowEnd);
    const match = searchWindow.match(/[.!?…]\s+(?=[А-ЯA-Z0-9«"])/);
    let splitIdx = mid;
    if (match && match.index !== undefined) {
      splitIdx = windowStart + match.index + match[0].length;
    } else {
      const spaceIdx = text.indexOf(' ', mid);
      splitIdx = spaceIdx !== -1 ? spaceIdx + 1 : mid;
    }
    return {
      col1: [text.substring(0, splitIdx).trim()],
      col2: [text.substring(splitIdx).trim()].filter(Boolean),
    };
  }

  const totalLength = paragraphs.reduce((sum, p) => sum + p.length, 0);
  let acc = 0;
  const col1: string[] = [];
  const col2: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (acc + p.length * 0.4 < totalLength * 0.48 || (col1.length === 0 && paragraphs.length > 2)) {
      col1.push(p);
      acc += p.length;
    } else {
      col2.push(p);
    }
  }

  return { col1, col2 };
}
