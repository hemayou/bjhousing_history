// === Data ===
const DATA = {
  labels: ["早于1949","1950","1951","1952","1953","1954","1955","1956","1957","1958","1959","1960","1961","1962","1963","1964","1965","1966","1967","1968","1969","1970","1971","1972","1973","1974","1975","1976","1977","1978","1979","1980","1981","1982","1983","1984","1985","1986","1987","1988","1989","1990","1991","1992","1993","1994","1995","1996","1997","1998","1999","2000","2001","2002","2003","2004","2005","2006","2007","2008","2009","2010","2011","2012","2013","2014","2015","2016","2017","2018","2019","2020"],
  units: [152688,29462,559,990,3085,9580,7647,6240,6732,14677,6818,30990,4885,3324,3859,6618,7681,3545,4371,2868,1775,57251,3265,4349,5696,7619,14216,16983,9349,19504,39509,172948,41624,50153,48884,64941,75636,69484,74560,84874,81338,145503,74909,104700,93006,127864,146057,116112,132840,140854,175198,191378,152603,184406,259430,270888,259353,202687,181908,144975,157721,163512,145630,189370,168525,142519,158920,145382,97128,81212,70280,1471],
  area: [4457331.78,1471730.55,24004.11,60462.55,157557.49,408017.14,332620.02,345466.22,313330.43,710268.76,342715.53,1426892.25,313462.36,220879.3,223762.29,377084.51,449216.56,154273.44,192795.55,108709.52,85633.06,2533400.95,154209.58,213111.65,274062.61,391455.08,728420.26,884917.11,497723.99,1076224.83,2231267.45,10411209.88,2461263.49,2894726.37,2829354.71,3908424.36,4935133.8,4212766.4,4626772.3,5278108.46,5163102.4,9762926.66,5322998.21,7517244.96,6104644.85,9270147.21,10905903.69,9567251.1,11505229.6,12531662.52,16619528.94,19455398.51,17224692.58,20846853.24,29367546.58,29971566.38,30137032.51,24215041.7,21277453.55,17438542.52,18032060.21,16063597.51,14901995.97,18824848.85,16095832.41,14044743.38,15304902.25,13536286.27,8703364.84,7844350.46,5891828.21,189623.32],
  plots: [2165,626,28,48,71,79,156,112,98,208,96,821,55,75,81,103,148,78,73,83,72,1372,76,145,138,168,255,325,195,352,481,2224,515,568,543,669,746,626,653,642,683,1403,556,624,607,674,832,710,769,812,891,1217,688,748,820,815,823,739,673,462,458,351,309,352,285,276,281,247,184,163,109,5]
};

// === State ===
let currentMetric = 'units';
let currentType = 'bar';
let rangeMin = 0;
let rangeMax = DATA.labels.length - 1;
let chart = null;
let sortCol = 'label';
let sortAsc = true;

// === Helpers ===
function formatNumber(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
  return n.toLocaleString('zh-CN');
}

function formatNumberFull(n) {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function getSlicedData() {
  const start = Math.min(rangeMin, rangeMax);
  const end = Math.max(rangeMin, rangeMax);
  const labels = DATA.labels.slice(start, end + 1);
  const units = DATA.units.slice(start, end + 1);
  const area = DATA.area.slice(start, end + 1);
  const plots = DATA.plots.slice(start, end + 1);
  const avgArea = units.map((u, i) => u > 0 ? Math.round((area[i] / u) * 100) / 100 : 0);
  return { labels, units, area, avgArea, plots };
}

function getCumulativeData(arr) {
  let sum = 0;
  return arr.map(v => { sum += v; return sum; });
}

// === KPI ===
function updateKPIs() {
  const d = getSlicedData();
  document.getElementById('kpi-span').textContent = d.labels[0] + ' — ' + d.labels[d.labels.length - 1];
  const totalUnits = d.units.reduce((a, b) => a + b, 0);
  const totalArea = d.area.reduce((a, b) => a + b, 0);
  const totalPlots = d.plots.reduce((a, b) => a + b, 0);
  const overallAvg = totalUnits > 0 ? (totalArea / totalUnits).toFixed(1) : '—';
  document.getElementById('kpi-units').textContent = formatNumber(totalUnits) + ' 套';
  document.getElementById('kpi-area').textContent = formatNumber(totalArea) + ' m²';
  document.getElementById('kpi-avg').textContent = overallAvg + ' m²';
  document.getElementById('kpi-plots').textContent = formatNumber(totalPlots);
}

// === Chart ===
function getMetricLabel() {
  if (currentMetric === 'units') return '住宅套数（套）';
  if (currentMetric === 'area') return '建筑面积（m²）';
  return '套均面积（m²/套）';
}

function getMetricData(d) {
  if (currentMetric === 'avgArea') return d.avgArea;
  const raw = currentMetric === 'units' ? d.units : d.area;
  return currentType === 'cumulative' ? getCumulativeData(raw) : raw;
}

function getChartTitle() {
  if (currentMetric === 'avgArea') return '套均面积';
  const metricStr = currentMetric === 'units' ? '住宅套数' : '建筑面积';
  if (currentType === 'cumulative') return metricStr + '（累计）';
  return metricStr;
}

function buildChart() {
  const d = getSlicedData();
  const values = getMetricData(d);
  const ctx = document.getElementById('mainChart').getContext('2d');

  if (chart) chart.destroy();

  const isLine = currentType === 'line' || currentType === 'cumulative' || currentMetric === 'avgArea';
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();

  const config = {
    type: isLine ? 'line' : 'bar',
    data: {
      labels: d.labels,
      datasets: [{
        label: getChartTitle(),
        data: values,
        backgroundColor: isLine
          ? 'rgba(192, 57, 43, 0.1)'
          : values.map((_, i) => {
              const maxVal = Math.max(...values);
              const ratio = values[i] / maxVal;
              const alpha = 0.35 + ratio * 0.6;
              return `rgba(192, 57, 43, ${alpha})`;
            }),
        borderColor: primaryColor,
        borderWidth: isLine ? 2.5 : 0,
        pointRadius: d.labels.length > 40 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: primaryColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: isLine,
        tension: 0.3,
        borderRadius: isLine ? 0 : 3,
        maxBarThickness: 40,
        hoverBackgroundColor: 'rgba(192, 57, 43, 0.95)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(26, 26, 24, 0.95)',
          titleColor: '#f5f4f0',
          bodyColor: '#f5f4f0',
          titleFont: { family: "'Noto Sans SC', sans-serif", size: 13, weight: '600' },
          bodyFont: { family: "'Noto Sans SC', sans-serif", size: 12 },
          padding: { top: 10, bottom: 10, left: 14, right: 14 },
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: function(items) {
              return items[0].label + '年';
            },
            label: function(item) {
              if (currentMetric === 'avgArea') {
                return '套均面积：' + item.raw.toFixed(2) + ' m²/套';
              }
              const metricLabel = currentMetric === 'units' ? '套数' : '面积';
              const suffix = currentMetric === 'units' ? ' 套' : ' m²';
              const prefix = currentType === 'cumulative' ? '累计' : '';
              return prefix + metricLabel + '：' + formatNumberFull(item.raw) + suffix;
            }
          }
        },
        datalabels: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: "'Noto Sans SC', sans-serif", size: 11 },
            color: '#6b6a66',
            maxRotation: 60,
            autoSkip: true,
            autoSkipPadding: 8
          },
          border: { color: '#d0cfcb' }
        },
        y: {
          grid: {
            color: 'rgba(0,0,0,0.04)',
            drawBorder: false
          },
          ticks: {
            font: { family: "'Noto Sans SC', sans-serif", size: 11 },
            color: '#6b6a66',
            callback: function(val) {
              if (currentMetric === 'avgArea') return val.toFixed(0) + ' m²';
              return formatNumber(val);
            },
            maxTicksLimit: 8
          },
          border: { display: false },
          beginAtZero: true
        }
      }
    }
  };

  chart = new Chart(ctx, config);
}

