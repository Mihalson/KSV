// --- SIDEBAR A STATISTIKY ZAMESTNANCU ---

function initSidebar() {
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebarHandle");
    const yearFilter = document.getElementById("yearFilterStaff");

    if (!sidebar || !handle) {
        console.error("Chyba: Sidebar nebo Handle nebyl v DOM nalezen.");
        return;
    }

    // Obsluha otevirani/zavirani
    handle.addEventListener("click", () => {
        // Vyuzivame state z hlavniho skriptu
        window.state.sidebarOpen = !window.state.sidebarOpen;
        
        // Prepinani trid presne podle naseho CSS pro pravy panel
        if (window.state.sidebarOpen) {
            sidebar.classList.remove("sidebar-right-collapsed");
            sidebar.classList.add("sidebar-right-open");
        } else {
            sidebar.classList.remove("sidebar-right-open");
            sidebar.classList.add("sidebar-right-collapsed");
        }
    });

    // Filtrovani roku
    if (yearFilter) {
        yearFilter.addEventListener("change", (e) => {
            renderStats(e.target.value);
        });
    } else {
        console.warn("Varovani: yearFilterStaff nebyl nalezen.");
    }
}

function renderStats(year) {
    const dashboard = document.getElementById("statsDashboard");
    
    // 1. Kontrola existence dashboardu a dat
    if (!dashboard) return;
    if (!window.state.employeeData) {
        console.log("Data pro zamestnance se jeste nacitaji...");
        return;
    }

    // 2. Vycisteni dashboardu
    dashboard.innerHTML = "";

    // 3. Prochazeni kategorii (Vek, Vzdelani, Delka praxe atd.)
    Object.keys(window.state.employeeData).forEach(categoryName => {
        const isTotalChart = categoryName.toLowerCase().includes('celkem');
        
        // Filtrace dat: Pokud jde o 'Celkem', bereme vse (pro line chart), 
        // jinak filtrujeme podle zvoleneho roku.
        const dataToRender = isTotalChart 
            ? window.state.employeeData[categoryName] 
            : window.state.employeeData[categoryName].filter(d => String(d.rok) === String(year));

        if (dataToRender.length > 0) {
            // Vytvoreni karty (HTML struktura)
            const card = createStatCard(categoryName, dataToRender, isTotalChart);
            dashboard.appendChild(card);
            
            // Vykresleni grafu do canvasu
            createDashboardChart(categoryName, dataToRender);
        }
    });
}

function createStatCard(name, data, isTotalChart) {
    const card = document.createElement("div");
    card.className = "stat-card"; // Trida z naseho benchmark CSS
    
    const lowerName = name.toLowerCase();
    const isGenderData = lowerName.includes('věk') || lowerName.includes('délka') || lowerName.includes('vzdělání');
    
    let col1 = isGenderData ? "Muži" : (isTotalChart ? "Plán" : "Příslušníci");
    let col2 = isGenderData ? "Ženy" : (isTotalChart ? "Skutečnost" : "Občané");

    // Jednoducha stylovana tabulka
    let tableHtml = `<table class="stat-table" style="width: 100%; font-size: 13px; text-align: left; border-collapse: collapse;">
        <thead>
            <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b;">
                <th style="padding: 8px 4px;">${isTotalChart ? "Rok" : "Kategorie"}</th>
                <th style="padding: 8px 4px;">${col1}</th>
                <th style="padding: 8px 4px;">${col2}</th>
            </tr>
        </thead>
        <tbody>`;

    data.forEach(row => {
        const label = row["Věková škála"] || row["Délka služebního poměru"] || 
                      row["Délka pracovního poměru"] || row["druh vzdělání"] || 
                      row["kategorie"] || row["rok"] || "";

        if (String(label).trim() !== "Celkem") {
            let val1 = isTotalChart ? (row["Schválené počty  (plánované)"] || 0) : (row["Muži"] || row["příslušníci"] || 0);
            let val2 = isTotalChart ? (row["Skutečný počet (se zálohami, bez nekázně)"] || 0) : (row["Ženy"] || row["občanští zaměstnanci"] || 0);

            tableHtml += `<tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 4px; color: #475569;">${label}</td>
                <td style="padding: 8px 4px; font-weight: 600; color: #0f172a;">${Number(val1).toLocaleString('cs-CZ')}</td>
                <td style="padding: 8px 4px; font-weight: 600; color: #0f172a;">${Number(val2).toLocaleString('cs-CZ')}</td>
            </tr>`;
        }
    });
    
    tableHtml += `</tbody></table>`;

    // Sestaveni karty
    card.innerHTML = `
        <div class="stat-card-header"><h3 style="margin: 0 0 15px 0; color: #0f172a; font-size: 16px;">${name}</h3></div>
        <div class="chart-container" style="height:250px; margin-bottom: 20px;"><canvas id="chart-${name.replace(/\s+/g, '')}"></canvas></div>
        <div class="table-container">${tableHtml}</div>
    `;
    return card;
}

