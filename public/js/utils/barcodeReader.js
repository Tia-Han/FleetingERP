const BarcodeReader = {
  _canvas: null,

  decode(video) {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    if (!this._canvas) this._canvas = document.createElement('canvas');
    const vw = video.videoWidth, vh = video.videoHeight;

    const cropX = Math.floor(vw * 0.1);
    const cropW = Math.floor(vw * 0.8);
    const cropY = Math.floor(vh * 0.3);
    const cropH = Math.floor(vh * 0.4);

    this._canvas.width = cropW;
    this._canvas.height = cropH;

    let ctx;
    try { ctx = this._canvas.getContext('2d', { willReadFrequently: true }); } catch (e) { ctx = this._canvas.getContext('2d'); }
    if (!ctx) return null;

    try { ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH); } catch (e) { return null; }

    let imageData;
    try { imageData = ctx.getImageData(0, 0, cropW, cropH); } catch (e) { return null; }

    const gray = new Uint8Array(cropW * cropH);
    const d = imageData.data;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      gray[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    }

    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    let total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) { maxVar = v; threshold = i; }
    }

    const scanRows = [];
    for (let r = 0.15; r <= 0.85; r += 0.05) {
      scanRows.push(Math.floor(cropH * r));
    }

    for (const y of scanRows) {
      if (y < 0 || y >= cropH) continue;
      const row = new Uint8Array(cropW);
      for (let x = 0; x < cropW; x++) row[x] = gray[y * cropW + x] < threshold ? 0 : 1;

      for (let denoise = 0; denoise <= 1; denoise++) {
        const processed = denoise ? this._denoise(row) : row;
        const bars = this._extractBars(processed);
        if (!bars || bars.length < 20) continue;

        const tries = [
          () => this._decodeEAN13(bars),
          () => this._decodeEAN8(bars),
          () => this._decodeUPC_A(bars)
        ];
        for (const t of tries) {
          const result = t();
          if (result) return result;
        }
      }
    }

    for (const y of scanRows) {
      if (y < 0 || y >= cropH) continue;
      for (const t of [threshold * 0.7, threshold * 1.3, 100, 160, 60, 200]) {
        const row = new Uint8Array(cropW);
        for (let x = 0; x < cropW; x++) row[x] = gray[y * cropW + x] < t ? 0 : 1;
        const bars = this._extractBars(row);
        if (!bars || bars.length < 20) continue;
        const tries = [
          () => this._decodeEAN13(bars),
          () => this._decodeEAN8(bars),
          () => this._decodeUPC_A(bars)
        ];
        for (const tr of tries) {
          const result = tr();
          if (result) return result;
        }
      }
    }

    return null;
  },

  _denoise(row) {
    const out = new Uint8Array(row.length);
    for (let i = 0; i < row.length; i++) {
      let count = 0;
      for (let j = Math.max(0, i - 1); j <= Math.min(row.length - 1, i + 1); j++) {
        if (row[j] === 1) count++;
      }
      out[i] = count >= 2 ? 1 : 0;
    }
    return out;
  },

  _extractBars(row) {
    const bars = [];
    let run = 1;
    let color = row[0];
    for (let i = 1; i < row.length; i++) {
      if (row[i] === color) {
        run++;
      } else {
        bars.push({ color: color, width: run });
        color = row[i];
        run = 1;
      }
    }
    bars.push({ color: color, width: run });
    if (bars.length < 20) return null;

    const widths = bars.map(b => b.width).sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)];
    if (median < 1) return null;

    const filtered = bars.filter(b => b.width <= median * 6);
    return filtered.length >= 20 ? filtered : bars;
  },

  _findStartGuard(bars, color0, color1, color2) {
    for (let i = 0; i < bars.length - 30; i++) {
      if (bars[i].color === color0 && bars[i + 1] && bars[i + 1].color === color1 && bars[i + 2] && bars[i + 2].color === color0) {
        const w0 = bars[i].width, w1 = bars[i + 1].width, w2 = bars[i + 2].width;
        const avg = (w0 + w1 + w2) / 3;
        if (w0 <= avg * 2 && w1 <= avg * 2 && w2 <= avg * 2 &&
            w0 >= avg * 0.4 && w1 >= avg * 0.4 && w2 >= avg * 0.4) {
          return i;
        }
      }
    }
    return -1;
  },

  _decodeDigit(bars, idx, unitW, table) {
    let bits = '';
    for (let s = 0; s < 4; s++) {
      if (!bars[idx + s]) return null;
      const modules = Math.round(bars[idx + s].width / unitW);
      const clamped = Math.max(1, Math.min(modules, 4));
      bits += (bars[idx + s].color === 0 ? '0' : '1').repeat(clamped);
    }
    bits = bits.substring(0, 7).padEnd(7, '0');

    if (table[bits] !== undefined) return { digit: table[bits], bits: bits };
    for (let flip = 0; flip < 7; flip++) {
      const alt = bits.substring(0, flip) + (bits[flip] === '0' ? '1' : '0') + bits.substring(flip + 1);
      if (table[alt] !== undefined) return { digit: table[alt], bits: alt, fuzzy: true };
    }
    return null;
  },

  _decodeEAN13(bars) {
    if (bars.length < 30) return null;
    const idx0 = this._findStartGuard(bars, 0, 1, 0);
    if (idx0 < 0) return null;

    const moduleWidth = (bars[idx0].width + bars[idx0 + 1].width + bars[idx0 + 2].width) / 3;
    if (moduleWidth < 1) return null;

    let idx = idx0 + 3;

    const L_A = { '0001101': 0, '0011001': 1, '0010011': 2, '0111101': 3, '0100011': 4, '0110001': 5, '0101111': 6, '0111011': 7, '0110111': 8, '0001011': 9 };
    const L_B = { '0100111': 0, '0110011': 1, '0011011': 2, '0100001': 3, '0011101': 4, '0111001': 5, '0000101': 6, '0010001': 7, '0001001': 8, '0010111': 9 };
    const R_C = { '1110010': 0, '1100110': 1, '1101100': 2, '1000010': 3, '1011100': 4, '1001110': 5, '1010000': 6, '1000100': 7, '1001000': 8, '1110100': 9 };
    const parityMap = { AAAAAA: 0, AABABB: 1, AABBAB: 2, AABBBA: 3, ABAABB: 4, ABBAAB: 5, ABBBAA: 6, ABABAB: 7, ABABBA: 8, ABBABA: 9 };

    let leftDigits = '';
    let parityPattern = '';

    for (let d = 0; d < 6; d++) {
      const startIdx = idx + d * 4;
      if (startIdx + 3 >= bars.length) return null;
      let totalWidth = 0;
      for (let s = 0; s < 4; s++) totalWidth += bars[startIdx + s].width;
      const unitW = totalWidth / 7;

      let r = this._decodeDigit(bars, startIdx, unitW, L_A);
      if (r) { leftDigits += r.digit; parityPattern += 'A'; continue; }
      r = this._decodeDigit(bars, startIdx, unitW, L_B);
      if (r) { leftDigits += r.digit; parityPattern += 'B'; continue; }
      return null;
    }

    idx += 24;
    if (idx + 2 >= bars.length) return null;
    if (!this._isGuard(bars, idx, moduleWidth)) return null;
    idx += 3;

    let rightDigits = '';
    for (let d = 0; d < 6; d++) {
      const startIdx = idx + d * 4;
      if (startIdx + 3 >= bars.length) return null;
      let totalWidth = 0;
      for (let s = 0; s < 4; s++) totalWidth += bars[startIdx + s].width;
      const unitW = totalWidth / 7;

      const r = this._decodeDigit(bars, startIdx, unitW, R_C);
      if (!r) return null;
      rightDigits += r.digit;
    }

    const firstDigit = parityMap[parityPattern];
    if (firstDigit === undefined) return null;

    const fullCode = firstDigit + leftDigits + rightDigits;
    if (!this._validateEAN13Checksum(fullCode)) return null;
    return fullCode;
  },

  _decodeEAN8(bars) {
    if (bars.length < 22) return null;
    const idx0 = this._findStartGuard(bars, 0, 1, 0);
    if (idx0 < 0) return null;

    const moduleWidth = (bars[idx0].width + bars[idx0 + 1].width + bars[idx0 + 2].width) / 3;
    if (moduleWidth < 1) return null;

    let idx = idx0 + 3;
    const L = { '0001101': 0, '0011001': 1, '0010011': 2, '0111101': 3, '0100011': 4, '0110001': 5, '0101111': 6, '0111011': 7, '0110111': 8, '0001011': 9 };
    const R = { '1110010': 0, '1100110': 1, '1101100': 2, '1000010': 3, '1011100': 4, '1001110': 5, '1010000': 6, '1000100': 7, '1001000': 8, '1110100': 9 };

    let leftDigits = '';
    for (let d = 0; d < 4; d++) {
      const startIdx = idx + d * 4;
      if (startIdx + 3 >= bars.length) return null;
      let totalWidth = 0;
      for (let s = 0; s < 4; s++) totalWidth += bars[startIdx + s].width;
      const unitW = totalWidth / 7;
      const r = this._decodeDigit(bars, startIdx, unitW, L);
      if (!r) return null;
      leftDigits += r.digit;
    }

    idx += 16;
    if (idx + 2 >= bars.length) return null;
    if (!this._isGuard(bars, idx, moduleWidth)) return null;
    idx += 3;

    let rightDigits = '';
    for (let d = 0; d < 4; d++) {
      const startIdx = idx + d * 4;
      if (startIdx + 3 >= bars.length) return null;
      let totalWidth = 0;
      for (let s = 0; s < 4; s++) totalWidth += bars[startIdx + s].width;
      const unitW = totalWidth / 7;
      const r = this._decodeDigit(bars, startIdx, unitW, R);
      if (!r) return null;
      rightDigits += r.digit;
    }

    const fullCode = leftDigits + rightDigits;
    if (!this._validateEAN8Checksum(fullCode)) return null;
    return fullCode;
  },

  _decodeUPC_A(bars) {
    if (bars.length < 30) return null;
    const idx0 = this._findStartGuard(bars, 0, 1, 0);
    if (idx0 < 0) return null;

    const moduleWidth = (bars[idx0].width + bars[idx0 + 1].width + bars[idx0 + 2].width) / 3;
    if (moduleWidth < 1) return null;

    let idx = idx0 + 3;
    const L = { '0001101': 0, '0011001': 1, '0010011': 2, '0111101': 3, '0100011': 4, '0110001': 5, '0101111': 6, '0111011': 7, '0110111': 8, '0001011': 9 };
    const R = { '1110010': 0, '1100110': 1, '1101100': 2, '1000010': 3, '1011100': 4, '1001110': 5, '1010000': 6, '1000100': 7, '1001000': 8, '1110100': 9 };

    let leftDigits = '';
    for (let d = 0; d < 6; d++) {
      const startIdx = idx + d * 4;
      if (startIdx + 3 >= bars.length) return null;
      let totalWidth = 0;
      for (let s = 0; s < 4; s++) totalWidth += bars[startIdx + s].width;
      const unitW = totalWidth / 7;
      const r = this._decodeDigit(bars, startIdx, unitW, L);
      if (!r) return null;
      leftDigits += r.digit;
    }

    idx += 24;
    if (idx + 2 >= bars.length) return null;
    if (!this._isGuard(bars, idx, moduleWidth)) return null;
    idx += 3;

    let rightDigits = '';
    for (let d = 0; d < 6; d++) {
      const startIdx = idx + d * 4;
      if (startIdx + 3 >= bars.length) return null;
      let totalWidth = 0;
      for (let s = 0; s < 4; s++) totalWidth += bars[startIdx + s].width;
      const unitW = totalWidth / 7;
      const r = this._decodeDigit(bars, startIdx, unitW, R);
      if (!r) return null;
      rightDigits += r.digit;
    }

    const fullCode = leftDigits + rightDigits;
    let sum = 0;
    for (let i = 0; i < 11; i++) sum += parseInt(fullCode[i]) * (i % 2 === 0 ? 3 : 1);
    const check = (10 - (sum % 10)) % 10;
    if (check !== parseInt(fullCode[11])) return null;
    return '0' + fullCode;
  },

  _isGuard(bars, idx, moduleWidth) {
    if (!bars[idx] || !bars[idx + 1] || !bars[idx + 2]) return false;
    if (bars[idx].color !== 0 || bars[idx + 1].color !== 1 || bars[idx + 2].color !== 0) return false;
    const w0 = bars[idx].width, w1 = bars[idx + 1].width, w2 = bars[idx + 2].width;
    const avg = (w0 + w1 + w2) / 3;
    return w0 <= avg * 2 && w1 <= avg * 2 && w2 <= avg * 2;
  },

  _validateEAN13Checksum(code) {
    if (code.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === parseInt(code[12]);
  },

  _validateEAN8Checksum(code) {
    if (code.length !== 8) return false;
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += parseInt(code[i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === parseInt(code[7]);
  }
};