// === Table ===
function updateTable() {
  const d = getSlicedData();
  const rows = d.labels.map((label, i) => ({
    label,
    index: i,
    units: d.units[i],
    area: d.area[i],
    avgArea: d.avgArea[i],
    plots: d.plots[i]
  }));

  // Sort
  rows.sort((a, b) => {
    let va, vb;
    if (sortCol === 'label') {
      va = a.index;
      vb = b.index;
    } else {
      va = a[sortCol];
      vb = b[sortCol];
    }
    return sortAsc ? va - vb : vb - va;
  });

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td class="numeric">${formatNumberFull(r.units)}</td>
      <td class="numeric">${formatNumberFull(r.area)}</td>
      <td class="numeric">${r.avgArea.toFixed(2)}</td>
      <td class="numeric">${formatNumberFull(r.plots)}</td>
    </tr>
  `).join('');

  // Footer totals
  const totalUnits = d.units.reduce((a, b) => a + b, 0);
  const totalArea = d.area.reduce((a, b) => a + b, 0);
  const totalPlots = d.plots.reduce((a, b) => a + b, 0);

  const overallAvg = totalUnits > 0 ? (totalArea / totalUnits).toFixed(2) : '—';

  document.getElementById('tableFoot').innerHTML = `
    <tr>
      <td>合计</td>
      <td class="numeric">${formatNumberFull(totalUnits)}</td>
      <td class="numeric">${formatNumberFull(totalArea)}</td>
      <td class="numeric">${overallAvg}</td>
      <td class="numeric">${formatNumberFull(totalPlots)}</td>
    </tr>
  `;

  // Update header indicators
  document.querySelectorAll('#dataTable th.sortable').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    const col = th.dataset.sort;
    if (col === sortCol) {
      th.classList.add(sortAsc ? 'sorted-asc' : 'sorted-desc');
      const arrow = sortAsc ? ' ▲' : ' ▼';
      const text = th.textContent.replace(/ [▲▼]$/, '');
      th.textContent = text + arrow;
    } else {
      th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    }
  });
}

// === Event Binding ===
function init() {
  // Metric toggle
  document.querySelectorAll('#metricToggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#metricToggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMetric = btn.dataset.metric;
      buildChart();
      updateKPIs();
    });
  });

  // Chart type toggle
  document.querySelectorAll('#chartTypeToggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chartTypeToggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      buildChart();
    });
  });

  // Range sliders
  const rangeMinEl = document.getElementById('rangeMin');
  const rangeMaxEl = document.getElementById('rangeMax');

  function updateRange() {
    rangeMin = parseInt(rangeMinEl.value);
    rangeMax = parseInt(rangeMaxEl.value);
    const start = Math.min(rangeMin, rangeMax);
    const end = Math.max(rangeMin, rangeMax);
    document.getElementById('rangeStart').textContent = DATA.labels[start];
    document.getElementById('rangeEnd').textContent = DATA.labels[end];
    buildChart();
    updateKPIs();
    updateTable();
  }

  rangeMinEl.addEventListener('input', updateRange);
  rangeMaxEl.addEventListener('input', updateRange);

  // Table sorting
  document.querySelectorAll('#dataTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) {
        sortAsc = !sortAsc;
      } else {
        sortCol = col;
        sortAsc = col === 'label'; // default asc for label, desc for numbers
      }
      updateTable();
    });
  });

  // Initial render
  updateKPIs();
  buildChart();
  updateTable();
}

document.addEventListener('DOMContentLoaded', init);