function createDashboardChart(name, data) {
    const canvasId = `chart-${name.replace(/\s+/g, '')}`;
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;
    
    const ctx = canvasEl.getContext('2d');
    const lowerName = name.toLowerCase();
    const isTotalChart = lowerName.includes('celkem');
    const isEducation = lowerName.includes('vzdělání');

    // Nami definovane benchmark barvy
    const colors = {
        primary: '#2563eb',   // Hlavni modra
        secondary: '#14b8a6', // Tyrkysova pro zamestnance
        lightBlue: 'rgba(37, 99, 235, 0.1)'
    };

    // Pro grafy plan vs skutecnost pouzijeme cervenou jako varovani pro nedoplneny plan
    if(isTotalChart) {
        colors.secondary = '#ef4444'; 
    }

    let filtered = data.filter(d => {
        const label = String(d["Věková škála"] || d["Délka služebního poměru"] || d["druh vzdělání"] || d["kategorie"] || "");
        return label.trim() !== "Celkem";
    });

    filtered.sort((a, b) => (a.rok || 0) - (b.rok || 0));

    // Rozhodnuti o typu grafu a skladani (stacking)
    let chartType = isTotalChart ? 'line' : 'bar';
    let isStacked = !isTotalChart && !isEducation; // Vzdelani nebude stacked, ostatni bar grafy ano

    let config = {
        type: chartType,
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'bottom',
                    labels: { font: { family: 'Inter', size: 11 } }
                } 
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    stacked: isStacked,
                    grid: { color: '#f1f5f9' },
                    border: { display: false },
                    ticks: { font: { family: 'Inter', size: 11 } }
                },
                x: { 
                    stacked: isStacked,
                    grid: { display: false },
                    border: { display: false },
                    ticks: { font: { family: 'Inter', size: 11 } }
                }
            }
        }
    };

    if (isTotalChart) {
        config.data.labels = filtered.map(d => d.rok);
        config.data.datasets = [
            {
                label: 'Skutečnost',
                data: filtered.map(d => d["Skutečný počet (se zálohami, bez nekázně)"] || 0),
                borderColor: colors.primary,
                backgroundColor: colors.lightBlue,
                fill: true,
                tension: 0.4
            },
            {
                label: 'Plán',
                data: filtered.map(d => d["Schválené počty  (plánované)"] || 0),
                borderColor: colors.secondary,
                borderDash: [5, 5]
            }
        ];
    } else {
        const isGender = lowerName.includes('věk') || lowerName.includes('délka') || isEducation;
        config.data.labels = filtered.map(d => d["Věková škála"] || d["Délka služebního poměru"] || d["druh vzdělání"] || d["kategorie"] || "");
        config.data.datasets = [
            { 
                label: isGender ? 'Muži' : 'Příslušníci', 
                data: filtered.map(d => d["Muži"] || d["příslušníci"] || 0), 
                backgroundColor: colors.primary,
                borderRadius: isStacked ? 0 : 4
            },
            { 
                label: isGender ? 'Ženy' : 'Občané', 
                data: filtered.map(d => d["Ženy"] || d["občanští zaměstnanci"] || 0), 
                backgroundColor: colors.secondary,
                borderRadius: isStacked ? 0 : 4
            }
        ];
    }

    // Bezpecne zniceni predchozich instanci grafu, pokud existuji
    if (window.state && window.state.dashboardCharts && window.state.dashboardCharts[canvasId]) {
        window.state.dashboardCharts[canvasId].destroy();
    }
    
    if (!window.state.dashboardCharts) window.state.dashboardCharts = {};
    window.state.dashboardCharts[canvasId] = new Chart(ctx, config);
}