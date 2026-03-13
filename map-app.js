// === State ===
let mapData = null;
let geoData = null;
let currentMetric = 'units';
let currentYearIdx = 72; // points to "全部"
let currentGranularity = 'yearly'; // 'yearly' or 'fiveYear'
let map = null;
let geoLayer = null;
let playTimer = null;
let yearLabels = [];        // raw single-year labels from data
let activeLabels = [];      // labels currently in use (yearly or five-year)
let fiveYearLabels = [];    // precomputed five-year bin labels
let fiveYearBinMap = {};    // maps bin label -> array of single-year labels

// === Color scales ===
const CHOROPLETH_COLORS = ['#fef0d9','#fdcc8a','#fc8d59','#e34a33','#b30000'];
const AVG_COLORS = ['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c'];

function getColorScale() {
  return currentMetric === 'avgArea' ? AVG_COLORS : CHOROPLETH_COLORS;
}

// === Helpers ===
function formatNum(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
  return n.toLocaleString('zh-CN');
}

function formatFull(n) {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

// === Five-year bin computation ===
function buildFiveYearBins() {
  // yearLabels: ['早于1949', '1950', '1951', ..., '2020']
  // Group: '早于1949' stays as-is, then 1950-1954, 1955-1959, ..., up to last available year
  fiveYearLabels = [];
  fiveYearBinMap = {};

  // Handle '早于1949' as its own bin
  fiveYearLabels.push('早于1949');
  fiveYearBinMap['早于1949'] = ['早于1949'];

  // Collect numeric years
  const numericYears = yearLabels.filter(y => y !== '早于1949').map(Number).sort((a, b) => a - b);
  if (numericYears.length === 0) return;

  // Determine bins starting from 1950, every 5 years
  const startDecade = 1950;
  const lastYear = numericYears[numericYears.length - 1];

  for (let binStart = startDecade; binStart <= lastYear; binStart += 5) {
    const binEnd = Math.min(binStart + 4, lastYear);
    const binLabel = binStart === binEnd ? String(binStart) : binStart + '-' + binEnd;
    const members = [];
    for (let y = binStart; y <= binEnd; y++) {
      if (yearLabels.includes(String(y))) {
        members.push(String(y));
      }
    }
    if (members.length > 0) {
      fiveYearLabels.push(binLabel);
      fiveYearBinMap[binLabel] = members;
    }
  }
}

// Get district value for a single year label (raw from data)
function getDistrictValueSingle(code, yearLabel) {
  const d = mapData.districts[String(code)];
  if (!d) return { units: 0, area: 0 };

  if (yearLabel === '全部') {
    return { units: d.total_units, area: d.total_area };
  }

  const ydata = d.years[yearLabel];
  if (!ydata) return { units: 0, area: 0 };
  return { units: ydata.units, area: ydata.area };
}

// Get district value considering current granularity
function getDistrictValue(code, label) {
  if (label === '全部') {
    const d = mapData.districts[String(code)];
    if (!d) return { units: 0, area: 0, avgArea: 0 };
    const avgArea = d.total_units > 0 ? d.total_area / d.total_units : 0;
    return { units: d.total_units, area: d.total_area, avgArea: Math.round(avgArea * 100) / 100 };
  }

  if (currentGranularity === 'fiveYear') {
    const members = fiveYearBinMap[label];
    if (!members) return { units: 0, area: 0, avgArea: 0 };
    let totalUnits = 0, totalArea = 0;
    for (const yl of members) {
      const v = getDistrictValueSingle(code, yl);
      totalUnits += v.units;
      totalArea += v.area;
    }
    const avgArea = totalUnits > 0 ? totalArea / totalUnits : 0;
    return { units: totalUnits, area: totalArea, avgArea: Math.round(avgArea * 100) / 100 };
  }

  // Single year
  const v = getDistrictValueSingle(code, label);
  const avgArea = v.units > 0 ? v.area / v.units : 0;
  return { units: v.units, area: v.area, avgArea: Math.round(avgArea * 100) / 100 };
}

function getCurrentLabel() {
  if (currentYearIdx >= activeLabels.length) return '全部';
  return activeLabels[currentYearIdx];
}

function getMetricValue(vals) {
  return vals[currentMetric] || 0;
}

function getMetricLabel() {
  if (currentMetric === 'units') return '住宅套数';
  if (currentMetric === 'area') return '建筑面积';
  return '套均面积';
}

function getMetricUnit() {
  if (currentMetric === 'units') return '套';
  if (currentMetric === 'area') return 'm²';
  return 'm²/套';
}

// === Quantile breaks for choropleth ===
function getBreaks(values) {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 1, 2, 3, 4];
  const n = sorted.length;
  return [
    0,
    sorted[Math.floor(n * 0.2)] || sorted[0],
    sorted[Math.floor(n * 0.4)] || sorted[0],
    sorted[Math.floor(n * 0.6)] || sorted[0],
    sorted[Math.floor(n * 0.8)] || sorted[0],
    sorted[n - 1]
  ];
}

