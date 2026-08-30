// Mem-parsing teks bebas (atau tabel markdown) yang ditempel pengguna menjadi
// daftar {name, from, to} — dipakai fitur "tempel daftar bab" pada tool Pisah PDF.
// Semua parsing berjalan di browser, tidak mengirim teks ke mana pun.

const RANGE_RE = /(\d+)\s*(?:-|–|—|to|s\/d|s\.d\.|sampai)\s*(\d+)/gi;
const NOISE_WORDS_RE = /\b(hal(?:aman)?\.?|page|pp?\.)\b/gi;

function splitCells(line, delimiter) {
  return line
    .split(delimiter)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function cleanName(text) {
  return text
    .replace(NOISE_WORDS_RE, ' ')
    .replace(/[:\-–—.,()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse teks/tabel bebas menjadi daftar rentang halaman.
 * Mendukung: tabel markdown ("| Bab | Dari | Sampai |"), baris ber-tab/koma
 * ("Bab 1, 1, 15"), maupun kalimat bebas ("Bab 1: Pendahuluan — 1-15").
 */
export function parseRangesFromText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const ranges = [];
  let skipped = 0;

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;

    if (line.startsWith('|') || line.endsWith('|')) {
      line = line.replace(/^\|/, '').replace(/\|$/, '').trim();
    }
    // Baris pemisah tabel markdown, mis. "---|---|---" atau ":---:|:---:"
    if (/^[\s|:-]+$/.test(line)) continue;

    let cells = null;
    if (raw.includes('|')) cells = splitCells(line, '|');
    else if (line.includes('\t')) cells = splitCells(line, '\t');
    else if (line.includes(',')) cells = splitCells(line, ',');

    let from = null;
    let to = null;
    let name = '';

    if (cells && cells.length >= 2) {
      let rangeCellIdx = -1;
      let rangeMatch = null;
      cells.forEach((c, i) => {
        const matches = [...c.matchAll(RANGE_RE)];
        if (matches.length) {
          rangeCellIdx = i;
          rangeMatch = matches[matches.length - 1];
        }
      });
      if (rangeMatch) {
        from = parseInt(rangeMatch[1], 10);
        to = parseInt(rangeMatch[2], 10);
        name = cells.filter((_, i) => i !== rangeCellIdx).join(' ').trim();
      } else {
        const numericCells = cells.map((c, i) => ({ i, n: /^\d+$/.test(c) ? parseInt(c, 10) : null }));
        const nums = numericCells.filter((c) => c.n !== null);
        if (nums.length >= 2) {
          from = nums[0].n;
          to = nums[1].n;
          name = cells.filter((_, i) => !(i === nums[0].i || i === nums[1].i)).join(' ').trim();
        }
      }
    }

    if (from === null) {
      const matches = [...line.matchAll(RANGE_RE)];
      if (matches.length) {
        const m = matches[matches.length - 1];
        from = parseInt(m[1], 10);
        to = parseInt(m[2], 10);
        name = cleanName(line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length));
      }
    }

    if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to)) {
      if (!/\d/.test(line)) continue; // baris header/kosong angka -> lewati diam-diam
      skipped += 1;
      continue;
    }

    ranges.push({ name: name && name.length ? name : '', from, to });
  }

  ranges.forEach((r, i) => {
    if (!r.name) r.name = `Bagian ${i + 1}`;
  });

  return { ranges, skipped };
}

/** Bersihkan nama bab agar aman dipakai sebagai nama file. */
export function sanitizeFilenamePart(name, fallback) {
  const cleaned = String(name || '')
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
  return cleaned || fallback;
}
