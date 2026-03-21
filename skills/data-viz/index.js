'use strict';

// ─── Helpers ───

function escapeXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function defaultColors(n) {
  const palette = ['#4A90D9','#E74C3C','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#3498DB','#E91E63','#00BCD4'];
  return Array.from({length: n}, (_, i) => palette[i % palette.length]);
}

// ─── Bar Chart ───

function barChart(opts = {}) {
  const {
    title = '',
    labels = [],
    values = [],
    width = 600,
    height = 400,
    color = '#4A90D9',
    colors,
    padding = 60,
  } = opts;

  if (!values.length) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const maxVal = Math.max(...values, 1);
  const barCount = values.length;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2 - (title ? 30 : 0);
  const barW = Math.max(1, (chartW / barCount) * 0.7);
  const gap = (chartW / barCount) * 0.3;
  const topY = padding + (title ? 30 : 0);
  const barColors = colors || defaultColors(barCount);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;background:#fff">\n`;

  if (title) {
    svg += `  <text x="${width/2}" y="${padding - 10}" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(title)}</text>\n`;
  }

  // Axis
  svg += `  <line x1="${padding}" y1="${topY + chartH}" x2="${padding + chartW}" y2="${topY + chartH}" stroke="#ccc" stroke-width="1"/>\n`;

  // Y axis labels (5 ticks)
  for (let i = 0; i <= 4; i++) {
    const val = (maxVal * i / 4).toFixed(maxVal > 10 ? 0 : 1);
    const y = topY + chartH - (chartH * i / 4);
    svg += `  <text x="${padding - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#888">${val}</text>\n`;
    if (i > 0) svg += `  <line x1="${padding}" y1="${y}" x2="${padding + chartW}" y2="${y}" stroke="#eee" stroke-width="1"/>\n`;
  }

  // Bars
  for (let i = 0; i < barCount; i++) {
    const barH = (values[i] / maxVal) * chartH;
    const x = padding + i * (chartW / barCount) + gap / 2;
    const y = topY + chartH - barH;
    const fillColor = typeof color === 'string' && !colors ? color : barColors[i % barColors.length];

    svg += `  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fillColor}" rx="2"/>\n`;
    // Value above bar
    svg += `  <text x="${(x + barW/2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10" fill="#555">${values[i]}</text>\n`;
    // Label below
    if (labels[i]) {
      svg += `  <text x="${(x + barW/2).toFixed(1)}" y="${(topY + chartH + 18).toFixed(1)}" text-anchor="middle" font-size="11" fill="#666">${escapeXml(labels[i])}</text>\n`;
    }
  }

  svg += '</svg>';
  return svg;
}

// ─── Line Chart ───

