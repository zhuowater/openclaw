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

// ─── Exports ───

module.exports = { barChart, lineChart, pieChart, sparkline };

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
        case 'line': svg = lineChart(data); break;
        case 'pie':  svg = pieChart(data); break;
        case 'spark':
        case 'sparkline': svg = sparkline(data); break;
        default:
          console.error('Usage: echo JSON | node index.js <bar|line|pie|spark> [--title "T"] [-o file.svg]');
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
