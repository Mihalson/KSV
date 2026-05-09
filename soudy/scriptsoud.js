// --- ZAKLADNI INICIALIZACE MAPY ---
const map = L.map('map', { zoomControl: false }).setView([49.8, 15.5], 7);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// CartoDB Positron podklad
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Ghost vrstva pro zvyrazneni
let highlightLayer = L.geoJSON(null, {
    interactive: false
}).addTo(map);

let ksData = {};
let osData = {};
let currentAgenda = "";
let currentYear = 2024;
let currentMetric = "";
let currentBreaks = [0, 0, 0, 0];
let minVal = 0, maxVal = 0;

let myChart = null;
let ksLayer = null;
let osLayer = null;
let currentLevel = "KS";
let currentFeature = null; 

// --- 1. NACTENI DAT ---
Promise.all([
    fetch('soudy_KS.json').then(res => res.json()).catch(() => ({})),
    fetch('soudy_OS.json').then(res => res.json()).catch(() => ({})),
    fetch('KS.geojson').then(res => res.json()).catch(() => null),
    fetch('OS.geojson').then(res => res.json()).catch(() => null)
]).then(([ks, os, ksGeo, osGeo]) => {
    ksData = ks;
    osData = os;
    
    populateFilters();

    if (ksGeo) ksLayer = L.geoJSON(ksGeo, { style: styleFeature, onEachFeature: onEachFeatureInteraction });
    if (osGeo) osLayer = L.geoJSON(osGeo, { style: styleFeature, onEachFeature: onEachFeatureInteraction });

    document.querySelectorAll('input[name="court-level"]').forEach(radio => {
        radio.addEventListener('change', (e) => switchLevel(e.target.value));
    });

    switchLevel(currentLevel);
    initSearch(); // Inicializace naseptavace
    
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";

}).catch(err => {
    console.error("Kriticka chyba pri nacitani dat mapy: ", err);
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
});

// --- NOVÉ: NASEPTAVAC A VYHLEDAVANI ---
function initSearch() {
    const searchInput = document.getElementById('courtSearch');
    const suggestionsList = document.getElementById('searchSuggestions');

    if (!searchInput || !suggestionsList) return;

    searchInput.addEventListener('input', function() {
        const val = this.value.toLowerCase();
        suggestionsList.innerHTML = '';
        
        if (!val) {
            suggestionsList.style.display = 'none';
            return;
        }

        const currentMapLayer = currentLevel === "KS" ? ksLayer : osLayer;
        if (!currentMapLayer) return;

        let matches = [];
        
        currentMapLayer.eachLayer(layer => {
            if (!layer.feature) return;
            
            const stat = getStats(layer.feature);
            if (stat) {
                // Jmena resime stejne jako v detailech
                const name = currentLevel === "KS" ? stat["Nadřízený soud"] : (stat["Název soudu"] || "Neznámý soud");
                
                if (name && name.toLowerCase().includes(val)) {
                    // Zabraneni duplicitam
                    if (!matches.find(m => m.name === name)) {
                        matches.push({ name: name, layer: layer, feature: layer.feature, stat: stat });
                    }
                }
            }
        });

        if (matches.length > 0) {
            matches.forEach(match => {
                const li = document.createElement('li');
                li.textContent = match.name;
                li.onclick = () => {
                    searchInput.value = match.name;
                    suggestionsList.style.display = 'none';
                    
                    // Zoom na vybrany soud
                    map.fitBounds(match.layer.getBounds(), { padding: [50, 50], animate: true, duration: 0.8 });
                    currentFeature = match.feature;
                    renderDetails(match.feature);
                    
                    // Zvyrazneni pomoci ghost vrstvy
                    highlightLayer.clearLayers();
                    highlightLayer.addData(match.feature);
                    const metricVal = match.stat[currentMetric] || null;
                    highlightLayer.setStyle({
                        weight: 4,
                        color: '#2563eb',
                        fillColor: getColor(metricVal),
                        fillOpacity: 0.9
                    });
                    highlightLayer.bringToFront();
                };
                suggestionsList.appendChild(li);
            });
            suggestionsList.style.display = 'block';
        } else {
            suggestionsList.style.display = 'none';
        }
    });

    // Skrytí našeptávače při kliknutí mimo
    document.addEventListener('click', function(e) {
        if (e.target !== searchInput && e.target !== suggestionsList) {
            suggestionsList.style.display = 'none';
        }
    });
}

