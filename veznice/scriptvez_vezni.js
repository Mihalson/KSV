document.addEventListener('DOMContentLoaded', () => {
    // Poznamka: Otevirani sidebarLeft je reseno primo v HTML souboru, 
    // aby nedochazelo ke konfliktum a dvojitemu prepinani trid.
    initFiltersVezni();
});

// --- 1. INICIALIZACE FILTRU (LEVY PANEL) ---
function initFiltersVezni() {
    const datasetFilter = document.getElementById("datasetFilter");
    const yearFilter = document.getElementById("yearFilterPrisoners");

    if (!datasetFilter || !yearFilter) return;

    datasetFilter.addEventListener("change", fetchAndRenderVezniData);
    yearFilter.addEventListener("change", fetchAndRenderVezniData);

    // Prvotni nacteni pri startu
    fetchAndRenderVezniData();
}

// --- 2. NACITANI A ZPRACOVANI DAT ---
async function fetchAndRenderVezniData() {
    const datasetFilter = document.getElementById("datasetFilter");
    const yearFilter = document.getElementById("yearFilterPrisoners");
    
    if (!datasetFilter || !yearFilter) return;

    const dataset = datasetFilter.value;
    const year = yearFilter.value;
    const fileName = `${dataset}.json`;

    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error(`Nelze nacist ${fileName}`);
        
        const rawData = await response.json();
        
        // Ulozime kompletni data pro graf porovnani (vsechny roky) pod unikatnim nazvem
        window.fullVezniData = rawData; 
        initCategorySelect(rawData);
        
        // Vyfiltrovani dat jen pro zvoleny rok pro tabulky
        const filteredData = {};
        for (const kategorie in rawData) {
            filteredData[kategorie] = rawData[kategorie].filter(item => String(item.rok) === String(year));
        }

        // Volame prejmenovanou funkci, aby se netloukla s modalem
        renderVezniDashboard(filteredData, dataset, year);

    } catch (error) {
        console.error("Chyba pri nacitani dat veznu:", error);
        const dash = document.getElementById("prisonersDashboard");
        if (dash) dash.innerHTML = `<p style="color: #ef4444; font-size: 13px;">Nepodařilo se načíst data z <b>${fileName}</b>.</p>`;
    }
}

