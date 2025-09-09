// Utility functions for tolerant word-by-word alignment
// Handles minor mismatches by allowing fuzzy matches and small skips.

function normalizeWord(w) {
  return (w || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[.,;:!?"'()\[\]{}«»„”]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[n];
}

function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - d / maxLen;
}

export function tokenizeWords(text) {
  const tokens = [];
  const words = [];
  let wordIndex = -1;
  const parts = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      tokens.push({ text: part, isWord: false, wordIndex: null });
    } else {
      // Further split non-space by punctuation boundaries but keep them
      const subParts = part.split(/([.,;:!?"'()\[\]{}«»„”])/).filter(Boolean);
      for (const sp of subParts) {
        if (/^[.,;:!?"'()\[\]{}«»„”]$/.test(sp)) {
          tokens.push({ text: sp, isWord: false, wordIndex: null });
        } else {
          wordIndex += 1;
          const norm = normalizeWord(sp);
          words.push({ original: sp, norm, index: wordIndex });
          tokens.push({ text: sp, isWord: true, wordIndex });
        }
      }
    }
  }
  return { tokens, words };
}

// Align a batch of spoken words to expected words, starting at pointer.
// Returns { matchedIndices: number[], newPointer }
export function alignBatch(expectedWords, pointer, spokenText, opts = {}) {
  const spoken = String(spokenText || '')
    .toLowerCase()
    .replace(/\r\n/g, ' ')
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
  if (!spoken.length) return { matchedIndices: [], newPointer: pointer };
  const matched = [];
  let p = pointer;
  const SIM_THRESHOLD = opts.similarityThreshold ?? 0.65;
  for (const sw of spoken) {
    if (p >= expectedWords.length) break;
    const exp = expectedWords[p]?.norm || '';
    const s0 = similarity(sw, exp);
    if (s0 >= SIM_THRESHOLD) {
      matched.push(expectedWords[p].index);
      p += 1;
      continue;
    }
    // lookahead 1 and 2 to allow a skipped word
    const exp1 = expectedWords[p + 1]?.norm || '';
    const exp2 = expectedWords[p + 2]?.norm || '';
    const s1 = similarity(sw, exp1);
    const s2 = similarity(sw, exp2);
    if (s1 >= SIM_THRESHOLD) {
      // consider previous (p) as implicitly matched (user paraphrased it)
      matched.push(expectedWords[p].index);
      p += 1;
      matched.push(expectedWords[p].index);
      p += 1;
      continue;
    }
    if (s2 >= SIM_THRESHOLD) {
      matched.push(expectedWords[p].index);
      p += 1;
      matched.push(expectedWords[p].index);
      p += 1;
      matched.push(expectedWords[p].index);
      p += 1;
      continue;
    }
    // no match; ignore this spoken token
  }
  return { matchedIndices: matched, newPointer: p };
}
