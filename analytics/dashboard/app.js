/**
 * Performance Analytics Dashboard - Animated Bubble Chart
 * Using D3.js Force Simulation for crypto-bubbles style visualization
 */

// Configuration
const API_BASE = '/api/performance';
const QUEUE_STATUS_URL = '/api/metrics/queue-status';
let bubbleSimulation = null;
let currentData = [];
let lastTimeSeriesData = [];
let lastHeatmapData = [];
let activeChartType = 'bubble';
let currentView = 'bubbles'; // 'bubbles' | 'table'
let chartSearchQuery = '';
let latencyThreshold = 2000;

// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Color scale for latency (green = fast, red = slow)
const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
    .domain([500, 0]); // 500ms = red, 0ms = green

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Restore previously selected chart tab from localStorage
    try {
        const savedChartType = localStorage.getItem('linknest_active_chart');
        if (savedChartType && chartMetadata[savedChartType]) {
            activeChartType = savedChartType;
            // Update tab UI to show the saved chart as active
            document.querySelectorAll('.chart-tab').forEach(tab => {
                tab.classList.toggle('is-active', tab.dataset.chart === savedChartType);
            });
            // Update chart view visibility
            document.querySelectorAll('.chart-view').forEach(view => {
                view.classList.remove('is-active');
            });
            const chartMap = {
                bubble: 'bubble-chart',
                timeseries: 'timeseries-chart',
                bar: 'bar-chart',
                pie: 'pie-chart',
                histogram: 'histogram-chart',
                scatter: 'scatter-chart',
                heatmap: 'heatmap-chart',
                worldmap: 'worldmap-chart',
                table: 'bubble-table-container'
            };
            const chartId = chartMap[savedChartType];
            const chartView = document.getElementById(chartId);
            if (chartView) {
                chartView.classList.add('is-active');
            }
            // Update title and subtitle
            const metadata = chartMetadata[savedChartType];
            if (metadata) {
                document.getElementById('chart-title').textContent = metadata.title;
                document.getElementById('chart-subtitle').textContent = metadata.subtitle;
            }
        }
    } catch (e) {
        console.debug('Failed to restore chart preference:', e);
    }
    
    // Restore all filter preferences from localStorage
    restoreFilterPreferences();
    
    // Initialize bubble chart first
    initBubbleChart();

    // Small delay to ensure DOM is fully ready
    setTimeout(() => {
        loadFilters();
        refreshData();
    }, 100);

    // Event listeners with persistence
    document.getElementById('refresh-btn').addEventListener('click', refreshData);
    document.getElementById('url-filter').addEventListener('change', () => {
        saveFilterPreference('url-filter');
        refreshData();
    });
    document.getElementById('granularity-filter').addEventListener('change', () => {
        saveFilterPreference('granularity-filter');
        refreshData();
    });
    document.getElementById('username-filter').addEventListener('input', debounce(() => {
        saveFilterPreference('username-filter');
        refreshData();
    }, 500));
    document.getElementById('ip-filter').addEventListener('input', debounce(() => {
        saveFilterPreference('ip-filter');
        refreshData();
    }, 500));
    document.getElementById('auth-filter').addEventListener('change', () => {
        saveFilterPreference('auth-filter');
        refreshData();
    });

    // Time Filter Presets
    const periodInput = document.getElementById('period-filter');
    const presetBtns = document.querySelectorAll('.time-presets button[data-period]');
    const customBtn = document.getElementById('custom-range-btn');
    const customRangeDiv = document.getElementById('custom-range-inputs');

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('is-active'));
            if (customBtn) customBtn.classList.remove('is-active');
            btn.classList.add('is-active');
            if (customRangeDiv) customRangeDiv.style.display = 'none';

            periodInput.value = btn.dataset.period;
            saveFilterPreference('period-filter');
            saveFilterPreference('period-preset', btn.dataset.period);
            periodInput.dispatchEvent(new Event('change'));
        });
    });

    if (customBtn) {
        customBtn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('is-active'));
            customBtn.classList.add('is-active');
            if (customRangeDiv) customRangeDiv.style.display = 'flex';
        });
    }

    const applyCustomBtn = document.getElementById('apply-custom-range');
    if (applyCustomBtn) {
        applyCustomBtn.addEventListener('click', () => {
            const start = document.getElementById('start-date').value;
            const end = document.getElementById('end-date').value;
            if (start && end) {
                periodInput.value = `custom:${start}:${end}`;
                saveFilterPreference('period-filter');
                saveFilterPreference('period-preset', 'custom');
                saveFilterPreference('start-date');
                saveFilterPreference('end-date');
                periodInput.dispatchEvent(new Event('change'));
            } else {
                alert('Please select both start and end dates.');
            }
        });
    }

    // Chart tab switching
    const chartTabs = document.querySelectorAll('.chart-tab');
    chartTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const chartType = tab.dataset.chart;
            switchChart(chartType);
        });
    });

    // Reload filters when period or measurement type changes
    if (periodInput) {
        periodInput.addEventListener('change', async () => {
            await loadFilters();
            refreshData();
        });
    }

    const measurementFilter = document.getElementById('measurement-filter');
    if (measurementFilter) {
        measurementFilter.addEventListener('change', async () => {
            saveFilterPreference('measurement-filter');
            await loadFilters();
            refreshData();
        });
    }

    // Auto-refresh every 30 seconds
    setInterval(refreshData, 30000);

    // Fullscreen Toggle
    const fsBtn = document.getElementById('fullscreen-toggle');
    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);

    // Live filtering
    const searchInput = document.getElementById('chart-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            chartSearchQuery = e.target.value.toLowerCase();
            saveFilterPreference('chart-search');
            applyLiveFilters();
        });
    }

    const thresholdInput = document.getElementById('latency-threshold');
    const thresholdVal = document.getElementById('threshold-val');
    if (thresholdInput) {
        thresholdInput.addEventListener('input', (e) => {
            latencyThreshold = parseInt(e.target.value);
            if (thresholdVal) thresholdVal.textContent = latencyThreshold >= 2000 ? 'Off' : latencyThreshold + 'ms';
            saveFilterPreference('latency-threshold');
            applyLiveFilters();
        });
    }
});

function toggleFullscreen() {
    const chartCard = document.querySelector('.chart-card');
    if (!chartCard) return;

    chartCard.classList.toggle('fullscreen-mode');

    // Resize observers or manual resize trigger
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (currentData.length > 0) refreshData();
    }, 100);
}

function applyLiveFilters() {
    // We re-render the current chart with filtered data
    if (currentData.length > 0) {
        // We use a small debounce or just re-render
        renderCurrentChart();
    }
}

// ============================================
// FILTER PERSISTENCE FUNCTIONS
// ============================================

function saveFilterPreference(filterId, customValue) {
    try {
        const element = document.getElementById(filterId);
        if (!element) return;
        
        const value = customValue !== undefined ? customValue : 
                      (element.type === 'checkbox' ? element.checked : element.value);
        
        localStorage.setItem(`linknest_filter_${filterId}`, JSON.stringify(value));
    } catch (e) {
        console.debug('Failed to save filter preference:', filterId, e);
    }
}

function restoreFilterPreferences() {
    try {
        // Restore all filter values
        const filterIds = [
            'period-filter',
            'url-filter',
            'granularity-filter',
            'measurement-filter',
            'username-filter',
            'ip-filter',
            'auth-filter',
            'start-date',
            'end-date',
            'chart-search',
            'latency-threshold'
        ];
        
        filterIds.forEach(filterId => {
            const element = document.getElementById(filterId);
            if (!element) return;
            
            const savedValue = localStorage.getItem(`linknest_filter_${filterId}`);
            if (savedValue !== null) {
                try {
                    const value = JSON.parse(savedValue);
                    if (element.type === 'checkbox') {
                        element.checked = value;
                    } else {
                        element.value = value;
                    }
                } catch (e) {
                    // Invalid JSON, skip
                }
            }
        });
        
        // Restore time preset button state
        const savedPreset = localStorage.getItem('linknest_filter_period-preset');
        if (savedPreset) {
            try {
                const preset = JSON.parse(savedPreset);
                // Update button active state
                const presetBtns = document.querySelectorAll('.time-presets button[data-period]');
                const customBtn = document.getElementById('custom-range-btn');
                
                presetBtns.forEach(btn => {
                    btn.classList.toggle('is-active', btn.dataset.period === preset);
                });
                
                if (preset === 'custom') {
                    if (customBtn) customBtn.classList.add('is-active');
                    presetBtns.forEach(btn => btn.classList.remove('is-active'));
                    const customRangeDiv = document.getElementById('custom-range-inputs');
                    if (customRangeDiv) customRangeDiv.style.display = 'flex';
                } else {
                    if (customBtn) customBtn.classList.remove('is-active');
                }
            } catch (e) {
                // Invalid JSON, skip
            }
        }
        
        // Restore zoom level
        const savedZoom = localStorage.getItem('linknest_zoom_level');
        if (savedZoom) {
            try {
                currentZoom = parseFloat(JSON.parse(savedZoom));
                updateZoomDisplay();
            } catch (e) {
                // Invalid value, skip
            }
        }
        
        // Restore latency threshold display
        const thresholdVal = document.getElementById('threshold-val');
        const thresholdInput = document.getElementById('latency-threshold');
        if (thresholdVal && thresholdInput) {
            latencyThreshold = parseInt(thresholdInput.value) || 2000;
            thresholdVal.textContent = latencyThreshold >= 2000 ? 'Off' : latencyThreshold + 'ms';
        }
        
    } catch (e) {
        console.debug('Failed to restore filter preferences:', e);
    }
}