// --- 3. VYKRESLENI TABULEK ---
function renderVezniDashboard(data, datasetName, year) {
    const dashboard = document.getElementById("prisonersDashboard");
    if (!dashboard) return;
    
    dashboard.innerHTML = ""; 
    let hasData = false;

    for (const [title, records] of Object.entries(data)) {
        if (!records || records.length === 0) continue;
        hasData = true;

        const section = document.createElement("div");
        section.className = "stat-card"; // Pouziti tridy z naseho benchmark CSS
        section.innerHTML = `<h3 style="color: #0f172a; margin-top: 0;">${title.toUpperCase()} (${year})</h3>`;

        const table = document.createElement("table");
        table.style.cssText = "width: 100%; font-size: 13px; text-align: left; border-collapse: collapse; margin-top: 10px;";

        // Hlavicka (skryjeme nepotrebne technicke sloupce)
        const keys = Object.keys(records[0]).filter(k => k !== "rok" && k !== "id" && k !== "veznice");
        const headerRow = `<tr>${keys.map(k => `<th style="padding: 8px 4px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600;">${k}</th>`).join("")}</tr>`;
        
        // Telo tabulky
        const bodyRows = records.map(row => {
            const cells = keys.map(k => {
                let val = row[k];

                // Uprava procent
                if (k.toLowerCase().includes("%") || k.toLowerCase().includes("procent")) {
                    let formattedVal = val;
                    if (typeof val === "number") {
                        formattedVal = val < 1 ? (val * 100).toFixed(1) : val.toFixed(1);
                    }
                    return `<td style="padding: 8px 4px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #2563eb;">${formattedVal} %</td>`;
                }

                return `<td style="padding: 8px 4px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${val !== undefined && val !== null ? val : '-'}</td>`;
            }).join("");

            return `<tr>${cells}</tr>`;
        }).join("");

        table.innerHTML = `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;
        section.appendChild(table);
        dashboard.appendChild(section);
    }

    if (!hasData) {
        dashboard.innerHTML = `<p style="font-size: 13px; color: #64748b;">Pro rok ${year} nejsou k dispozici žádná data v kategorii ${datasetName}.</p>`;
    }
}

// -------------------------------------------------------------------
// CAST PRO POROVNAVACI GRAF V LEVEM PANELU (Chart.js)
// -------------------------------------------------------------------

window.vezniComparisonChart = null;

function initCategorySelect(allData) {
    const select = document.getElementById("categorySelect");
    if (!select) return;
    
    select.innerHTML = "";
    
    Object.keys(allData).forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category.toUpperCase();
        select.appendChild(option);
    });

    // Po naplneni kategorii rovnou naplnime i druhou roletku
    updateMetricSelect();
}

window.updateMetricSelect = function() {
    const categorySelect = document.getElementById("categorySelect");
    const metricSelect = document.getElementById("metricSelect");
    
    if (!categorySelect || !metricSelect || !window.fullVezniData) return;
    
    const category = categorySelect.value;
    if (!window.fullVezniData[category] || window.fullVezniData[category].length === 0) return;

    metricSelect.innerHTML = "";

    const ignoredKeys = ["rok", "id", "veznice"];
    const keys = Object.keys(window.fullVezniData[category][0]).filter(k => !ignoredKeys.includes(k));
    
    keys.forEach((key, index) => {
        // Pridame do vyberu hodnoty jen ciselna data
        if (index > 0 || typeof window.fullVezniData[category][0][key] === "number") {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key;
            metricSelect.appendChild(option);
        }
    });
}

window.compareYears = function() {
    const categorySelect = document.getElementById("categorySelect");
    const metricSelect = document.getElementById("metricSelect");
    const ctxElement = document.getElementById('comparisonChart');
    
    if (!categorySelect || !metricSelect || !ctxElement) return;

    const category = categorySelect.value;
    const metric = metricSelect.value;
    
    // Zjistime zaskrtnute roky
    const checkedBoxes = document.querySelectorAll('#yearCheckboxes input[type="checkbox"]:checked');
    const selectedYears = Array.from(checkedBoxes).map(cb => cb.value).sort();

    if (selectedYears.length === 0) {
        alert("Vyberte prosím alespoň jeden rok k porovnání.");
        return;
    }

    const records = window.fullVezniData[category];
    if (!records) return;

    // Najdeme klic pro osu X 
    const ignoredKeys = ["rok", "id", "veznice"];
    const allKeys = Object.keys(records[0]).filter(k => !ignoredKeys.includes(k));
    const xAxisKey = allKeys[0]; 

    // Unikatni labely pro osu X
    const xLabels = [...new Set(records.map(r => r[xAxisKey]))];

    // Benchmarkove barvy
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
    const datasets = [];

    // Vytvorime sadu dat pro kazdy vybrany rok
    selectedYears.forEach((year, index) => {
        const yearData = records.filter(r => String(r.rok) === year);
        
        const dataPoints = xLabels.map(label => {
            const record = yearData.find(r => r[xAxisKey] === label);
            let val = record ? record[metric] : 0;
            
            // Osetreni desetinnych mist u procent
            if (metric.toLowerCase().includes("%") && typeof val === "number" && val < 1) {
                val = val * 100;
            }
            return parseFloat(val) || 0;
        });

        datasets.push({
            label: `Rok ${year}`,
            data: dataPoints,
            backgroundColor: colors[index % colors.length],
            borderRadius: 4
        });
    });

    const isPercentage = metric.toLowerCase().includes("%") || metric.toLowerCase().includes("procent");
    const ctx = ctxElement.getContext('2d');

    // Bezpecne smazani stareho grafu
    if (window.vezniComparisonChart) {
        window.vezniComparisonChart.destroy();
    }

    // Vykresleni noveho moderniho grafu
    window.vezniComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: xLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Inter', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) { 
                            return isPercentage ? `${context.dataset.label}: ${context.raw.toFixed(1)} %` : `${context.dataset.label}: ${context.raw}`; 
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    border: { display: false },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        callback: function(value) { return isPercentage ? value + ' %' : value; }
                    }
                },
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });
}