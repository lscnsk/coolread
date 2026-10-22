// The generated cover for books that have none: used for web pages turned into fb2
// and for fb2/epub files without a cover picture.

/** Title page picture: a double frame, the title in capitals at the top, the author at the bottom. */
export async function drawCover(title: string, author: string, scale = 1): Promise<{ base64: string; type: string } | undefined> {
  try {
    const W = 1000, H = 1414;
    const canvas = document.createElement('canvas');
    // The picture is laid out at full size; a smaller scale only makes a smaller image (list thumbnails)
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const g = canvas.getContext('2d');
    if (!g) return undefined;
    g.scale(scale, scale);
    const serif = "Literata, Georgia, 'Times New Roman', serif";
    try {
      // The font comes in pieces by alphabet: ask for the cover's own letters, or only the Latin piece loads
      const sample = `${title} ${author} АБВабв`;
      await Promise.all([document.fonts?.load(`700 80px "Literata"`, sample.toUpperCase()), document.fonts?.load(`400 40px "Literata"`, sample)]);
    } catch {}
    const paper = '#f5efe3', ink = '#2a2420';
    g.fillStyle = paper; g.fillRect(0, 0, W, H);
    g.strokeStyle = ink;
    g.lineWidth = 7; g.strokeRect(48, 48, W - 96, H - 96);
    g.lineWidth = 2.5; g.strokeRect(74, 74, W - 148, H - 148);

    const maxW = W - 148 - 120;
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const words = title.toUpperCase().split(/\s+/).filter(Boolean);
    const wrap = (size: number) => {
      g.font = `700 ${size}px ${serif}`;
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (g.measureText(t).width <= maxW || !cur) cur = t;
        else { lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      return lines;
    };
    let size = 92, lines = wrap(size);
    while (size > 38 && (lines.length > 6 || lines.some(l => g.measureText(l).width > maxW))) { size -= 4; lines = wrap(size); }
    const lh = size * 1.18;
    let y = 74 + 190 + size;
    for (const l of lines) { g.fillText(l, W / 2, y, maxW); y += lh; }

    // A short rule under the title
    g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 60, y - lh + size * 0.55 + 34); g.lineTo(W / 2 + 60, y - lh + size * 0.55 + 34); g.stroke();

    g.font = `400 44px ${serif}`;
    let a = author;
    while (a.length > 3 && g.measureText(a).width > maxW) a = a.slice(0, -2);
    if (a !== author) a = a.trim() + '…';
    g.fillText(a, W / 2, H - 74 - 150, maxW);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    return { base64: dataUrl.split(',')[1], type: 'image/jpeg' };
  } catch {
    return undefined;
  }
}

/** The generated cover as a data: URL, or undefined where canvas is not available. */
export async function generatedCoverUrl(title: string, author: string, scale = 1): Promise<string | undefined> {
  const c = await drawCover(title, author, scale);
  return c ? `data:${c.type};base64,${c.base64}` : undefined;
}