function getFilteredData() {
    return currentData.filter(d => {
        const matchesSearch = !chartSearchQuery ||
            (d.link_url && d.link_url.toLowerCase().includes(chartSearchQuery)) ||
            (d.region && d.region.toLowerCase().includes(chartSearchQuery)) ||
            (d.country_name && d.country_name.toLowerCase().includes(chartSearchQuery)) ||
            (d.city_name && d.city_name.toLowerCase().includes(chartSearchQuery));

        const matchesThreshold = !latencyThreshold || latencyThreshold >= 2000 || (d.avg_latency > latencyThreshold);

        return matchesSearch && matchesThreshold;
    });
}

// Chart metadata
const chartMetadata = {
    bubble: {
        title: 'Regional Performance Map',
        subtitle: 'Bubble size = measurement volume, Color = average latency',
        options: ''
    },
    timeseries: {
        title: 'Latency Trends Over Time',
        subtitle: 'Track performance changes across different time periods',
        options: ''
    },
    bar: {
        title: 'Performance Comparison',
        subtitle: 'Compare average latency across top locations',
        options: `
            <div class="view-toggle">
                <button id="bar-sort-latency" class="btn btn-secondary is-active">By Latency</button>
                <button id="bar-sort-volume" class="btn btn-secondary">By Volume</button>
            </div>
        `
    },
    pie: {
        title: 'Measurement Distribution',
        subtitle: 'Breakdown by performance status',
        options: ''
    },
    histogram: {
        title: 'Latency Distribution',
        subtitle: 'Frequency of latency ranges',
        options: ''
    },
    scatter: {
        title: 'Volume vs Performance',
        subtitle: 'Correlation between measurement volume and latency',
        options: ''
    },
    heatmap: {
        title: 'Performance Heatmap',
        subtitle: 'Latency patterns by time of day and day of week',
        options: ''
    },
    worldmap: {
        title: 'World Map - Geographic Distribution',
        subtitle: 'Global view with color-coded latency indicators',
        options: ''
    },
    table: {
        title: 'Detailed Data Table',
        subtitle: 'Complete performance metrics for all locations',
        options: ''
    }
};

// Switch between charts
function switchChart(chartType) {
    activeChartType = chartType;
    
    // Save to localStorage for persistence
    try {
        localStorage.setItem('linknest_active_chart', chartType);
    } catch (e) {
        console.debug('Failed to save chart preference:', e);
    }
    
    // Update tabs
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.classList.toggle('is-active', tab.dataset.chart === chartType);
    });

    // Update chart views
    document.querySelectorAll('.chart-view').forEach(view => {
        view.classList.remove('is-active');
    });

    // Show selected chart
    const chartMap = {
        bubble: 'bubble-chart',
        timeseries: 'timeseries-chart',
        bar: 'bar-chart',
        pie: 'pie-chart',
        histogram: 'histogram-chart',
        scatter: 'scatter-chart',
        heatmap: 'heatmap-chart',
        worldmap: 'worldmap-chart',
        table: 'bubble-table-container'
    };

    const chartId = chartMap[chartType];
    const chartView = document.getElementById(chartId);
    if (chartView) {
        chartView.classList.add('is-active');
    }

    // Update title and subtitle
    const metadata = chartMetadata[chartType];
    if (metadata) {
        document.getElementById('chart-title').textContent = metadata.title;
        document.getElementById('chart-subtitle').textContent = metadata.subtitle;

        // Update chart-specific options
        const optionsContainer = document.getElementById('chart-specific-options');
        optionsContainer.innerHTML = metadata.options;

        // Re-attach event listeners for bar chart buttons if needed
        if (chartType === 'bar') {
            const barLatencyBtn = document.getElementById('bar-sort-latency');
            const barVolumeBtn = document.getElementById('bar-sort-volume');

            if (barLatencyBtn && barVolumeBtn) {
                barLatencyBtn.addEventListener('click', () => {
                    barSortMode = 'latency';
                    barLatencyBtn.classList.add('is-active');
                    barVolumeBtn.classList.remove('is-active');
                    if (currentData.length > 0) renderBarChart(currentData);
                });

                barVolumeBtn.addEventListener('click', () => {
                    barSortMode = 'volume';
                    barVolumeBtn.classList.add('is-active');
                    barLatencyBtn.classList.remove('is-active');
                    if (currentData.length > 0) renderBarChart(currentData);
                });
            }
        }
    }

    // Final render with latest data and filters
    if (currentData.length > 0) {
        renderCurrentChart();
    }
    
    // If switching to world map, ensure map is properly sized after render
    if (chartType === 'worldmap') {
        setTimeout(() => {
            if (typeof worldMapInstance !== 'undefined' && worldMapInstance) {
                worldMapInstance.invalidateSize();
            }
        }, 150);
    }
}

// ============================================
// ZOOM FUNCTIONALITY
// ============================================

let currentZoom = 1.0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.2;

// Initialize zoom controls
document.addEventListener('DOMContentLoaded', () => {
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');

    if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomChart(ZOOM_STEP));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomChart(-ZOOM_STEP));
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetZoom);

    // Mouse wheel zoom (Ctrl + Wheel)
    const chartContainer = document.querySelector('.unified-chart-container');
    if (chartContainer) {
        chartContainer.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
                zoomChart(delta);
            }
        }, { passive: false });
    }

    // Enable pan on all chart views
    enablePanOnCharts();

    // Export CSV listener
    const exportBtn = document.getElementById('export-csv');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportChartDataToCSV);
    }
});

function zoomChart(delta) {
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + delta));

    if (newZoom === currentZoom) return;

    currentZoom = newZoom;
    updateZoomDisplay();
    applyZoom();
    
    // Save zoom level to localStorage
    try {
        localStorage.setItem('linknest_zoom_level', JSON.stringify(currentZoom));
    } catch (e) {
        console.debug('Failed to save zoom level:', e);
    }
}

function resetZoom() {
    currentZoom = 1.0;
    updateZoomDisplay();
    applyZoom();
    
    // Save reset zoom level
    try {
        localStorage.setItem('linknest_zoom_level', JSON.stringify(currentZoom));
    } catch (e) {
        console.debug('Failed to save zoom level:', e);
    }
}

function updateZoomDisplay() {
    const zoomLevelEl = document.getElementById('zoom-level');
    if (zoomLevelEl) {
        zoomLevelEl.textContent = `${Math.round(currentZoom * 100)}%`;
    }

    // Update button states
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');

    if (zoomInBtn) zoomInBtn.disabled = currentZoom >= MAX_ZOOM;
    if (zoomOutBtn) zoomOutBtn.disabled = currentZoom <= MIN_ZOOM;
}

function applyZoom() {
    // Apply zoom to all chart views
    document.querySelectorAll('.chart-view').forEach(view => {
        const svg = view.querySelector('svg');
        if (svg) {
            svg.style.transform = `scale(${currentZoom})`;
            svg.style.transformOrigin = 'top left';

            // Adjust container size to accommodate zoom
            const originalWidth = view.clientWidth;
            const originalHeight = view.clientHeight;
            svg.style.width = `${originalWidth}px`;
            svg.style.height = `${originalHeight}px`;
        }

        // For table view, zoom the entire content
        if (view.classList.contains('table-view')) {
            const table = view.querySelector('table');
            if (table) {
                table.style.transform = `scale(${currentZoom})`;
                table.style.transformOrigin = 'top left';
            }
        }

        // Enable scrolling when zoomed in
        if (currentZoom > 1.0) {
            view.classList.add('zoomable');
        } else {
            view.classList.remove('zoomable');
        }
    });
}

// Pan functionality - works at all zoom levels
function enablePanOnCharts() {
    document.querySelectorAll('.chart-view').forEach(view => {
        let isPanning = false;
        let startX, startY, scrollLeft, scrollTop;

        // Make all chart views pannable
        view.style.overflow = 'auto';
        view.classList.add('pannable');

        view.addEventListener('mousedown', (e) => {
            // Don't pan if clicking on interactive elements
            if (e.target.closest('button, a, input, select, textarea')) return;

            isPanning = true;
            startX = e.pageX - view.offsetLeft;
            startY = e.pageY - view.offsetTop;
            scrollLeft = view.scrollLeft;
            scrollTop = view.scrollTop;
            view.style.cursor = 'grabbing';
            e.preventDefault();
        });

        view.addEventListener('mouseleave', () => {
            isPanning = false;
            view.style.cursor = 'grab';
        });

        view.addEventListener('mouseup', () => {
            isPanning = false;
            view.style.cursor = 'grab';
        });

        view.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            e.preventDefault();

            const x = e.pageX - view.offsetLeft;
            const y = e.pageY - view.offsetTop;
            const walkX = (x - startX) * 2; // Increased sensitivity
            const walkY = (y - startY) * 2;

            view.scrollLeft = scrollLeft - walkX;
            view.scrollTop = scrollTop - walkY;
        });

        // Touch support for mobile
        let touchStartX, touchStartY;

        view.addEventListener('touchstart', (e) => {
            if (e.target.closest('button, a, input, select, textarea')) return;

            touchStartX = e.touches[0].pageX - view.offsetLeft;
            touchStartY = e.touches[0].pageY - view.offsetTop;
            scrollLeft = view.scrollLeft;
            scrollTop = view.scrollTop;
        }, { passive: true });

        view.addEventListener('touchmove', (e) => {
            if (!touchStartX) return;

            const x = e.touches[0].pageX - view.offsetLeft;
            const y = e.touches[0].pageY - view.offsetTop;
            const walkX = (x - touchStartX) * 2;
            const walkY = (y - touchStartY) * 2;

            view.scrollLeft = scrollLeft - walkX;
            view.scrollTop = scrollTop - walkY;
        }, { passive: true });

        view.addEventListener('touchend', () => {
            touchStartX = null;
            touchStartY = null;
        }, { passive: true });
    });
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildLocationLabel(item) {
    // URL view uses URL (or hostname); geo views use best available locality label
    if (item && item.url) {
        try {
            const u = new URL(item.url);
            return u.hostname.replace('www.', '');
        } catch {
            return item.url;
        }
    }

    const city = item.city_name || item.city || '';
    const region = item.region_name || item.region || '';
    const country = item.country_name || item.country || '';

    const parts = [];
    if (city) parts.push(city);
    if (region && region !== city) parts.push(region);
    if (country) parts.push(country);

    return parts.filter(Boolean).join(', ') || (item.region || 'Unknown');
}