function getColor(value, breaks) {
  const colors = getColorScale();
  if (value <= 0) return '#f0efeb';
  for (let i = breaks.length - 1; i >= 1; i--) {
    if (value >= breaks[i]) return colors[Math.min(i - 1, colors.length - 1)];
  }
  return colors[0];
}

// === Build map ===
function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true
  }).setView([40.0, 116.4], 9);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 14,
    minZoom: 7
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
}

function updateMap() {
  const label = getCurrentLabel();
  const codes = Object.keys(mapData.districts);

  const allValues = codes.map(code => {
    const vals = getDistrictValue(code, label);
    return getMetricValue(vals);
  });
  const breaks = getBreaks(allValues);

  if (geoLayer) map.removeLayer(geoLayer);

  geoLayer = L.geoJSON(geoData, {
    style: function(feature) {
      const code = feature.properties.adcode;
      const vals = getDistrictValue(code, label);
      const value = getMetricValue(vals);
      return {
        fillColor: getColor(value, breaks),
        weight: 1.5,
        color: '#ffffff',
        fillOpacity: 0.85,
        opacity: 1
      };
    },
    onEachFeature: function(feature, layer) {
      const code = feature.properties.adcode;
      const name = feature.properties.name;
      const vals = getDistrictValue(code, label);

      const tooltipContent = `
        <div class="tt-name">${name}</div>
        <div class="tt-row"><span class="tt-label">套数</span><span class="tt-val">${formatFull(vals.units)} 套</span></div>
        <div class="tt-row"><span class="tt-label">面积</span><span class="tt-val">${formatFull(vals.area)} m²</span></div>
        <div class="tt-row"><span class="tt-label">套均</span><span class="tt-val">${vals.avgArea.toFixed(1)} m²/套</span></div>
      `;

      layer.bindTooltip(tooltipContent, {
        className: 'district-tooltip',
        direction: 'top',
        offset: [0, -10],
        sticky: true
      });

      layer.on('mouseover', function(e) {
        this.setStyle({ weight: 3, color: '#c0392b', fillOpacity: 0.95 });
        this.bringToFront();
      });
      layer.on('mouseout', function(e) {
        geoLayer.resetStyle(this);
      });
    }
  }).addTo(map);

  updateLegend(breaks);
  updateRanking(label);
}

function updateLegend(breaks) {
  const colors = getColorScale();
  const unit = getMetricUnit();
  let html = `<div class="legend-title">${getMetricLabel()} (${unit})</div>`;
  html += `<div class="legend-row"><span class="legend-swatch" style="background:#f0efeb"></span><span class="legend-label">无数据</span></div>`;

  for (let i = 0; i < colors.length; i++) {
    const lo = i === 0 ? 0 : breaks[i];
    const hi = breaks[i + 1] || breaks[breaks.length - 1];
    let label;
    if (currentMetric === 'avgArea') {
      label = lo.toFixed(0) + ' — ' + hi.toFixed(0);
    } else {
      label = formatNum(lo) + ' — ' + formatNum(hi);
    }
    html += `<div class="legend-row"><span class="legend-swatch" style="background:${colors[i]}"></span><span class="legend-label">${label}</span></div>`;
  }
  document.getElementById('legend').innerHTML = html;
}