function lineChart(opts = {}) {
  const {
    title = '',
    labels = [],
    series = [],
    values, // shorthand for single series
    width = 600,
    height = 400,
    color = '#4A90D9',
    padding = 60,
  } = opts;

  // Normalize: allow single-series shorthand
  let allSeries = series.length ? series : [];
  if (!allSeries.length && values) {
    allSeries = [{ name: '', values, color }];
  }
  if (!allSeries.length) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const allVals = allSeries.flatMap(s => s.values);
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2 - (title ? 30 : 0);
  const topY = padding + (title ? 30 : 0);
  const pointCount = Math.max(...allSeries.map(s => s.values.length));
  const seriesColors = defaultColors(allSeries.length);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;background:#fff">\n`;

  if (title) {
    svg += `  <text x="${width/2}" y="${padding - 10}" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(title)}</text>\n`;
  }

  // Grid
  svg += `  <line x1="${padding}" y1="${topY + chartH}" x2="${padding + chartW}" y2="${topY + chartH}" stroke="#ccc" stroke-width="1"/>\n`;
  for (let i = 0; i <= 4; i++) {
    const val = (minVal + range * i / 4).toFixed(range > 10 ? 0 : 1);
    const y = topY + chartH - (chartH * i / 4);
    svg += `  <text x="${padding - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#888">${val}</text>\n`;
    if (i > 0) svg += `  <line x1="${padding}" y1="${y}" x2="${padding + chartW}" y2="${y}" stroke="#eee" stroke-width="1"/>\n`;
  }

  // X labels
  for (let i = 0; i < pointCount; i++) {
    const x = padding + (pointCount > 1 ? (i / (pointCount - 1)) * chartW : chartW / 2);
    if (labels[i]) {
      svg += `  <text x="${x.toFixed(1)}" y="${(topY + chartH + 18).toFixed(1)}" text-anchor="middle" font-size="11" fill="#666">${escapeXml(labels[i])}</text>\n`;
    }
  }

  // Lines
  allSeries.forEach((s, si) => {
    const c = s.color || seriesColors[si];
    const pts = s.values.map((v, i) => {
      const x = padding + (s.values.length > 1 ? (i / (s.values.length - 1)) * chartW : chartW / 2);
      const y = topY + chartH - ((v - minVal) / range) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    svg += `  <polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>\n`;

    // Dots
    s.values.forEach((v, i) => {
      const x = padding + (s.values.length > 1 ? (i / (s.values.length - 1)) * chartW : chartW / 2);
      const y = topY + chartH - ((v - minVal) / range) * chartH;
      svg += `  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${c}"/>\n`;
    });

    // Legend
    if (s.name) {
      const legendX = padding + si * 120;
      const legendY = topY + chartH + 35;
      svg += `  <rect x="${legendX}" y="${legendY - 8}" width="12" height="12" fill="${c}" rx="2"/>\n`;
      svg += `  <text x="${legendX + 16}" y="${legendY + 2}" font-size="11" fill="#555">${escapeXml(s.name)}</text>\n`;
    }
  });

  svg += '</svg>';
  return svg;
}

// ─── Pie Chart ───

function pieChart(opts = {}) {
  const {
    title = '',
    slices = [],
    width = 400,
    height = 400,
    padding = 40,
  } = opts;

  if (!slices.length) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const total = slices.reduce((s, sl) => s + (sl.value || 0), 0) || 1;
  const cx = width / 2;
  const cy = (height / 2) + (title ? 15 : 0);
  const r = Math.min(width, height) / 2 - padding - (title ? 15 : 0);
  const sliceColors = defaultColors(slices.length);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;background:#fff">\n`;

  if (title) {
    svg += `  <text x="${width/2}" y="${padding - 5}" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(title)}</text>\n`;
  }

  let angle = -Math.PI / 2;
  slices.forEach((sl, i) => {
    const frac = (sl.value || 0) / total;
    const sweep = frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep);
    const y2 = cy + r * Math.sin(angle + sweep);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const fillColor = sl.color || sliceColors[i];

    if (frac >= 0.999) {
      // Full circle
      svg += `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fillColor}"/>\n`;
    } else if (frac > 0.001) {
      svg += `  <path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${fillColor}"/>\n`;
    }

    // Label
    const midAngle = angle + sweep / 2;
    const labelR = r * 0.65;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    if (frac > 0.03) {
      svg += `  <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#fff" font-weight="bold">${(frac*100).toFixed(0)}%</text>\n`;
    }

    angle += sweep;
  });

  // Legend
  let legendY = height - padding + 5;
  if (legendY < cy + r + 20) legendY = cy + r + 20;
  // Place legend on the side if space allows
  slices.forEach((sl, i) => {
    if (sl.label) {
      const lx = padding;
      const ly = legendY + i * 16;
      if (ly < height - 5) {
        const fillColor = sl.color || sliceColors[i];
        svg += `  <rect x="${lx}" y="${ly - 8}" width="10" height="10" fill="${fillColor}" rx="2"/>\n`;
        svg += `  <text x="${lx + 14}" y="${ly}" font-size="10" fill="#555">${escapeXml(sl.label)} (${sl.value})</text>\n`;
      }
    }
  });

  svg += '</svg>';
  return svg;
}

// ─── Sparkline ───

function sparkline(opts = {}) {
  const {
    values = [],
    width = 200,
    height = 40,
    color = '#4A90D9',
    strokeWidth = 1.5,
    fill = true,
  } = opts;

  if (!values.length) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const pad = 2;
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  const range = maxV - minV || 1;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = values.map((v, i) => {
    const x = pad + (values.length > 1 ? (i / (values.length - 1)) * w : w / 2);
    const y = pad + h - ((v - minV) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:transparent">\n`;

  if (fill) {
    const firstX = pts[0].split(',')[0];
    const lastX = pts[pts.length-1].split(',')[0];
    svg += `  <polygon points="${pts.join(' ')} ${lastX},${(pad+h).toFixed(1)} ${firstX},${(pad+h).toFixed(1)}" fill="${color}" fill-opacity="0.15"/>\n`;
  }

  svg += `  <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>\n`;

  // End dot
  const lastPt = pts[pts.length-1].split(',');
  svg += `  <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="2.5" fill="${color}"/>\n`;

  svg += '</svg>';
  return svg;
}

// ─── Heatmap ───

function heatmap(opts = {}) {
  const {
    title = '',
    rows = [],      // row labels (e.g. days of week)
    cols = [],      // column labels (e.g. hours)
    data = [],      // 2D array: data[row][col] = value
    width = 700,
    height = 400,
    colorLow = '#ebedf0',
    colorHigh = '#216e39',
    padding = 80,
  } = opts;

  if (!data.length || !data[0]) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const numRows = data.length;
  const numCols = data[0].length;
  const allVals = data.flat();
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;

  const chartW = width - padding - 20;
  const chartH = height - padding - (title ? 30 : 0) - 20;
  const cellW = chartW / numCols;
  const cellH = chartH / numRows;
  const topY = padding / 2 + (title ? 30 : 0);
  const leftX = padding;

  // Interpolate color
  function lerpColor(t) {
    const lo = [parseInt(colorLow.slice(1,3),16), parseInt(colorLow.slice(3,5),16), parseInt(colorLow.slice(5,7),16)];
    const hi = [parseInt(colorHigh.slice(1,3),16), parseInt(colorHigh.slice(3,5),16), parseInt(colorHigh.slice(5,7),16)];
    const r = Math.round(lo[0] + (hi[0]-lo[0]) * t);
    const g = Math.round(lo[1] + (hi[1]-lo[1]) * t);
    const b = Math.round(lo[2] + (hi[2]-lo[2]) * t);
    return `rgb(${r},${g},${b})`;
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;background:#fff">\n`;

  if (title) {
    svg += `  <text x="${width/2}" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(title)}</text>\n`;
  }

  // Cells
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const val = data[r][c] || 0;
      const t = (val - minVal) / range;
      const x = leftX + c * cellW;
      const y = topY + r * cellH;
      svg += `  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cellW-1).toFixed(1)}" height="${(cellH-1).toFixed(1)}" fill="${lerpColor(t)}" rx="2">\n`;
      svg += `    <title>${rows[r] || r} × ${cols[c] || c}: ${val}</title>\n`;
      svg += `  </rect>\n`;
    }
  }

  // Row labels
  for (let r = 0; r < numRows; r++) {
    if (rows[r]) {
      const y = topY + r * cellH + cellH / 2 + 4;
      svg += `  <text x="${leftX - 5}" y="${y.toFixed(1)}" text-anchor="end" font-size="10" fill="#666">${escapeXml(rows[r])}</text>\n`;
    }
  }

  // Col labels
  for (let c = 0; c < numCols; c++) {
    if (cols[c]) {
      const x = leftX + c * cellW + cellW / 2;
      const y = topY + numRows * cellH + 14;
      svg += `  <text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="10" fill="#666">${escapeXml(cols[c])}</text>\n`;
    }
  }

  svg += '</svg>';
  return svg;
}

// ─── Gauge ───

function gauge(opts = {}) {
  const {
    title = '',
    value = 0,
    min = 0,
    max = 100,
    width = 300,
    height = 200,
    thresholds = [
      { limit: 0.33, color: '#E74C3C' },
      { limit: 0.66, color: '#F39C12' },
      { limit: 1.0, color: '#2ECC71' },
    ],
    suffix = '%',
    label = '',
  } = opts;

  const cx = width / 2;
  const cy = height - 30;
  const r = Math.min(cx - 20, cy - (title ? 30 : 10));
  const normalized = Math.max(0, Math.min(1, (value - min) / ((max - min) || 1)));

  // Arc helper: angle in radians (0 = 9 o'clock, PI = 3 o'clock for semicircle)
  function arcPoint(fraction) {
    const angle = Math.PI * (1 - fraction); // left to right
    return { x: cx - r * Math.cos(angle), y: cy - r * Math.sin(angle) };
  }

  function arcPath(startFrac, endFrac, arcR) {
    const s = arcPoint(startFrac);
    const e = arcPoint(endFrac);
    // fix x/y using the arcR
    const sx = cx - arcR * Math.cos(Math.PI * (1 - startFrac));
    const sy = cy - arcR * Math.sin(Math.PI * (1 - startFrac));
    const ex = cx - arcR * Math.cos(Math.PI * (1 - endFrac));
    const ey = cy - arcR * Math.sin(Math.PI * (1 - endFrac));
    const largeArc = (endFrac - startFrac) > 0.5 ? 1 : 0;
    return `M${sx.toFixed(1)},${sy.toFixed(1)} A${arcR},${arcR} 0 ${largeArc} 1 ${ex.toFixed(1)},${ey.toFixed(1)}`;
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family:system-ui,sans-serif;background:#fff">\n`;

  if (title) {
    svg += `  <text x="${cx}" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">${escapeXml(title)}</text>\n`;
  }

  // Background arc
  svg += `  <path d="${arcPath(0, 1, r)}" fill="none" stroke="#eee" stroke-width="18" stroke-linecap="round"/>\n`;

  // Threshold colored segments
  let prevLimit = 0;
  for (const t of thresholds) {
    const segEnd = Math.min(t.limit, normalized);
    if (segEnd > prevLimit) {
      svg += `  <path d="${arcPath(prevLimit, segEnd, r)}" fill="none" stroke="${t.color}" stroke-width="18" stroke-linecap="round"/>\n`;
    }
    prevLimit = t.limit;
    if (prevLimit >= normalized) break;
  }

  // Needle
  const needleAngle = Math.PI * (1 - normalized);
  const nx = cx - (r - 25) * Math.cos(needleAngle);
  const ny = cy - (r - 25) * Math.sin(needleAngle);
  svg += `  <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>\n`;
  svg += `  <circle cx="${cx}" cy="${cy}" r="5" fill="#333"/>\n`;

  // Value text
  const displayVal = typeof value === 'number' ? (value % 1 === 0 ? value : value.toFixed(1)) : value;
  svg += `  <text x="${cx}" y="${cy - 20}" text-anchor="middle" font-size="24" font-weight="bold" fill="#333">${displayVal}${escapeXml(suffix)}</text>\n`;

  if (label) {
    svg += `  <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="11" fill="#888">${escapeXml(label)}</text>\n`;
  }

  // Min/Max labels
  svg += `  <text x="${cx - r - 5}" y="${cy + 5}" text-anchor="end" font-size="10" fill="#aaa">${min}</text>\n`;
  svg += `  <text x="${cx + r + 5}" y="${cy + 5}" text-anchor="start" font-size="10" fill="#aaa">${max}</text>\n`;

  svg += '</svg>';
  return svg;
}

// ─── Horizontal Bar Chart ───

function horizontalBar(opts = {}) {
  const {
    title = '',
    labels = [],
    values = [],
    width = 500,
    height,
    color = '#4A90D9',
    colors,
    barHeight = 22,
    gap = 8,
    padding = 40,
    labelWidth = 100,
  } = opts;

  if (!values.length) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  const maxVal = Math.max(...values, 1);
  const barCount = values.length;
  const computedHeight = height || (padding * 2 + (title ? 30 : 0) + barCount * (barHeight + gap));
  const chartW = width - padding - labelWidth;
  const topY = padding + (title ? 30 : 0);
  const barColors = colors || defaultColors(barCount);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${computedHeight}" style="font-family:system-ui,sans-serif;background:#fff">\n`;

  if (title) {
    svg += `  <text x="${width/2}" y="${padding - 10}" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(title)}</text>\n`;
  }

  for (let i = 0; i < barCount; i++) {
    const barW = (values[i] / maxVal) * chartW;
    const x = labelWidth;
    const y = topY + i * (barHeight + gap);
    const fillColor = typeof color === 'string' && !colors ? color : barColors[i % barColors.length];

    // Label
    if (labels[i]) {
      svg += `  <text x="${labelWidth - 8}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="11" fill="#555">${escapeXml(labels[i])}</text>\n`;
    }

    // Bar
    svg += `  <rect x="${x}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barHeight}" fill="${fillColor}" rx="3"/>\n`;

    // Value
    svg += `  <text x="${(x + barW + 6).toFixed(1)}" y="${(y + barHeight / 2 + 4).toFixed(1)}" font-size="11" fill="#555">${values[i]}</text>\n`;
  }

  svg += '</svg>';
  return svg;
}

// ─── Exports ───

module.exports = { barChart, lineChart, pieChart, sparkline, heatmap, gauge, horizontalBar };

// ─── CLI ───

if (require.main === module) {
  const args = process.argv.slice(2);
  const type = args[0];
  const outIdx = args.indexOf('-o');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
  const titleIdx = args.indexOf('--title');
  const title = titleIdx !== -1 ? args[titleIdx + 1] : '';

  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => input += d);
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      data.title = data.title || title;
      let svg;
      switch (type) {
        case 'bar':  svg = barChart(data); break;
        case 'hbar': svg = horizontalBar(data); break;
        case 'line': svg = lineChart(data); break;
        case 'pie':  svg = pieChart(data); break;
        case 'spark':
        case 'sparkline': svg = sparkline(data); break;
        case 'heat':
        case 'heatmap': svg = heatmap(data); break;
        case 'gauge': svg = gauge(data); break;
        default:
          console.error('Usage: echo JSON | node index.js <bar|hbar|line|pie|spark|heat|gauge> [--title "T"] [-o file.svg]');
          process.exit(1);
      }
      if (outFile) {
        require('fs').writeFileSync(outFile, svg);
        console.log(`Written to ${outFile}`);
      } else {
        process.stdout.write(svg);
      }
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  });
}