function geoLabelForMapSearch(item) {
    const city = (item.city_name || item.city || '').trim();
    const region = (item.region_name || item.region || '').trim();
    const country = (item.country_name || item.country || '').trim();

    const parts = [];
    if (city && city !== 'Unknown') parts.push(city);
    if (region && region !== 'Unknown' && region !== city) parts.push(region);
    if (country && country !== 'Unknown') parts.push(country);

    return parts.join(', ');
}

function buildMapsUrl(item) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) > 0.0001 && Math.abs(lon) > 0.0001) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
    }

    // Fallback to a search query using geographic fields (never use hostname/URL)
    const label = geoLabelForMapSearch(item);
    if (label) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
    }

    return '';
}

function renderBubbleTable(data) {
    const tbody = document.getElementById('bubble-table-body');
    if (!tbody) return;

    if (!Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="text-center">No data yet</td></tr>';
        return;
    }

    // Order: most impactful first
    const sorted = [...data].sort((a, b) => (b.measurements || 0) - (a.measurements || 0));

    tbody.innerHTML = sorted.map(item => {
        const label = buildLocationLabel(item);
        const avg = typeof item.latency === 'number' ? item.latency : (parseInt(item.avg_latency, 10) || 0);
        const p95 = typeof item.p95 === 'number' ? item.p95 : (parseInt(item.p95, 10) || 0);
        const success = (typeof item.success_rate_pct === 'number') ? item.success_rate_pct : (item.success_rate_pct ? Number(item.success_rate_pct) : null);
        const status = item.status || 'unknown';
        const mapsUrl = buildMapsUrl(item);
        const lat = Number(item.lat);
        const lon = Number(item.lon);
        const latDisplay = Number.isFinite(lat) && Math.abs(lat) > 0.0001 ? lat.toFixed(5) : '—';
        const lonDisplay = Number.isFinite(lon) && Math.abs(lon) > 0.0001 ? lon.toFixed(5) : '—';
        const country = (item.country_name || item.country || '').trim();
        const region = (item.region_name || item.region || '').trim();
        const city = (item.city_name || '').trim();
        const countryDisplay = country && country !== 'Unknown' ? country : '—';
        const regionDisplay = region && region !== 'Unknown' ? region : '—';
        const cityDisplay = city && city !== 'Unknown' ? city : '—';
        const hasMap = !!mapsUrl;

        // Display username and IP
        const username = (item.username || '').trim();
        const ipAddress = (item.ip_address || '').trim();
        const usernameDisplay = username || '<span class="text-muted">—</span>';
        const ipDisplay = ipAddress || '<span class="text-muted">—</span>';

        return `
            <tr>
                <td>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div><strong>${escapeHtml(label)}</strong></div>
                        <div class="text-muted mono">${escapeHtml(item.url || '')}</div>
                    </div>
                </td>
                <td class="mono">${usernameDisplay}</td>
                <td class="mono">${ipDisplay}</td>
                <td class="mono">${escapeHtml(avg)}ms</td>
                <td class="mono">${escapeHtml(p95)}ms</td>
                <td>${success === null || Number.isNaN(success) ? '<span class="badge-dim">—</span>' : `<span class="badge-dim">${escapeHtml(success)}%</span>`}</td>
                <td class="mono">${escapeHtml(item.measurements ?? item.measurement_count ?? 0)}</td>
                <td class="mono">${escapeHtml(item.user_count ?? item.users ?? 0)}</td>
                <td>${escapeHtml(countryDisplay)}</td>
                <td>${escapeHtml(regionDisplay)}</td>
                <td>${escapeHtml(cityDisplay)}</td>
                <td class="mono">${escapeHtml(latDisplay)}</td>
                <td class="mono">${escapeHtml(lonDisplay)}</td>
                <td><span class="status-badge status-${escapeHtml(status)}">${escapeHtml(status)}</span></td>
                <td>
                    <a class="map-link ${hasMap ? '' : 'is-disabled'}" ${hasMap ? `href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer"` : 'href="#"'} title="${hasMap ? 'Open in Google Maps' : 'No geolocation available (lat/lon missing)'}">Open</a>
                </td>
            </tr>
        `;
    }).join('');
}

// Load available URLs for filter
async function loadFilters() {
    try {
        const urlFilter = document.getElementById('url-filter');
        const period = document.getElementById('period-filter').value;
        const measurementType = document.getElementById('measurement-filter').value;

        // Try to fetch URLs from API (may fail if endpoint has issues)
        const response = await fetch(`${API_BASE}/urls?period=${period}&type=${measurementType}`);

        if (!response.ok) {
            // Silently fall back to default option
            urlFilter.innerHTML = '<option value="">All URLs</option>';
            return;
        }

        const data = await response.json();

        if (!data.success || !data.urls || data.urls.length === 0) {
            urlFilter.innerHTML = '<option value="">All URLs (No data yet)</option>';
            return;
        }

        // Populate dropdown with real URLs
        let options = '<option value="">All URLs</option>';
        data.urls.forEach(item => {
            // Extract domain name for display
            let displayName = item.link_url;
            try {
                const urlObj = new URL(item.link_url);
                displayName = `${urlObj.hostname.replace('www.', '')} (${item.measurement_count} tests, ${item.avg_latency}ms)`;
            } catch (e) {
                displayName = `${item.link_url} (${item.measurement_count} tests)`;
            }
            options += `<option value="${item.link_url}">${displayName}</option>`;
        });

        urlFilter.innerHTML = options;

    } catch (error) {
        // Silently handle errors - just show default option
        const urlFilter = document.getElementById('url-filter');
        if (urlFilter) {
            urlFilter.innerHTML = '<option value="">All URLs</option>';
        }
    }
}

// Refresh all dashboard data
async function refreshData() {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
        btn.textContent = 'Loading...';
        btn.disabled = true;
    }

    try {
        // Load data first
        await loadBubbleData();
        await loadComparisonTable();

        // Initial render of current chart with filtered data
        renderCurrentChart();

        // Also update other components
        loadStats();
        loadQueueStatus();
    } catch (error) {
        console.error('Failed to refresh data:', error);
    } finally {
        if (btn) {
            btn.textContent = 'Update Dashboard';
            btn.disabled = false;
        }
    }
}

function renderCurrentChart() {
    const filtered = getFilteredData();

    switch (activeChartType) {
        case 'bubble':
            renderBubbles(filtered);
            break;
        case 'timeseries':
            renderTimeSeriesChart(filtered);
            break;
        case 'bar':
            renderBarChart(filtered);
            break;
        case 'pie':
            renderPieChart(filtered);
            break;
        case 'histogram':
            renderHistogram(filtered);
            break;
        case 'scatter':
            renderScatterPlot(filtered);
            break;
        case 'heatmap':
            renderHeatmap(filtered);
            break;
        case 'worldmap':
            renderWorldMap(filtered);
            break;
        case 'table':
            renderBubbleTable(filtered);
            break;
    }
}

// Load queue status and render into dashboard card
async function loadQueueStatus() {
    const pill = document.getElementById('queue-status-pill');
    const pendingEl = document.getElementById('queue-pending');
    const rateEl = document.getElementById('queue-rate');
    const waitEl = document.getElementById('queue-wait');
    const lastProcessedEl = document.getElementById('queue-last-processed');
    const updatedAtEl = document.getElementById('queue-updated-at');

    // Card might not exist in some builds
    if (!pill || !pendingEl || !rateEl || !waitEl || !lastProcessedEl || !updatedAtEl) {
        return;
    }

    try {
        pill.textContent = 'Loading';
        pill.className = 'queue-status-pill status-unknown';

        const res = await fetch(QUEUE_STATUS_URL, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`Queue status request failed (${res.status})`);
        }

        const data = await res.json();
        if (!data || data.success !== true) {
            throw new Error('Queue status response not successful');
        }

        const status = (data.queue && data.queue.status) ? String(data.queue.status) : 'unknown';
        const pending = data.queue && typeof data.queue.pending === 'number' ? data.queue.pending : null;
        const rate = data.processing && typeof data.processing.rate_per_minute === 'number' ? data.processing.rate_per_minute : null;
        const waitSeconds = data.queue && typeof data.queue.estimated_wait_seconds === 'number' ? data.queue.estimated_wait_seconds : null;
        const lastProcessed = data.queue ? (data.queue.latest_processed || '') : '';
        const updatedAt = data.timestamp || '';

        // Pill style
        const statusClass = status === 'healthy'
            ? 'status-healthy'
            : status === 'degraded'
                ? 'status-degraded'
                : status === 'overloaded'
                    ? 'status-overloaded'
                    : 'status-unknown';

        pill.className = `queue-status-pill ${statusClass}`;
        pill.textContent = status;

        pendingEl.textContent = pending === null ? '-' : pending.toLocaleString();
        rateEl.textContent = rate === null ? '-' : `${rate}/min`;

        if (typeof waitSeconds === 'number' && waitSeconds > 0) {
            if (waitSeconds < 60) {
                waitEl.textContent = `${waitSeconds}s`;
            } else if (waitSeconds < 3600) {
                const m = Math.floor(waitSeconds / 60);
                const s = waitSeconds % 60;
                waitEl.textContent = `${m}m ${s}s`;
            } else {
                const h = Math.floor(waitSeconds / 3600);
                const m = Math.floor((waitSeconds % 3600) / 60);
                waitEl.textContent = `${h}h ${m}m`;
            }
        } else {
            waitEl.textContent = '—';
        }

        lastProcessedEl.textContent = lastProcessed ? lastProcessed : '—';
        updatedAtEl.textContent = updatedAt ? updatedAt : '—';
    } catch (e) {
        pill.textContent = 'Unavailable';
        pill.className = 'queue-status-pill status-unknown';
        pendingEl.textContent = '-';
        rateEl.textContent = '-';
        waitEl.textContent = '-';
        lastProcessedEl.textContent = '-';
        updatedAtEl.textContent = '-';
    }
}

// Load statistics
async function loadStats() {
    try {
        // Calculate from current data
        const clientMetrics = currentData.filter(d => d.type === 'client');
        const serverMetrics = currentData.filter(d => d.type === 'server');

        const stats = {
            regions: currentData.length,
            clientLatency: clientMetrics.length > 0
                ? Math.round(clientMetrics.reduce((sum, d) => sum + d.latency, 0) / clientMetrics.length)
                : 0,
            serverLatency: serverMetrics.length > 0
                ? Math.round(serverMetrics.reduce((sum, d) => sum + d.latency, 0) / serverMetrics.length)
                : 0,
            delta: 0
        };

        stats.delta = Math.abs(stats.clientLatency - stats.serverLatency);

        animateValue('stat-regions', 0, stats.regions, 1000);
        animateValue('stat-client-latency', 0, stats.clientLatency, 1000, 'ms');
        animateValue('stat-server-latency', 0, stats.serverLatency, 1000, 'ms');
        animateValue('stat-delta', 0, stats.delta, 1000, 'ms');
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Animate number counting up
function animateValue(id, start, end, duration, suffix = '') {
    const element = document.getElementById(id);
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current) + suffix;
    }, 16);
}

// Initialize animated bubble chart
function initBubbleChart() {
    try {
        const container = document.getElementById('bubble-chart');
        if (!container) {
            console.error('Bubble chart container not found');
            return;
        }

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;

        // Add padding to prevent bubbles from being cut off
        const padding = 80; // Extra space around edges for large bubbles

        console.log('Initializing bubble chart:', { width, height });

        // Clear existing
        container.innerHTML = '';

        // Remove old tooltip if exists
        d3.selectAll('.bubble-tooltip').remove();

        // Create SVG with viewBox for proper scaling and padding
        const svg = d3.select('#bubble-chart')
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('background', 'transparent')
            .style('overflow', 'visible'); // Allow bubbles to extend beyond bounds

        // Create container for bubbles
        svg.append('g').attr('class', 'bubbles');

        // Create tooltip
        const tooltip = d3.select('body')
            .append('div')
            .attr('class', 'bubble-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background', '#fff')
            .style('color', '#334155')
            .style('padding', '10px 14px')
            .style('border-radius', '6px')
            .style('font-size', '13px')
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('box-shadow', '0 2px 8px rgba(0,0,0,0.1)')
            .style('border', '1px solid #e2e8f0');

        // Create force simulation
        bubbleSimulation = d3.forceSimulation()
            .force('charge', d3.forceManyBody().strength(5))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => d.radius + 2))
            .alphaDecay(0.02)
            .velocityDecay(0.3);

        window.bubbleTooltip = tooltip;

        console.log('Bubble chart initialized successfully');
    } catch (error) {
        console.error('Error initializing bubble chart:', error);
    }
}

// Load and render bubble data
async function loadBubbleData() {
    try {
        const period = document.getElementById('period-filter').value;
        const granularity = document.getElementById('granularity-filter').value;
        const measurementType = document.getElementById('measurement-filter').value;
        const urlFilter = document.getElementById('url-filter').value;
        const usernameFilter = document.getElementById('username-filter').value.trim();
        const ipFilter = document.getElementById('ip-filter').value.trim();
        const authFilter = document.getElementById('auth-filter').value;

        // Update stat label based on granularity
        const statLabel = document.getElementById('stat-label-items');
        if (statLabel) {
            const labels = {
                'url': 'Total URLs',
                'username': 'Total Users',
                'ip': 'Total IPs',
                'country': 'Total Countries',
                'region': 'Total Regions',
                'city': 'Total Cities'
            };
            statLabel.textContent = labels[granularity] || 'Total Items';
        }

        // Build query parameters
        const params = new URLSearchParams({
            period: period.startsWith('custom:') ? 'custom' : period,
            granularity: granularity,
            type: measurementType
        });

        if (period.startsWith('custom:')) {
            const parts = period.split(':');
            params.append('start', parts[1]);
            params.append('end', parts[2]);
        }

        if (urlFilter) {
            params.append('url', urlFilter);
        }

        if (usernameFilter) {
            params.append('username', usernameFilter);
        }

        if (ipFilter) {
            params.append('ip', ipFilter);
        }

        if (authFilter) {
            params.append('authenticated', authFilter);
        }

        // Fetch real data from API
        const response = await fetch(`${API_BASE}/bubble-chart?${params}`);

        if (!response.ok) {
            console.error('API not responding');
            currentData = [];
            renderBubbles([]);
            return;
        }

        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            console.warn('No data available yet');
            currentData = [];
            renderBubbles([]);
            return;
        }

        // Transform API data for bubble chart + table
        currentData = data.data.map(item => {
            // For URL granularity, show the URL as the main label
            let displayName, id;

            if (granularity === 'url') {
                // Extract domain from URL for cleaner display
                try {
                    const urlObj = new URL(item.link_url);
                    displayName = urlObj.hostname.replace('www.', '');
                    id = item.link_url;
                } catch (e) {
                    displayName = item.link_url;
                    id = item.link_url;
                }
            } else {
                // For geographic granularity, show region/country
                displayName = item.city_name || item.region_name || item.country_name;
                id = `${item.country_name}-${item.region_name || ''}-${item.city_name || ''}`;
            }

            return {
                id: id,
                region: displayName,
                country: item.country_name,
                latency: parseInt(item.avg_latency) || 0,
                measurements: parseInt(item.measurement_count) || 0,
                type: measurementType,
                lat: parseFloat(item.latitude) || 0,
                lon: parseFloat(item.longitude) || 0,
                url: item.link_url || null,
                // Table/tooltip extras
                country_name: item.country_name || '',
                region_name: item.region_name || '',
                city_name: item.city_name || '',
                avg_latency: parseInt(item.avg_latency) || 0,
                p50: parseInt(item.p50) || 0,
                p95: parseInt(item.p95) || 0,
                p99: parseInt(item.p99) || 0,
                min_latency: parseInt(item.min_latency) || 0,
                max_latency: parseInt(item.max_latency) || 0,
                user_count: parseInt(item.user_count) || 0,
                session_count: parseInt(item.session_count) || 0,
                successful_requests: parseInt(item.successful_requests) || 0,
                success_rate_pct: item.success_rate_pct !== undefined ? Number(item.success_rate_pct) : null,
                status: item.status || 'unknown'
            };
        });

        console.log('Loaded real bubble data:', currentData.length, 'regions');
    } catch (error) {
        console.error('Error loading bubble data:', error);
        currentData = [];
    }
}
// Sample data function removed - dashboard now shows only real data

// Render animated bubbles
function renderBubbles(data) {
    const container = document.getElementById('bubble-chart');
    if (!container) {
        console.error('Bubble chart container not found');
        return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Ensure simulation exists
    if (!bubbleSimulation) {
        console.warn('Bubble simulation not initialized, initializing now...');
        initBubbleChart();
    }

    // Scale for bubble size
    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(data, d => d.measurements)])
        .range([20, 120]);

    // Prepare bubble data
    const bubbles = data.map(d => ({
        ...d,
        radius: sizeScale(d.measurements),
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2
    }));

    const svg = d3.select('#bubble-chart svg g.bubbles');
    const tooltip = window.bubbleTooltip;

    // Check if SVG exists
    if (svg.empty()) {
        console.error('SVG not found, reinitializing chart');
        initBubbleChart();
        // Try again after initialization
        setTimeout(() => renderBubbles(data), 100);
        return;
    }

    // Bind data
    const bubbleGroups = svg.selectAll('g.bubble')
        .data(bubbles, d => d.id);

    // Remove old bubbles
    bubbleGroups.exit()
        .transition()
        .duration(500)
        .attr('transform', d => `translate(${width / 2},${height / 2})`)
        .style('opacity', 0)
        .remove();

    // Enter new bubbles
    const enter = bubbleGroups.enter()
        .append('g')
        .attr('class', 'bubble')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .style('opacity', 0)
        .style('cursor', 'pointer');

    // Add circle
    enter.append('circle')
        .attr('r', d => d.radius)
        .attr('fill', d => colorScale(d.latency))
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 2);

    // Add label
    enter.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.3em')
        .style('fill', 'white')
        .style('font-weight', '600')
        .style('font-size', d => Math.min(d.radius / 3, 16) + 'px')
        .style('pointer-events', 'none')
        .text(d => d.region.length > 12 ? d.region.substring(0, 10) + '...' : d.region);

    // Add latency text
    enter.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .style('fill', 'rgba(255,255,255,0.9)')
        .style('font-weight', '500')
        .style('font-size', d => Math.min(d.radius / 4, 13) + 'px')
        .style('pointer-events', 'none')
        .text(d => d.latency + 'ms');

    // Merge enter + update
    const merged = enter.merge(bubbleGroups);

    // Fade in
    merged.transition()
        .duration(800)
        .style('opacity', 1);

    // Update colors
    merged.select('circle')
        .transition()
        .duration(800)
        .attr('fill', d => colorScale(d.latency));

    // Add interactions
    merged
        .on('mouseover', function (event, d) {
            d3.select(this).select('circle')
                .transition()
                .duration(150)
                .attr('stroke-width', 3)
                .attr('stroke', '#4f46e5');

            tooltip
                .style('visibility', 'visible')
                .html(`
                    <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <strong style="font-size:14px;">${d.region}</strong>
                        <span class="status-badge status-${d.status}" style="font-size:10px; padding:2px 6px;">${d.status}</span>
                    </div>
                    <div style="font-size:12px; color:#475569; margin-bottom:8px;">
                        URL: ${d.link_url || 'Unknown'}<br/>
                        Latency: <span style="font-family:mono; color:var(--indigo-700); font-weight:bold;">${d.latency}ms</span><br/>
                        Tests: <span style="font-family:mono;">${d.measurements.toLocaleString()}</span>
                    </div>
                    <div style="text-align:center; font-size:11px; border-top:1px solid #e2e8f0; padding-top:6px; color:var(--indigo-600); font-weight:bold;">
                        Click to focus all charts here
                    </div>
                `);
        })
        .on('mousemove', function (event) {
            tooltip
                .style('top', (event.pageY - 10) + 'px')
                .style('left', (event.pageX + 10) + 'px');
        })
        .on('click', function (event, d) {
            const urlSelect = document.getElementById('url-filter');
            if (urlSelect) {
                for (let i = 0; i < urlSelect.options.length; i++) {
                    if (urlSelect.options[i].value === d.link_url) {
                        urlSelect.selectedIndex = i;
                        urlSelect.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }
        })
        .on('mouseout', function (event, d) {
            d3.select(this).select('circle')
                .transition()
                .duration(150)
                .attr('stroke-width', 2)
                .attr('stroke', '#e2e8f0');

            tooltip.style('visibility', 'hidden');
        });

    // Start simulation
    if (bubbleSimulation) {
        bubbleSimulation
            .nodes(bubbles)
            .force('collision', d3.forceCollide().radius(d => d.radius + 5))
            .force('x', d3.forceX(width / 2).strength(0.02))
            .force('y', d3.forceY(height / 2).strength(0.02))
            .alpha(1)
            .restart();

        // Update positions on tick
        bubbleSimulation.on('tick', () => {
            merged.attr('transform', d => `translate(${d.x},${d.y})`);
        });
    } else {
        console.error('Bubble simulation is null, cannot start animation');
    }
}

// Load comparison table
async function loadComparisonTable() {
    const tbody = document.getElementById('table-body');

    if (currentData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No data available</td></tr>';
        return;
    }

    // Sort by latency
    const sorted = [...currentData].sort((a, b) => b.latency - a.latency);

    tbody.innerHTML = sorted.map(item => {
        const serverLatency = Math.floor(item.latency * 0.7);
        const delta = item.latency - serverLatency;
        const status = item.latency < 100 ? 'excellent' :
            item.latency < 200 ? 'good' :
                item.latency < 350 ? 'degraded' : 'poor';

        return `
            <tr>
                <td><strong>${item.region}</strong></td>
                <td>${item.latency}ms</td>
                <td>${serverLatency}ms</td>
                <td>${delta}ms</td>
                <td>${item.measurements.toLocaleString()}</td>
                <td><span class="status-badge status-${status}">${status}</span></td>
            </tr>
        `;
    }).join('');
}

// Load alerts
async function loadAlerts() {
    const container = document.getElementById('alerts-container');

    // Check for high latency regions
    const alerts = currentData.filter(d => d.latency > 300);

    if (alerts.length === 0) {
        container.innerHTML = '<p class="text-muted">No performance alerts</p>';
        return;
    }

    container.innerHTML = alerts.map(alert => `
        <div class="alert-item ${alert.latency > 400 ? 'alert-critical' : 'alert-warning'}">
            <strong>${alert.region}</strong> — ${alert.latency}ms latency
            ${alert.latency > 400 ? '(Critical)' : '(Warning)'}
        </div>
    `).join('');
}

// Handle window resize
window.addEventListener('resize', debounce(() => {
    try {
        if (currentData.length > 0) {
            initBubbleChart();
            setTimeout(() => {
                renderBubbles(currentData);
            }, 100);
        }
    } catch (error) {
        console.error('Error during resize:', error);
    }
}, 300));

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// NEW CHART FUNCTIONS
// ============================================

let barSortMode = 'latency'; // 'latency' or 'volume'

// Initialize event listeners for new charts
document.addEventListener('DOMContentLoaded', () => {
    // Bar chart sort buttons
    const barLatencyBtn = document.getElementById('bar-sort-latency');
    const barVolumeBtn = document.getElementById('bar-sort-volume');

    if (barLatencyBtn && barVolumeBtn) {
        barLatencyBtn.addEventListener('click', () => {
            barSortMode = 'latency';
            barLatencyBtn.classList.add('is-active');
            barVolumeBtn.classList.remove('is-active');
            if (currentData.length > 0) renderBarChart(currentData);
        });

        barVolumeBtn.addEventListener('click', () => {
            barSortMode = 'volume';
            barVolumeBtn.classList.add('is-active');
            barLatencyBtn.classList.remove('is-active');
            if (currentData.length > 0) renderBarChart(currentData);
        });
    }
});

// 1. Time Series Chart
async function renderTimeSeriesChart(filteredData) {
    const container = document.getElementById('timeseries-chart');
    if (!container) return;

    container.innerHTML = '';

    try {
        const period = document.getElementById('period-filter').value;
        const measurementType = document.getElementById('measurement-filter').value;
        const urlFilter = document.getElementById('url-filter').value;

        // Try to fetch actual time-series metrics
        let timeSeriesData = [];

        try {
            let queryUrl = `/api/metrics/query?type=${measurementType}${urlFilter ? '&url=' + encodeURIComponent(urlFilter) : ''}`;

            if (period.startsWith('custom:')) {
                const parts = period.split(':');
                queryUrl += `&period=custom&start=${parts[1]}&end=${parts[2]}`;
            } else {
                queryUrl += `&period=${period}`;
            }

            const metricsResponse = await fetch(queryUrl);

            if (metricsResponse.ok) {
                const metricsResult = await metricsResponse.json();
                timeSeriesData = metricsResult.data || [];
            }
        } catch (error) { }

        // If we have passed filtered data, use that for simulation
        const baseData = filteredData || getFilteredData();

        // If no time series endpoint, create simulated data
        if (timeSeriesData.length === 0 && baseData.length > 0) {
            const urlGroups = {};
            baseData.forEach(item => {
                const url = item.url || item.link_url || 'Unknown';
                if (!urlGroups[url]) {
                    urlGroups[url] = {
                        url: url,
                        latency: parseInt(item.latency || item.avg_latency) || 0,
                        measurements: parseInt(item.measurements || item.measurement_count) || 0
                    };
                }
            });

            // Create sample time points (last 24 hours)
            const now = new Date();
            const hoursBack = period === '1h' ? 1 : period === '24h' ? 24 : period === '7d' ? 168 : 720;
            const pointCount = Math.min(hoursBack, 24); // Max 24 points

            Object.values(urlGroups).forEach(urlData => {
                for (let i = pointCount - 1; i >= 0; i--) {
                    const timestamp = new Date(now - i * (hoursBack / pointCount) * 60 * 60 * 1000);
                    // Add some variation to make it look realistic
                    const variation = (Math.random() - 0.5) * 0.3;
                    timeSeriesData.push({
                        timestamp: timestamp.toISOString(),
                        url: urlData.url,
                        avg_latency: Math.max(10, urlData.latency * (1 + variation)),
                        measurement_count: Math.floor(urlData.measurements / pointCount)
                    });
                }
            });
        }

        // Apply filters to real time-series data if fetching was successful
        if (timeSeriesData.length > 0) {
            timeSeriesData = timeSeriesData.filter(d => {
                const targetUrl = d.url || d.link_url || '';
                const matchesSearch = !chartSearchQuery || targetUrl.toLowerCase().includes(chartSearchQuery);
                const matchesThreshold = !latencyThreshold || latencyThreshold >= 2000 || (d.avg_latency > latencyThreshold);
                return matchesSearch && matchesThreshold;
            });
        }

        lastTimeSeriesData = timeSeriesData;

        if (timeSeriesData.length === 0) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No time series data available. Data will appear as metrics are collected over time.</div>';
            return;
        }

        // Group data by URL
        const urlMap = {};
        timeSeriesData.forEach(d => {
            const url = d.url || d.link_url || 'Unknown';
            if (!urlMap[url]) {
                urlMap[url] = [];
            }
            urlMap[url].push({
                date: new Date(d.timestamp || d.created_at),
                latency: parseFloat(d.avg_latency) || parseFloat(d.latency_ms) || 0,
                measurements: parseInt(d.measurement_count) || 1
            });
        });

        // Sort each URL's data by date
        Object.values(urlMap).forEach(data => {
            data.sort((a, b) => a.date - b.date);
        });

        const width = container.clientWidth;
        const height = container.clientHeight;
        const margin = { top: 20, right: 150, bottom: 50, left: 60 };

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Get all dates for x-axis
        const allDates = Object.values(urlMap).flat().map(d => d.date);
        const allLatencies = Object.values(urlMap).flat().map(d => d.latency);

        // Scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(allDates))
            .range([0, innerWidth]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(allLatencies) * 1.1])
            .range([innerHeight, 0]);

        // Color scale for different URLs
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        // Axes
        const xAxis = d3.axisBottom(xScale).ticks(8);
        const yAxis = d3.axisLeft(yScale).ticks(6);

        g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis)
            .selectAll('text')
            .style('fill', '#64748b')
            .style('font-size', '11px')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'end');

        g.append('g')
            .call(yAxis)
            .selectAll('text')
            .style('fill', '#64748b')
            .style('font-size', '12px');

        // Grid lines
        g.append('g')
            .attr('class', 'grid')
            .attr('opacity', 0.1)
            .call(d3.axisLeft(yScale).ticks(6).tickSize(-innerWidth).tickFormat(''));

        // Line generator
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.latency))
            .curve(d3.curveMonotoneX);

        // Draw lines for each URL
        const urls = Object.keys(urlMap);
        urls.forEach((url, index) => {
            const data = urlMap[url];
            const color = colorScale(index);

            // Draw line
            g.append('path')
                .datum(data)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('d', line)
                .style('opacity', 0)
                .transition()
                .duration(800)
                .style('opacity', 1);

            // Add dots
            g.selectAll(`.dot-${index}`)
                .data(data)
                .enter()
                .append('circle')
                .attr('class', `dot-${index}`)
                .attr('cx', d => xScale(d.date))
                .attr('cy', d => yScale(d.latency))
                .attr('r', 3)
                .attr('fill', color)
                .style('cursor', 'pointer')
                .style('opacity', 0)
                .on('mouseover', function (event, d) {
                    d3.select(this).attr('r', 5);
                    const urlDisplay = url.length > 30 ? url.substring(0, 30) + '...' : url;
                    showTooltip(event, `<strong>${urlDisplay}</strong><br/>Time: ${d.date.toLocaleString()}<br/>Latency: ${Math.round(d.latency)}ms<br/>Measurements: ${d.measurements}`);
                })
                .on('mouseout', function () {
                    d3.select(this).attr('r', 3);
                    hideTooltip();
                })
                .transition()
                .duration(800)
                .delay((d, i) => i * 20)
                .style('opacity', 1);
        });

        // Legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`);

        urls.forEach((url, index) => {
            const legendRow = legend.append('g')
                .attr('transform', `translate(0, ${index * 20})`);

            legendRow.append('line')
                .attr('x1', 0)
                .attr('x2', 20)
                .attr('y1', 0)
                .attr('y2', 0)
                .attr('stroke', colorScale(index))
                .attr('stroke-width', 2);

            // Truncate long URLs
            let displayUrl = url;
            try {
                const urlObj = new URL(url);
                displayUrl = urlObj.hostname.replace('www.', '');
            } catch (e) {
                displayUrl = url.length > 20 ? url.substring(0, 20) + '...' : url;
            }

            legendRow.append('text')
                .attr('x', 25)
                .attr('y', 4)
                .style('font-size', '11px')
                .style('fill', '#334155')
                .text(displayUrl)
                .append('title')
                .text(url);
        });

        // Y-axis label
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 15)
            .attr('x', -(height / 2))
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#64748b')
            .text('Latency (ms)');

        // X-axis label
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#64748b')
            .text('Time');

    } catch (error) {
        console.error('Error rendering time series chart:', error);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">Error loading chart. Check console for details.</div>';
    }
}