// --- 2. LOGIKA FILTRU A ZISKANI METRIK ---
function populateFilters() {
    const aSel = document.getElementById('agendaSelect');
    const ySel = document.getElementById('yearSelect');
    const dataset = Object.keys(osData).length > 0 ? osData : ksData;
    
    Object.keys(dataset).forEach(agenda => aSel.add(new Option(agenda, agenda)));

    let years = new Set();
    if(dataset[Object.keys(dataset)[0]]) {
        dataset[Object.keys(dataset)[0]].forEach(d => years.add(d.rok));
    }
    Array.from(years).sort().forEach(y => ySel.add(new Option(y, y)));

    if (aSel.options.length > 0) currentAgenda = aSel.value;
    if (ySel.options.length > 0) ySel.value = Math.max(...Array.from(years));
    currentYear = parseInt(ySel.value);

    aSel.onchange = (e) => { currentAgenda = e.target.value; updateMetricSelect(); };
    ySel.onchange = (e) => { 
        currentYear = parseInt(e.target.value); 
        calculateBreaks(); 
        updateMapColors(); 
        if (currentFeature) renderDetails(currentFeature);
    };

    updateMetricSelect();
}

function updateMetricSelect() {
    const mSel = document.getElementById('metricSelect');
    const dataset = currentLevel === "KS" ? ksData : osData;
    
    if (!dataset || !dataset[currentAgenda] || dataset[currentAgenda].length === 0) {
        mSel.innerHTML = "";
        return;
    }

    const sampleRecord = dataset[currentAgenda][0];
    const ignoredKeys = ["id_ks", "id_os", "rok", "Nadřízený soud", "Název soudu", "Počet soudců k 1.1.", "Evidenční počet soudců k 1.1."];
    const keys = Object.keys(sampleRecord).filter(k => !ignoredKeys.includes(k) && typeof sampleRecord[k] === "number");

    const prevMetric = currentMetric;
    mSel.innerHTML = "";
    keys.forEach(k => mSel.add(new Option(k, k)));

    if (keys.includes(prevMetric)) {
        mSel.value = prevMetric;
    } else if (keys.length > 0) {
        mSel.value = keys[0];
    }
    
    currentMetric = mSel.value;

    mSel.onchange = (e) => {
        currentMetric = e.target.value;
        calculateBreaks();
        updateMapColors();
        if (currentFeature) renderDetails(currentFeature);
    };

    calculateBreaks();
    updateMapColors();
}

function switchLevel(level) {
    currentLevel = level;

    // Vycisteni vyhledavace pri prepnuti agendy
    const searchInput = document.getElementById('courtSearch');
    if (searchInput) searchInput.value = '';
    const suggestionsList = document.getElementById('searchSuggestions');
    if (suggestionsList) suggestionsList.style.display = 'none';
    highlightLayer.clearLayers();

    if (ksLayer) map.removeLayer(ksLayer);
    if (osLayer) map.removeLayer(osLayer);

    updateMetricSelect(); 

    if (currentLevel === "KS" && ksLayer) {
        ksLayer.addTo(map);
        ensurePragueOnTop(ksLayer);
    } 
    else if (currentLevel === "OS" && osLayer) {
        osLayer.addTo(map);
    }

    currentFeature = null; 
    document.getElementById('details').innerHTML = `
        <div class="empty-state">
            Jste na úrovni <b>${currentLevel === 'KS' ? 'krajských' : 'okresních'}</b> soudů.<br>
            Vyberte území v mapě nebo pomocí vyhledávání pro detail.
        </div>`;
}

// --- 3. DYNAMICKA BAREVNA SKALA A BREAKY ---
function isHigherBetter(metric) {
    const l = metric.toLowerCase();
    return l.includes("vyřízeno") || l.includes("míra vyřizování");
}

