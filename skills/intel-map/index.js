/**
 * intel-map — Generate interactive intelligence maps with Leaflet.js
 *
 * Produces self-contained HTML files with markers for:
 * - FIRMS satellite fire hotspots
 * - Conflict events
 * - Infrastructure points
 * - Custom geo-located intelligence
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ---- Marker type config ----
const MARKER_STYLES = {
  fire:           { color: '#e74c3c', emoji: '🔥', radius: 6 },
  conflict:       { color: '#e67e22', emoji: '⚔️', radius: 7 },
  infrastructure: { color: '#3498db', emoji: '🏭', radius: 6 },
  city:           { color: '#7f8c8d', emoji: '🏙️', radius: 5 },
  earthquake:     { color: '#9b59b6', emoji: '🌋', radius: 7 },
  naval:          { color: '#2c3e50', emoji: '🚢', radius: 6 },
  cyber:          { color: '#1abc9c', emoji: '💻', radius: 5 },
  custom:         { color: '#27ae60', emoji: '📍', radius: 5 },
};

const SEVERITY_COLORS = {
  critical: '#c0392b',
  high:     '#e74c3c',
  medium:   '#f39c12',
  low:      '#27ae60',
};

// ---- Core: generate map HTML ----

function generateMap(opts = {}) {
  const {
    title = 'Intelligence Map',
    markers = [],
    center = null,
    zoom = null,
    width = '100%',
    height = '100vh',
    tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution = '&copy; OpenStreetMap contributors',
    darkMode = false,
  } = opts;

  // Auto-calculate center/zoom from markers
  let mapCenter = center;
  let mapZoom = zoom;
  if (!mapCenter && markers.length > 0) {
    const lats = markers.map(m => m.lat).filter(Boolean);
    const lngs = markers.map(m => m.lng).filter(Boolean);
    if (lats.length && lngs.length) {
      mapCenter = [
        lats.reduce((a, b) => a + b, 0) / lats.length,
        lngs.reduce((a, b) => a + b, 0) / lngs.length,
      ];
    }
  }
  if (!mapCenter) mapCenter = [30, 50];
  if (!mapZoom) {
    if (markers.length <= 1) mapZoom = 6;
    else {
      const lats = markers.map(m => m.lat).filter(Boolean);
      const lngs = markers.map(m => m.lng).filter(Boolean);
      const latSpread = Math.max(...lats) - Math.min(...lats);
      const lngSpread = Math.max(...lngs) - Math.min(...lngs);
      const spread = Math.max(latSpread, lngSpread);
      if (spread > 60) mapZoom = 3;
      else if (spread > 30) mapZoom = 4;
      else if (spread > 10) mapZoom = 5;
      else if (spread > 3) mapZoom = 7;
      else mapZoom = 9;
    }
  }

  const darkTile = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const useTile = darkMode ? darkTile : tileUrl;

  const markersJson = JSON.stringify(markers.map(m => ({
    lat: m.lat,
    lng: m.lng,
    label: m.label || '',
    type: m.type || 'custom',
    severity: m.severity || '',
    details: m.details || '',
    timestamp: m.timestamp || '',
  })));

  const stylesJson = JSON.stringify(MARKER_STYLES);
  const sevJson = JSON.stringify(SEVERITY_COLORS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(title)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}
  #map{width:${width};height:${height}}
  .info-panel{position:absolute;top:10px;right:10px;z-index:1000;background:rgba(255,255,255,0.92);
    padding:12px 16px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);max-width:280px;font-size:13px}
  .info-panel h3{margin:0 0 8px;font-size:15px}
  .legend-row{display:flex;align-items:center;gap:6px;margin:3px 0}
  .legend-dot{width:12px;height:12px;border-radius:50%;display:inline-block}
  .marker-popup{font-size:13px;line-height:1.4}
  .marker-popup .mp-type{font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px}
  .marker-popup .mp-label{font-size:15px;font-weight:700;margin:2px 0}
  .marker-popup .mp-details{color:#555;margin-top:4px}
  .marker-popup .mp-time{color:#888;font-size:11px;margin-top:4px}
</style>
</head>
<body>
<div id="map"></div>
<div class="info-panel">
  <h3>${escHtml(title)}</h3>
  <div><strong>${markers.length}</strong> markers</div>
  <div id="legend"></div>
  <div style="margin-top:8px;color:#888;font-size:11px">Generated ${new Date().toISOString().slice(0,16)}Z</div>
</div>
<script>
(function(){
  var map = L.map('map').setView([${mapCenter[0]},${mapCenter[1]}], ${mapZoom});
  L.tileLayer('${useTile}', {attribution:'${attribution}',maxZoom:18}).addTo(map);

  var markers = ${markersJson};
  var styles = ${stylesJson};
  var sevColors = ${sevJson};
  var typeCounts = {};

  markers.forEach(function(m){
    var s = styles[m.type] || styles.custom;
    var color = m.severity && sevColors[m.severity] ? sevColors[m.severity] : s.color;
    var r = s.radius || 5;

    typeCounts[m.type] = (typeCounts[m.type]||0) + 1;

    var circle = L.circleMarker([m.lat, m.lng], {
      radius: r,
      fillColor: color,
      color: '#fff',
      weight: 1.5,
      fillOpacity: 0.85,
    }).addTo(map);

    var popup = '<div class="marker-popup">';
    popup += '<div class="mp-type" style="color:'+color+'">'+(s.emoji||'')+' '+m.type+'</div>';
    if(m.label) popup += '<div class="mp-label">'+escH(m.label)+'</div>';
    if(m.severity) popup += '<div style="color:'+color+';font-size:12px">Severity: '+m.severity+'</div>';
    if(m.details) popup += '<div class="mp-details">'+escH(m.details)+'</div>';
    if(m.timestamp) popup += '<div class="mp-time">'+m.timestamp+'</div>';
    popup += '<div style="color:#aaa;font-size:11px;margin-top:4px">'+m.lat.toFixed(4)+', '+m.lng.toFixed(4)+'</div>';
    popup += '</div>';
    circle.bindPopup(popup);
  });

  // Build legend
  var leg = document.getElementById('legend');
  var html = '';
  Object.keys(typeCounts).sort().forEach(function(t){
    var s = styles[t] || styles.custom;
    html += '<div class="legend-row"><span class="legend-dot" style="background:'+s.color+'"></span> '
      + (s.emoji||'') + ' ' + t + ' ('+typeCounts[t]+')</div>';
  });
  leg.innerHTML = html;

  function escH(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
})();
<\/script>
</body>
</html>`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- FIRMS data converter ----

function firmsToMarkers(firmsData, opts = {}) {
  const { minConfidence = 50 } = opts;
  // firmsData can be CSV string or array of objects
  let rows = firmsData;
  if (typeof firmsData === 'string') {
    const lines = firmsData.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    rows = lines.slice(1).map(line => {
      const vals = line.split(',');
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ? vals[i].trim() : ''; });
      return obj;
    });
  }

  return rows
    .filter(r => {
      const conf = parseFloat(r.confidence || r.conf || '0');
      return conf >= minConfidence;
    })
    .map(r => ({
      lat: parseFloat(r.latitude || r.lat || '0'),
      lng: parseFloat(r.longitude || r.lng || r.lon || '0'),
      label: r.label || `Fire ${r.brightness || ''}`.trim(),
      type: 'fire',
      severity: classifyFireSeverity(r),
      details: buildFireDetails(r),
      timestamp: r.acq_date ? `${r.acq_date} ${r.acq_time || ''}`.trim() : '',
    }));
}

function classifyFireSeverity(r) {
  const frp = parseFloat(r.frp || '0');
  const conf = parseFloat(r.confidence || r.conf || '0');
  if (frp > 100 || conf >= 95) return 'critical';
  if (frp > 50 || conf >= 80) return 'high';
  if (frp > 20 || conf >= 60) return 'medium';
  return 'low';
}

function buildFireDetails(r) {
  const parts = [];
  if (r.brightness) parts.push(`Brightness: ${r.brightness}K`);
  if (r.frp) parts.push(`FRP: ${r.frp} MW`);
  if (r.confidence || r.conf) parts.push(`Confidence: ${r.confidence || r.conf}%`);
  if (r.satellite) parts.push(`Satellite: ${r.satellite}`);
  if (r.instrument) parts.push(`Instrument: ${r.instrument}`);
  return parts.join(' | ');
}

// ---- Plot helper ----

function plotMarkers(markers, opts = {}) {
  const { output = '/tmp/intel-map.html', title = 'Intelligence Map', ...rest } = opts;
  const html = generateMap({ markers, title, ...rest });
  fs.writeFileSync(output, html, 'utf8');
  return { path: output, markers: markers.length, size: Buffer.byteLength(html) };
}

// ---- CLI ----

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  function getArg(name, def) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= args.length) return def;
    return args[idx + 1];
  }

  if (cmd === 'generate') {
    const dataFile = getArg('data', null);
    const output = getArg('output', '/tmp/intel-map.html');
    const title = getArg('title', 'Intelligence Map');
    let markers = [];

    if (dataFile) {
      const raw = fs.readFileSync(dataFile, 'utf8');
      markers = JSON.parse(raw);
    } else {
      // Read from stdin
      const stdin = fs.readFileSync(0, 'utf8');
      markers = JSON.parse(stdin);
    }

    const result = plotMarkers(markers, { output, title });
    console.log(`✅ Map generated: ${result.path} (${result.markers} markers, ${(result.size/1024).toFixed(1)}KB)`);

  } else if (cmd === 'plot') {
    const markersStr = getArg('markers', '[]');
    const output = getArg('output', '/tmp/intel-map.html');
    const title = getArg('title', 'Quick Map');
    const markers = JSON.parse(markersStr);
    const result = plotMarkers(markers, { output, title });
    console.log(`✅ Map generated: ${result.path} (${result.markers} markers, ${(result.size/1024).toFixed(1)}KB)`);

  } else if (cmd === 'firms') {
    const region = getArg('region', 'world');
    const hours = parseInt(getArg('hours', '24'), 10);
    const output = getArg('output', '/tmp/firms-map.html');
    const minConf = parseInt(getArg('min-confidence', '70'), 10);

    // Try to load FIRMS data from the firms-satellite skill
    const firmsDir = path.join(__dirname, '..', 'firms-satellite');
    const apiKey = process.env.FIRMS_API_KEY || 'e4b715bb6e6eeec9290fbd19fef9efe6';

    // Use FIRMS API directly
    const https = require('https');
    const regionMap = {
      iran:    { area: '44,25,64,40', name: 'Iran Region' },
      ukraine: { area: '22,44,42,53', name: 'Ukraine Region' },
      taiwan:  { area: '118,21,123,26', name: 'Taiwan Strait' },
      world:   { area: '-180,-90,180,90', name: 'Global' },
      mideast: { area: '25,12,65,42', name: 'Middle East' },
    };
    const reg = regionMap[region.toLowerCase()] || regionMap.world;
    const coords = reg.area.split(',');
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/${coords.join(',')}/${Math.min(hours/24,10)||1}`;

    console.log(`📡 Fetching FIRMS data for ${reg.name}...`);

    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error(`❌ FIRMS API error: HTTP ${res.statusCode}`);
          process.exit(1);
        }
        const markers = firmsToMarkers(data, { minConfidence: minConf });
        const result = plotMarkers(markers, { output, title: `FIRMS: ${reg.name}` });
        console.log(`✅ FIRMS map: ${result.path} (${result.markers} hotspots, ${(result.size/1024).toFixed(1)}KB)`);
      });
    }).on('error', e => {
      console.error(`❌ FIRMS fetch error: ${e.message}`);
      process.exit(1);
    });

  } else {
    console.log(`intel-map — Interactive intelligence map generator

Commands:
  generate  --data <file.json> --output <map.html> [--title "..."]
  plot      --markers '<json>' --output <map.html>
  firms     --region <iran|ukraine|taiwan|mideast|world> [--hours 24] [--output map.html] [--min-confidence 70]

Marker JSON format:
  { "lat": N, "lng": N, "label": "...", "type": "fire|conflict|infrastructure|city|custom", "severity": "low|medium|high|critical", "details": "...", "timestamp": "..." }
`);
  }
}

module.exports = { generateMap, firmsToMarkers, plotMarkers, MARKER_STYLES, SEVERITY_COLORS, main };

if (require.main === module) main();