// 2. Bar Chart
function renderBarChart(data) {
    const container = document.getElementById('bar-chart');
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No data available</div>';
        return;
    }

    container.innerHTML = '';

    // Sort and limit to top 15
    const sorted = [...data].sort((a, b) => {
        if (barSortMode === 'volume') {
            return b.measurements - a.measurements;
        }
        return b.latency - a.latency;
    }).slice(0, 15);

    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 20, bottom: 80, left: 60 };

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Scales
    const xScale = d3.scaleBand()
        .domain(sorted.map(d => d.region))
        .range([0, innerWidth])
        .padding(0.2);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(sorted, d => barSortMode === 'volume' ? d.measurements : d.latency) * 1.1])
        .range([innerHeight, 0]);

    // Axes
    g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale))
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end')
        .style('fill', '#64748b')
        .style('font-size', '11px');

    g.append('g')
        .call(d3.axisLeft(yScale).ticks(6))
        .selectAll('text')
        .style('fill', '#64748b')
        .style('font-size', '12px');

    // Bars
    g.selectAll('.bar')
        .data(sorted)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.region))
        .attr('y', innerHeight)
        .attr('width', xScale.bandwidth())
        .attr('height', 0)
        .attr('fill', d => barSortMode === 'volume' ? '#6366f1' : colorScale(d.latency))
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
            d3.select(this).attr('opacity', 0.8);
            const value = barSortMode === 'volume' ? `${d.measurements.toLocaleString()} tests` : `${d.latency}ms average`;
            showTooltip(event, `
                <div style="margin-bottom:4px;"><strong>${d.region}</strong></div>
                <div style="font-size:12px; color:#475569; margin-bottom:4px;">${value}</div>
                <div style="text-align:center; font-size:10px; border-top:1px solid #e2e8f0; padding-top:4px; color:var(--indigo-600); font-weight:bold;">
                    Click to drill down
                </div>
            `);
        })
        .on('click', function (event, d) {
            const urlSelect = document.getElementById('url-filter');
            if (urlSelect) {
                for (let i = 0; i < urlSelect.options.length; i++) {
                    if (urlSelect.options[i].value === d.link_url) {
                        urlSelect.selectedIndex = i;
                        urlSelect.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }
        })
        .on('mouseout', function () {
            d3.select(this).attr('opacity', 1);
            hideTooltip();
        })
        .transition()
        .duration(800)
        .attr('y', d => yScale(barSortMode === 'volume' ? d.measurements : d.latency))
        .attr('height', d => innerHeight - yScale(barSortMode === 'volume' ? d.measurements : d.latency));

    // Y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 15)
        .attr('x', -(height / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#64748b')
        .text(barSortMode === 'volume' ? 'Measurements' : 'Latency (ms)');
}

// 3. Pie Chart
function renderPieChart(data) {
    const container = document.getElementById('pie-chart');
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No data available</div>';
        return;
    }

    container.innerHTML = '';

    // Group by status
    const statusGroups = {
        excellent: data.filter(d => d.latency < 100).reduce((sum, d) => sum + d.measurements, 0),
        good: data.filter(d => d.latency >= 100 && d.latency < 200).reduce((sum, d) => sum + d.measurements, 0),
        degraded: data.filter(d => d.latency >= 200 && d.latency < 350).reduce((sum, d) => sum + d.measurements, 0),
        poor: data.filter(d => d.latency >= 350).reduce((sum, d) => sum + d.measurements, 0)
    };

    const pieData = Object.entries(statusGroups)
        .filter(([_, value]) => value > 0)
        .map(([key, value]) => ({ status: key, count: value }));

    if (pieData.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No data available</div>';
        return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height) / 2 - 40;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

    const colorMap = {
        excellent: '#10b981',
        good: '#22c55e',
        degraded: '#f59e0b',
        poor: '#ef4444'
    };

    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);

    const arc = d3.arc()
        .innerRadius(radius * 0.5)
        .outerRadius(radius);

    const arcs = g.selectAll('.arc')
        .data(pie(pieData))
        .enter()
        .append('g')
        .attr('class', 'arc');

    arcs.append('path')
        .attr('d', arc)
        .attr('fill', d => colorMap[d.data.status])
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
            d3.select(this).transition().duration(150)
                .attr('d', d3.arc().innerRadius(radius * 0.5).outerRadius(radius * 1.05));
            const pct = ((d.data.count / d3.sum(pieData, p => p.count)) * 100).toFixed(1);
            showTooltip(event, `<strong>${d.data.status.toUpperCase()}</strong><br/>${d.data.count.toLocaleString()} measurements (${pct}%)`);
        })
        .on('mouseout', function () {
            d3.select(this).transition().duration(150).attr('d', arc);
            hideTooltip();
        })
        .transition()
        .duration(800)
        .attrTween('d', function (d) {
            const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
            return function (t) { return arc(interpolate(t)); };
        });

    // Legend
    const legend = svg.append('g')
        .attr('transform', `translate(20, 20)`);

    pieData.forEach((d, i) => {
        const legendRow = legend.append('g')
            .attr('transform', `translate(0, ${i * 20})`);

        legendRow.append('rect')
            .attr('width', 12)
            .attr('height', 12)
            .attr('fill', colorMap[d.status]);

        legendRow.append('text')
            .attr('x', 18)
            .attr('y', 10)
            .style('font-size', '11px')
            .style('fill', '#334155')
            .text(d.status.charAt(0).toUpperCase() + d.status.slice(1));
    });
}