function calculateBreaks() {
    const dataset = currentLevel === "KS" ? ksData : osData;
    if (!dataset || !dataset[currentAgenda]) return;

    const dataForYear = dataset[currentAgenda].filter(d => d.rok === currentYear);
    const values = dataForYear.map(d => parseFloat(d[currentMetric])).filter(v => !isNaN(v));

    if (values.length === 0) {
        currentBreaks = [20, 40, 60, 80]; minVal = 0; maxVal = 100;
        updateLegend(); return;
    }

    minVal = Math.min(...values);
    maxVal = Math.max(...values);

    if (minVal === maxVal) {
        currentBreaks = [minVal, minVal, minVal, minVal];
    } else {
        const step = (maxVal - minVal) / 5;
        currentBreaks = [minVal + step, minVal + 2 * step, minVal + 3 * step, minVal + 4 * step];
    }
    updateLegend();
}

function getColor(d) {
    if (d == null || isNaN(d)) return '#cbd5e1';
    
    let colorIdx = 0;
    if (d >= currentBreaks[3]) colorIdx = 4;
    else if (d >= currentBreaks[2]) colorIdx = 3;
    else if (d >= currentBreaks[1]) colorIdx = 2;
    else if (d >= currentBreaks[0]) colorIdx = 1;

    const colors = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
    if (isHigherBetter(currentMetric)) colors.reverse();
    return colors[colorIdx];
}

function getStats(feature) {
    if (!currentAgenda || !currentMetric) return null;
    const dataset = currentLevel === "KS" ? ksData : osData;
    if (!dataset[currentAgenda]) return null;

    let targetId = feature.properties ? parseInt(feature.properties[currentLevel === "KS" ? "id_ks" : "id_os"]) : null;
    if (!targetId || isNaN(targetId)) targetId = parseInt(feature.id || (feature.properties && feature.properties.id));
    
    return dataset[currentAgenda].find(d => (currentLevel === "KS" ? d.id_ks : d.id_os) === targetId && d.rok === currentYear);
}

function styleFeature(feature) {
    const stat = getStats(feature);
    const val = stat ? stat[currentMetric] : null;
    
    return {
        fillColor: getColor(val),
        weight: 1.5,
        opacity: 1,
        color: 'white',
        fillOpacity: 0.75
    };
}

function updateMapColors() {
    if (currentLevel === "KS" && ksLayer) { ksLayer.setStyle(styleFeature); ensurePragueOnTop(ksLayer); }
    if (currentLevel === "OS" && osLayer) { osLayer.setStyle(styleFeature); }
    highlightLayer.bringToFront();
}

function onEachFeatureInteraction(feature, layer) {
    layer.on({
        mouseover: (e) => {
            highlightLayer.clearLayers();
            highlightLayer.addData(feature);
            
            const stat = getStats(feature);
            const val = stat ? stat[currentMetric] : null;
            
            highlightLayer.setStyle({
                weight: 4,
                color: '#2563eb',
                fillColor: getColor(val),
                fillOpacity: 0.9
            });
            highlightLayer.bringToFront();
        },
        mouseout: (e) => {
            highlightLayer.clearLayers(); 
        },
        click: (e) => {
            currentFeature = feature;
            map.fitBounds(e.target.getBounds(), { padding: [50, 50], animate: true, duration: 0.5 });
            renderDetails(feature);
        }
    });
}

function ensurePragueOnTop(layerGroup) {
    if (!layerGroup) return;
    try {
        layerGroup.eachLayer(l => {
            if (!l.feature) return; 
            const p = l.feature.properties || {};
            const id_ks = parseInt(p.id_ks);
            const fallbackId = parseInt(l.feature.id);
            const nazev = String(p.nazev || p.Nazev || p["Název soudu"] || "").toLowerCase();
            
            if (id_ks === 101 || id_ks === 1 || fallbackId === 1 || fallbackId === 101 || nazev.includes("praha") || nazev.includes("praze")) {
                if (l.bringToFront) l.bringToFront();
            }
        });
    } catch (err) {}
}

