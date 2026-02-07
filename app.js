import { h, render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import htm from 'htm';
import Chart from 'chart.js/auto';
import html2canvas from 'https://esm.sh/html2canvas'; // Import html2canvas
import { loadGPX, processGPX } from './utils.js';

const html = htm.bind(h);

function FileUpload({ onUpload }) {
    const [isDragging, setIsDragging] = useState(false);

    const onDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.gpx')) {
            onUpload(file);
        } else {
            alert("Please drop a valid .gpx file");
        }
    };

    const onBoxClick = () => {
        document.getElementById('file-input').click();
    };

    const onFileChange = (e) => {
        const file = e.target.files[0];
        if (file) onUpload(file);
    };

    return html`
        <div 
            class="drop-zone ${isDragging ? 'active' : ''}"
            onDragOver=${(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave=${() => setIsDragging(false)}
            onDrop=${onDrop}
            onClick=${onBoxClick}
        >
            <input type="file" id="file-input" accept=".gpx" onChange=${onFileChange} />
            <div class="drop-zone-text">Drop your GPX file here</div>
            <div class="drop-zone-subtext">or click to browse</div>
        </div>
    `;
}

function StatsCard({ stats }) {
    if (!stats) return null;
    
    return html`
        <div class="card stats-grid">
            <div class="stat-item">
                <span class="stat-label">Distance</span>
                <div>
                    <span class="stat-value">${stats.distance}</span>
                    <span class="stat-unit">km</span>
                </div>
            </div>
            <div class="stat-item">
                <span class="stat-label">Elev Gain</span>
                <div>
                    <span class="stat-value">${stats.elevationGain}</span>
                    <span class="stat-unit">m</span>
                </div>
            </div>
             <div class="stat-item">
                <span class="stat-label">Max Elev</span>
                <div>
                    <span class="stat-value">${stats.maxElevation}</span>
                    <span class="stat-unit">m</span>
                </div>
            </div>
        </div>
    `;
}

function ElevationChart({ data, totalDistance, lineColor = '#3b82f6', showGrid = true }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !data) return;

        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const ctx = canvasRef.current.getContext('2d');
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, lineColor); // Solid color at top
        gradient.addColorStop(1, 'rgba(0,0,0,0)'); // Transparent at bottom (like Carbon)

        chartRef.current = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Elevation',
                    data: data,
                    borderColor: lineColor,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (ctx) => `${ctx.parsed.y.toFixed(0)}m (${ctx.raw.slope}°)`,
                            title: (ctx) => `${(ctx[0].parsed.x / 1000).toFixed(2)}km`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        max: totalDistance, // Fix: use the prop directly
                        display: showGrid,
                        grid: { display: false, color: '#333' },
                        ticks: { 
                            callback: (val) => (val / 1000).toFixed(1) + 'km',
                            color: '#71717a'
                        }
                    },
                    y: {
                        display: showGrid,
                        grid: { color: '#27272a' },
                        ticks: { color: '#71717a' }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [data, lineColor, showGrid]);

    return html`
        <div class="chart-container">
            <canvas ref=${canvasRef}></canvas>
        </div>
    `;
}

const THEMES = {
    carbon: { name: 'Carbon', accent: '#3b82f6' },
    vintage: { name: 'Vintage', accent: '#15803d' }, // British Racing Green
    trail: { name: 'Trail', accent: '#f97316' },  // Burnt Orange
    glow: { name: 'Glow', accent: '#d946ef' }     // Fuchsia/Neon
};

function App() {
    const [fileData, setFileData] = useState(null); // { stats, chartData }
    const [loading, setLoading] = useState(false);
    
    // Customization State
    const [theme, setTheme] = useState('carbon');
    const [lineColor, setLineColor] = useState(THEMES.carbon.accent);
    const [showGrid, setShowGrid] = useState(true);

    // Sync line color when theme changes
    useEffect(() => {
        setLineColor(THEMES[theme].accent);
    }, [theme]);

    const handleUpload = async (file) => {
        setLoading(true);
        try {
            const text = await loadGPX(file);
            const processed = processGPX(text);
            setFileData({ ...processed, fileName: file.name });
        } catch (e) {
            console.error(e);
            alert("Error parsing GPX file: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const exportRef = useRef(null);

    const handleExport = async () => {
        if (!exportRef.current || !fileData) return;
        
        try {
            const canvas = await html2canvas(exportRef.current, {
                backgroundColor: getComputedStyle(document.body).backgroundColor,
                scale: 2 // Retina quality
            });
            
            const dist = Math.round(parseFloat(fileData.stats.distance));
            const elev = fileData.stats.elevationGain;
            
            const link = document.createElement('a');
            link.download = `${dist}km_${elev}m_ride.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed");
        }
    };

    return html`
        <div class="w-full theme-${theme}">
            <h1>
                GPX Visualizer
                ${fileData?.fileName && html`<span style="color: var(--text-secondary); font-weight: 400; margin-left: 0.75rem; font-size: 1.25rem;">${fileData.fileName}</span>`}
            </h1>
            
            ${!fileData && html`
                <${FileUpload} onUpload=${handleUpload} />
            `}

            ${fileData && html`
                 <div class="flex justify-between items-center mb-4">
                    <button class="btn" onClick=${() => setFileData(null)}>← Upload New</button>
                    <div class="flex gap-4 items-center">
                        <div class="flex gap-1">
                            ${Object.entries(THEMES).map(([id, t]) => html`
                                <button 
                                    class="btn ${theme === id ? 'btn-primary' : ''}" 
                                    onClick=${() => setTheme(id)}
                                    style="padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                                >
                                    ${t.name}
                                </button>
                            `)}
                        </div>
                        <div class="flex items-center gap-4" style="border-left: 1px solid var(--border); padding-left: 1rem; margin-left: 0.5rem;">
                            <label class="flex items-center gap-2">
                                <span style="font-size:0.8rem; color:var(--text-secondary)">Color</span>
                                <input type="color" value=${lineColor} onInput=${(e) => setLineColor(e.target.value)} />
                            </label>
                             <label class="flex items-center gap-2">
                                <input type="checkbox" checked=${showGrid} onChange=${(e) => setShowGrid(e.target.checked)} />
                                 <span style="font-size:0.8rem; color:var(--text-secondary)">Grid</span>
                            </label>
                            <button class="btn btn-primary" onClick=${handleExport}>Export PNG</button>
                        </div>
                    </div>
                </div>

                <div ref=${exportRef} class="export-wrap" style="padding: 24px; background-color: var(--bg-app); border-radius: 12px;">
                    <div class="card mb-4">
                        <${ElevationChart} data=${fileData.chartData} totalDistance=${fileData.stats.totalDistance} lineColor=${lineColor} showGrid=${showGrid} />
                    </div>
                    
                    <${StatsCard} stats=${fileData.stats} />
                </div>
            `}
            
            ${loading && html`<div>Loading...</div>`}
        </div>
    `;
}

render(html`<${App} />`, document.getElementById('root'));