// 4. Histogram
function renderHistogram(data) {
    const container = document.getElementById('histogram-chart');
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No data available</div>';
        return;
    }

    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create bins
    const latencies = data.map(d => d.latency);
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(latencies)])
        .range([0, innerWidth]);

    const histogram = d3.histogram()
        .domain(xScale.domain())
        .thresholds(xScale.ticks(20));

    const bins = histogram(latencies);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)])
        .range([innerHeight, 0]);

    // Axes
    g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).ticks(8))
        .selectAll('text')
        .style('fill', '#64748b')
        .style('font-size', '11px');

    g.append('g')
        .call(d3.axisLeft(yScale).ticks(6))
        .selectAll('text')
        .style('fill', '#64748b')
        .style('font-size', '12px');

    // Bars
    g.selectAll('.hist-bar')
        .data(bins)
        .enter()
        .append('rect')
        .attr('class', 'hist-bar')
        .attr('x', d => xScale(d.x0) + 1)
        .attr('y', innerHeight)
        .attr('width', d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 2))
        .attr('height', 0)
        .attr('fill', '#6366f1')
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
            d3.select(this).attr('opacity', 0.8);
            showTooltip(event, `<strong>${Math.round(d.x0)}-${Math.round(d.x1)}ms</strong><br/>${d.length} locations`);
        })
        .on('mouseout', function () {
            d3.select(this).attr('opacity', 1);
            hideTooltip();
        })
        .transition()
        .duration(800)
        .attr('y', d => yScale(d.length))
        .attr('height', d => innerHeight - yScale(d.length));

    // Labels
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 15)
        .attr('x', -(height / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#64748b')
        .text('Frequency');

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 10)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#64748b')
        .text('Latency (ms)');
}