function updateRanking(label) {
  const codes = Object.keys(mapData.districts);
  const items = codes.map(code => {
    const d = mapData.districts[code];
    const vals = getDistrictValue(code, label);
    return { name: d.name, value: getMetricValue(vals), vals };
  });

  items.sort((a, b) => b.value - a.value);
  const maxVal = items[0]?.value || 1;
  const unit = getMetricUnit();

  document.getElementById('sidebarMetric').textContent = getMetricLabel() + ' (' + unit + ')';

  const html = items.map((item, i) => {
    const pct = maxVal > 0 ? (item.value / maxVal * 100) : 0;
    let displayVal;
    if (currentMetric === 'avgArea') {
      displayVal = item.value > 0 ? item.value.toFixed(1) : '—';
    } else {
      displayVal = formatNum(item.value);
    }
    return `
      <div class="rank-item">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-name">${item.name}</span>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%"></div></div>
        <span class="rank-value">${displayVal}</span>
      </div>
    `;
  }).join('');

  document.getElementById('rankList').innerHTML = html;
}

// === Year label update ===
function updateYearDisplay() {
  const label = getCurrentLabel();
  if (label === '全部') {
    document.getElementById('yearLabel').textContent = '全部年份';
  } else if (currentGranularity === 'fiveYear' && label.includes('-')) {
    document.getElementById('yearLabel').textContent = label + '年';
  } else if (label === '早于1949') {
    document.getElementById('yearLabel').textContent = '早于1949';
  } else {
    document.getElementById('yearLabel').textContent = label + '年';
  }
}

// === Granularity switch ===
function switchGranularity(granularity) {
  if (granularity === currentGranularity) return;

  // Stop any animation
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    const btn = document.getElementById('playBtn');
    btn.textContent = '▶';
    btn.classList.remove('playing');
  }

  currentGranularity = granularity;
  activeLabels = granularity === 'fiveYear' ? fiveYearLabels : yearLabels;

  // Reset slider to "全部"
  const slider = document.getElementById('yearSlider');
  slider.max = activeLabels.length; // extra slot for "全部"
  currentYearIdx = activeLabels.length; // set to "全部"
  slider.value = currentYearIdx;

  // Update start label
  document.getElementById('sliderLabelStart').textContent = activeLabels[0] || '';

  updateYearDisplay();
  updateMap();
}

// === Animation ===
function togglePlay() {
  const btn = document.getElementById('playBtn');
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    btn.textContent = '▶';
    btn.classList.remove('playing');
    return;
  }

  btn.textContent = '⏸';
  btn.classList.add('playing');

  if (currentYearIdx >= activeLabels.length) {
    currentYearIdx = 0;
    document.getElementById('yearSlider').value = 0;
  }

  const interval = currentGranularity === 'fiveYear' ? 800 : 400;

  playTimer = setInterval(() => {
    currentYearIdx++;
    if (currentYearIdx > activeLabels.length) {
      clearInterval(playTimer);
      playTimer = null;
      btn.textContent = '▶';
      btn.classList.remove('playing');
      return;
    }
    document.getElementById('yearSlider').value = currentYearIdx;
    updateYearDisplay();
    updateMap();
  }, interval);
}

// === Init ===
async function init() {
  const [mapResp, geoResp] = await Promise.all([
    fetch('./map-data.json').then(r => r.json()),
    fetch('./beijing-districts.json').then(r => r.json())
  ]);
  mapData = mapResp;
  geoData = geoResp;
  yearLabels = mapData.yearLabels;

  // Build five-year bins
  buildFiveYearBins();

  // Default: yearly
  activeLabels = yearLabels;
  currentYearIdx = activeLabels.length; // "全部"

  // Set slider
  const slider = document.getElementById('yearSlider');
  slider.max = activeLabels.length;
  slider.value = currentYearIdx;

  // Init map
  initMap();
  updateYearDisplay();
  updateMap();

  // Metric toggle
  document.querySelectorAll('#metricToggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#metricToggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMetric = btn.dataset.metric;
      updateMap();
    });
  });

  // Granularity toggle
  document.querySelectorAll('#granularityToggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#granularityToggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchGranularity(btn.dataset.granularity);
    });
  });

  // Year slider
  slider.addEventListener('input', (e) => {
    currentYearIdx = parseInt(e.target.value);
    updateYearDisplay();
    updateMap();
  });

  // Play button
  document.getElementById('playBtn').addEventListener('click', togglePlay);
}

document.addEventListener('DOMContentLoaded', init);