// --- 4. VYKRESLENI DETAILU SOUDU ---
function renderDetails(feature) {
    const stat = getStats(feature);
    const container = document.getElementById('details');
    
    if (!stat) {
        container.innerHTML = `
            <div class="empty-state" style="color: #ef4444; border-color: #fca5a5; background: #fef2f2;">
                Data pro tento soud nejsou ve vybraném filtru dostupná.
            </div>`;
        return;
    }

    const isKS = currentLevel === "KS";
    const targetId = isKS ? stat.id_ks : stat.id_os;
    const dataset = isKS ? ksData : osData;
    
    const displayTitle = isKS ? stat["Nadřízený soud"] : (stat["Název soudu"] || "Neznámý soud");

    const history = dataset[currentAgenda]
        .filter(d => (isKS ? d.id_ks === targetId : d.id_os === targetId))
        .sort((a, b) => a.rok - b.rok);

    let html = `<div class="court-title">${displayTitle}</div>`;

    if (!isKS) {
        html += `
            <p style="font-size: 13px; color: #64748b; margin-top: -2px; margin-bottom: 15px; font-weight: 500;">
                Nadřízený soud: <span style="color:#0f172a; font-weight: 700;">${stat["Nadřízený soud"] || 'Neznámý'}</span>
            </p>`;
    } else {
        html += `<div style="margin-bottom: 20px;"></div>`;
    }
    
    html += `
        <div class="chart-container">
            <canvas id="trendChart"></canvas>
        </div>
        <div class="stats-grid">
    `;

    for (let key in stat) {
        if (['id_ks', 'id_os', 'rok', 'Nadřízený soud', 'Název soudu'].includes(key)) continue;
        
        let val = stat[key];
        if (typeof val === 'number') {
            val = val.toLocaleString('cs-CZ', {maximumFractionDigits: 2});
        }
        
        const isHighlight = key === currentMetric;
        html += `<div class="stat-item" ${isHighlight ? 'style="border: 2px solid #2563eb; background: #eff6ff;"' : ''}>
                    <span class="stat-label">${key}</span>
                    <span class="stat-value">${val}</span>
                 </div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;

    const ctx = document.getElementById('trendChart').getContext('2d');
    if (myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(h => h.rok),
            datasets: [{
                label: currentMetric.length > 30 ? currentMetric.substring(0, 30) + "..." : currentMetric,
                data: history.map(h => h[currentMetric] || 0),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#2563eb'
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#e2e8f0' }, ticks: { font: { family: 'Inter', size: 11 } } }, 
                x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } } 
            }
        }
    });
}

// --- 5. DYNAMICKA LEGENDA S PEVNYMI INTERVALY ---
let legendCtrl = L.control({position: 'bottomleft'});
legendCtrl.onAdd = function () {
    let div = L.DomUtil.create('div', 'legend');
    div.id = 'map-legend';
    return div;
};
legendCtrl.addTo(map);

function formatLegendNum(num) {
    return Number(num).toLocaleString('cs-CZ', {
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2
    });
}

function updateLegend() {
    const div = document.getElementById('map-legend');
    if(!div) return;
    
    if(!currentMetric || currentBreaks[3] === 0) {
        div.innerHTML = `<strong style="display:block; font-size:12px;">Data nedostupná</strong>`;
        return;
    }

    const title = currentMetric.length > 40 ? currentMetric.substring(0, 40) + "..." : currentMetric;
    let html = `<strong style="display:block; margin-bottom:10px; font-size:12px; color:#0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">${title}</strong>`;
    
    const colors = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
    if (isHigherBetter(currentMetric)) colors.reverse();
    
    const limits = [minVal, ...currentBreaks, maxVal];

    if (minVal === maxVal) {
        html += `
            <div class="legend-item">
                <div class="legend-color" style="background:${colors[0]}"></div>
                ${formatLegendNum(minVal)}
            </div>
        `;
        div.innerHTML = html;
        return;
    }

    for (let i = 0; i < 5; i++) {
        let startVal = limits[i];
        let endVal = (i < 4) ? limits[i+1] - 0.01 : limits[i+1];
        if (startVal > endVal) endVal = startVal;
        
        let from = formatLegendNum(startVal);
        let to = formatLegendNum(endVal);
        
        html += `
            <div class="legend-item">
                <div class="legend-color" style="background:${colors[i]}"></div>
                ${from} &ndash; ${to}
            </div>
        `;
    }
    div.innerHTML = html;
}