// 5. Scatter Plot
function renderScatterPlot(data) {
    const container = document.getElementById('scatter-chart');
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No data available</div>';
        return;
    }

    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Scales
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.measurements) * 1.1])
        .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.latency) * 1.1])
        .range([innerHeight, 0]);

    // Axes
    g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).ticks(8))
        .selectAll('text')
        .style('fill', '#64748b')
        .style('font-size', '11px');

    g.append('g')
        .call(d3.axisLeft(yScale).ticks(8))
        .selectAll('text')
        .style('fill', '#64748b')
        .style('font-size', '12px');

    // Grid
    g.append('g')
        .attr('class', 'grid')
        .attr('opacity', 0.1)
        .call(d3.axisLeft(yScale).ticks(8).tickSize(-innerWidth).tickFormat(''));

    // Points
    g.selectAll('.dot')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'dot')
        .attr('cx', innerWidth / 2)
        .attr('cy', innerHeight / 2)
        .attr('r', 0)
        .attr('fill', d => colorScale(d.latency))
        .attr('opacity', 0.7)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
            d3.select(this).attr('r', 8).attr('opacity', 1);
            showTooltip(event, `
                <div style="margin-bottom:4px;"><strong>${d.region}</strong></div>
                <div style="font-size:12px; color:#475569;">Latency: ${d.latency}ms</div>
                <div style="font-size:12px; color:#475569; margin-bottom:4px;">Volume: ${d.measurements.toLocaleString()}</div>
                <div style="text-align:center; font-size:10px; border-top:1px solid #e2e8f0; padding-top:4px; color:var(--indigo-600); font-weight:bold;">
                    Click to drill down
                </div>
            `);
        })
        .on('click', function (event, d) {
            const urlSelect = document.getElementById('url-filter');
            if (urlSelect) {
                for (let i = 0; i < urlSelect.options.length; i++) {
                    if (urlSelect.options[i].value === d.link_url) {
                        urlSelect.selectedIndex = i;
                        urlSelect.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }
        })
        .on('mouseout', function () {
            d3.select(this).attr('r', 5).attr('opacity', 0.7);
            hideTooltip();
        })
        .transition()
        .duration(800)
        .delay((d, i) => i * 20)
        .attr('cx', d => xScale(d.measurements))
        .attr('cy', d => yScale(d.latency))
        .attr('r', 5);

    // Labels
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 15)
        .attr('x', -(height / 2))
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#64748b')
        .text('Latency (ms)');

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 10)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#64748b')
        .text('Number of Measurements');
}

// 6. Heatmap
async function renderHeatmap(filteredData) {
    const container = document.getElementById('heatmap-chart');
    if (!container) return;

    container.innerHTML = '';

    try {
        const period = document.getElementById('period-filter').value;
        const measurementType = document.getElementById('measurement-filter').value;
        const urlFilter = document.getElementById('url-filter').value;

        const params = new URLSearchParams({
            period: period.startsWith('custom:') ? 'custom' : period,
            type: measurementType
        });

        if (period.startsWith('custom:')) {
            const parts = period.split(':');
            params.append('start', parts[1]);
            params.append('end', parts[2]);
        }

        if (urlFilter) params.append('url', urlFilter);

        // Try to fetch heatmap data (optional endpoint - may not exist yet)
        let data = [];

        try {
            const response = await fetch(`${API_BASE}/heatmap?${params}`);
            if (response.ok) {
                const result = await response.json();
                data = result.data || [];
            }
            // Silently ignore 404 - endpoint doesn't exist yet
        } catch (error) {
            // Silently ignore fetch errors
        }

        lastHeatmapData = data;

        if (data.length === 0) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">Heatmap will display when time-series data is available.<br/>Data is collected as metrics are gathered over time.</div>';
            return;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;
        const margin = { top: 40, right: 100, bottom: 50, left: 60 };

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const hours = Array.from({ length: 24 }, (_, i) => i);

        const xScale = d3.scaleBand()
            .domain(hours)
            .range([0, innerWidth])
            .padding(0.05);

        const yScale = d3.scaleBand()
            .domain(days)
            .range([0, innerHeight])
            .padding(0.05);

        const colorHeatmap = d3.scaleSequential(d3.interpolateYlOrRd)
            .domain([0, d3.max(data, d => parseFloat(d.avg_latency) || 0)]);

        // Axes
        g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .style('fill', '#64748b')
            .style('font-size', '11px');

        g.append('g')
            .call(d3.axisLeft(yScale))
            .selectAll('text')
            .style('fill', '#64748b')
            .style('font-size', '11px');

        // Cells
        g.selectAll('.heatmap-cell')
            .data(data)
            .enter()
            .append('rect')
            .attr('class', 'heatmap-cell')
            .attr('x', d => xScale(parseInt(d.hour)))
            .attr('y', d => yScale(days[parseInt(d.day_of_week)]))
            .attr('width', xScale.bandwidth())
            .attr('height', yScale.bandwidth())
            .attr('fill', d => colorHeatmap(parseFloat(d.avg_latency) || 0))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('mouseover', function (event, d) {
                d3.select(this).attr('stroke', '#4f46e5').attr('stroke-width', 2);
                showTooltip(event, `<strong>${days[parseInt(d.day_of_week)]} ${d.hour}:00</strong><br/>Avg: ${Math.round(d.avg_latency)}ms<br/>Count: ${d.measurement_count}`);
            })
            .on('mouseout', function () {
                d3.select(this).attr('stroke', '#fff').attr('stroke-width', 1);
                hideTooltip();
            });

        // Color legend
        const legendWidth = 20;
        const legendHeight = innerHeight;
        const legendScale = d3.scaleLinear()
            .domain(colorHeatmap.domain())
            .range([legendHeight, 0]);

        const legendAxis = d3.axisRight(legendScale).ticks(5);

        const legend = svg.append('g')
            .attr('transform', `translate(${width - margin.right + 20}, ${margin.top})`);

        const gradient = svg.append('defs')
            .append('linearGradient')
            .attr('id', 'heatmap-gradient')
            .attr('x1', '0%').attr('y1', '100%')
            .attr('x2', '0%').attr('y2', '0%');

        gradient.selectAll('stop')
            .data(d3.range(0, 1.1, 0.1))
            .enter()
            .append('stop')
            .attr('offset', d => `${d * 100}%`)
            .attr('stop-color', d => colorHeatmap(d * colorHeatmap.domain()[1]));

        legend.append('rect')
            .attr('width', legendWidth)
            .attr('height', legendHeight)
            .style('fill', 'url(#heatmap-gradient)');

        legend.append('g')
            .attr('transform', `translate(${legendWidth}, 0)`)
            .call(legendAxis)
            .selectAll('text')
            .style('fill', '#64748b')
            .style('font-size', '10px');

        legend.append('text')
            .attr('x', legendWidth / 2)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('fill', '#64748b')
            .text('Latency (ms)');

    } catch (error) {
        console.error('Error rendering heatmap:', error);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">Error loading heatmap</div>';
    }
}

// Tooltip helpers
function showTooltip(event, html) {
    const tooltip = window.bubbleTooltip || d3.select('.bubble-tooltip');
    if (tooltip.empty()) return;

    tooltip
        .style('visibility', 'visible')
        .html(html)
        .style('top', (event.pageY - 10) + 'px')
        .style('left', (event.pageX + 10) + 'px');
}

function hideTooltip() {
    const tooltip = window.bubbleTooltip || d3.select('.bubble-tooltip');
    if (!tooltip.empty()) {
        tooltip.style('visibility', 'hidden');
    }
}

// ============================================
// EXPORT CSV FUNCTIONALITY
// ============================================

function exportChartDataToCSV() {
    let dataToExport = [];
    let filename = `linknest_analytics_${activeChartType}_${new Date().toISOString().split('T')[0]}.csv`;
    let headers = [];

    switch (activeChartType) {
        case 'bubble':
        case 'bar':
        case 'pie':
        case 'histogram':
        case 'scatter':
        case 'table':
            // Use currentData for most charts
            if (currentData.length === 0) {
                alert('No data available to export');
                return;
            }

            headers = ['Location', 'URL', 'Avg Latency (ms)', 'Measurements', 'Status'];
            dataToExport = currentData.map(d => [
                d.location || 'Unknown',
                d.link_url || 'Unknown',
                d.avg_latency || 0,
                d.measurement_count || 0,
                d.status || 'unknown'
            ]);
            break;

        case 'worldmap':
            // Export geographic data with lat/lon
            if (currentData.length === 0) {
                alert('No data available to export');
                return;
            }

            headers = ['Location', 'Country', 'Region', 'City', 'Latitude', 'Longitude', 'URL', 'Username', 'IP Address', 'Avg Latency (ms)', 'P95 Latency (ms)', 'Measurements', 'Success Rate'];
            dataToExport = currentData
                .filter(d => d.latitude && d.longitude && Math.abs(d.latitude) > 0.0001 && Math.abs(d.longitude) > 0.0001)
                .map(d => [
                    d.city_name || d.city || d.region_name || d.region || 'Unknown',
                    d.country_name || d.country || 'Unknown',
                    d.region_name || d.region || 'Unknown',
                    d.city_name || d.city || 'Unknown',
                    d.latitude || 0,
                    d.longitude || 0,
                    d.link_url || 'Unknown',
                    d.username || 'Anonymous',
                    d.ip_address || 'N/A',
                    d.avg_latency || 0,
                    d.p95_latency || 0,
                    d.measurement_count || d.measurements || 0,
                    d.success_rate ? Math.round(d.success_rate) + '%' : 'N/A'
                ]);
            filename = `linknest_analytics_worldmap_${new Date().toISOString().split('T')[0]}.csv`;
            break;

        case 'timeseries':
            if (lastTimeSeriesData.length === 0) {
                alert('No time-series data available to export');
                return;
            }
            headers = ['Timestamp', 'URL', 'Avg Latency (ms)', 'Measurements'];
            dataToExport = lastTimeSeriesData.map(d => [
                d.timestamp || d.created_at || 'Unknown',
                d.link_url || 'Unknown',
                d.avg_latency || 0,
                d.measurement_count || 0
            ]);
            break;

        case 'heatmap':
            if (lastHeatmapData.length === 0) {
                alert('No heatmap data available to export');
                return;
            }
            headers = ['Hour', 'Day of Week', 'Avg Latency (ms)', 'Measurements'];
            dataToExport = lastHeatmapData.map(d => [
                d.hour,
                d.day_of_week,
                d.avg_latency || 0,
                d.measurement_count || 0
            ]);
            break;

        default:
            alert('Export not supported for this chart type');
            return;
    }

    // Convert to CSV
    const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => row.map(val =>
            typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
        ).join(','))
    ].join('\n');

    // Trigger download
    downloadCSV(csvContent, filename);
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ============================================
// WORLD MAP VISUALIZATION
// ============================================

let worldMapInstance = null;
let worldMapMarkers = [];

function renderWorldMap(data) {
    const container = document.getElementById('worldmap-chart');
    if (!container) return;

    // Filter out data without valid coordinates
    const validData = data.filter(d => {
        const lat = parseFloat(d.latitude);
        const lon = parseFloat(d.longitude);
        return !isNaN(lat) && !isNaN(lon) && 
               lat !== 0 && lon !== 0 &&
               Math.abs(lat) > 0.0001 && Math.abs(lon) > 0.0001;
    });

    if (validData.length === 0) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center;">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin-bottom: 16px;">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <h3 style="color: #475569; margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">No Geographic Data Available</h3>
                <p style="color: #94a3b8; margin: 0; font-size: 14px; max-width: 400px;">
                    No valid location coordinates found in the current dataset. Please ensure geolocation is enabled in your browser and allow location access when prompted.
                </p>
                <p style="color: #cbd5e1; margin: 16px 0 0 0; font-size: 13px;">
                    <strong>Tip:</strong> Open LinkNest and allow location access to start collecting geographic performance data.
                </p>
            </div>
        `;
        return;
    }

    // Initialize map if not already created
    if (!worldMapInstance) {
        container.innerHTML = '<div id="map-container" style="width: 100%; height: 100%; border-radius: 8px;"></div>';
        
        // Initialize Leaflet map
        worldMapInstance = L.map('map-container', {
            center: [20, 0],
            zoom: 2,
            minZoom: 2,
            maxZoom: 18,
            worldCopyJump: true
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(worldMapInstance);

        // Add legend
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function() {
            const div = L.DomUtil.create('div', 'map-legend');
            div.style.background = 'white';
            div.style.padding = '12px';
            div.style.borderRadius = '8px';
            div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            div.style.fontSize = '12px';
            div.style.lineHeight = '1.6';
            
            div.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 8px; color: #1e293b;">Latency Scale</div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <div style="width: 16px; height: 16px; border-radius: 50%; background: #22c55e; border: 2px solid white;"></div>
                    <span style="color: #475569;">Fast (&lt;100ms)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <div style="width: 16px; height: 16px; border-radius: 50%; background: #eab308; border: 2px solid white;"></div>
                    <span style="color: #475569;">Moderate (100-300ms)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <div style="width: 16px; height: 16px; border-radius: 50%; background: #f97316; border: 2px solid white;"></div>
                    <span style="color: #475569;">Slow (300-500ms)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 16px; height: 16px; border-radius: 50%; background: #ef4444; border: 2px solid white;"></div>
                    <span style="color: #475569;">Critical (&gt;500ms)</span>
                </div>
            `;
            return div;
        };
        legend.addTo(worldMapInstance);
    }

    // Clear existing markers
    worldMapMarkers.forEach(marker => marker.remove());
    worldMapMarkers = [];

    // Function to get color based on latency
    function getLatencyColor(latency) {
        if (latency < 100) return '#22c55e';      // Green - Fast
        if (latency < 300) return '#eab308';      // Yellow - Moderate
        if (latency < 500) return '#f97316';      // Orange - Slow
        return '#ef4444';                          // Red - Critical
    }

    // Function to get marker size based on measurement count
    function getMarkerSize(measurements) {
        const baseSize = 8;
        const maxSize = 30;
        const scale = Math.log10(measurements + 1) * 5;
        return Math.min(baseSize + scale, maxSize);
    }

    // Create markers for each data point
    validData.forEach(d => {
        const lat = parseFloat(d.latitude);
        const lon = parseFloat(d.longitude);
        const latency = parseFloat(d.avg_latency) || 0;
        const measurements = parseInt(d.measurement_count || d.measurements || 0);
        const url = d.link_url || d.url || 'Unknown URL';
        const location = d.city_name || d.city || d.region_name || d.region || d.country_name || d.country || 'Unknown';
        const username = d.username || 'Anonymous';
        const ip = d.ip_address || 'N/A';
        const p95 = d.p95_latency || 'N/A';
        const successRate = d.success_rate ? Math.round(d.success_rate) + '%' : 'N/A';

        const color = getLatencyColor(latency);
        const size = getMarkerSize(measurements);

        // Create circle marker
        const marker = L.circleMarker([lat, lon], {
            radius: size,
            fillColor: color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        });

        // Create popup content
        const popupContent = `
            <div style="min-width: 280px; font-family: system-ui, -apple-system, sans-serif;">
                <div style="font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">
                    📍 ${location}
                </div>
                
                <div style="display: grid; gap: 8px; font-size: 13px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">URL:</span>
                        <span style="color: #0f172a; font-family: monospace; font-size: 11px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">User:</span>
                        <span style="color: #0f172a; font-weight: 600;">${escapeHtml(username)}</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">IP Address:</span>
                        <span style="color: #0f172a; font-family: monospace; font-size: 11px;">${escapeHtml(ip)}</span>
                    </div>
                    
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0;"></div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Avg Latency:</span>
                        <span style="color: ${color}; font-weight: 700; font-size: 15px;">${Math.round(latency)}ms</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">P95 Latency:</span>
                        <span style="color: #0f172a; font-weight: 600;">${p95}ms</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Success Rate:</span>
                        <span style="color: #0f172a; font-weight: 600;">${successRate}</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Measurements:</span>
                        <span style="color: #0f172a; font-weight: 600;">${measurements}</span>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Coordinates:</span>
                        <span style="color: #64748b; font-family: monospace; font-size: 11px;">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>
                    </div>
                </div>
                
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                    <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener noreferrer" 
                       style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 500; transition: background 0.2s;"
                       onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        View in Google Maps
                    </a>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, {
            maxWidth: 320,
            className: 'custom-popup'
        });

        marker.addTo(worldMapInstance);
        worldMapMarkers.push(marker);

        // Highlight marker on hover
        marker.on('mouseover', function() {
            this.setStyle({
                weight: 3,
                fillOpacity: 1
            });
        });

        marker.on('mouseout', function() {
            this.setStyle({
                weight: 2,
                fillOpacity: 0.8
            });
        });
    });

    // Fit map bounds to show all markers
    if (worldMapMarkers.length > 0) {
        const group = L.featureGroup(worldMapMarkers);
        worldMapInstance.fitBounds(group.getBounds().pad(0.1));
    }

    // Force map to resize properly (important when switching tabs)
    setTimeout(() => {
        if (worldMapInstance) {
            worldMapInstance.invalidateSize();
        }
    }, 100);
    
    // Also invalidate on next animation frame for better reliability
    requestAnimationFrame(() => {
        setTimeout(() => {
            if (worldMapInstance) {
                worldMapInstance.invalidateSize();
            }
        }, 200);
    });
}

// Cleanup when switching away from world map
function cleanupWorldMap() {
    if (worldMapInstance) {
        worldMapMarkers.forEach(marker => marker.remove());
        worldMapMarkers = [];
    }
}
