/**
 * Performance Analytics Dashboard - Animated Bubble Chart
 * Using D3.js Force Simulation for crypto-bubbles style visualization
 */

// Configuration
const API_BASE = '/api/performance';
const QUEUE_STATUS_URL = '/api/metrics/queue-status';
let bubbleSimulation = null;
let currentData = [];
let currentView = 'bubbles'; // 'bubbles' | 'table'

// Color scale for latency (green = fast, red = slow)
const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
    .domain([500, 0]); // 500ms = red, 0ms = green

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Initialize bubble chart first
    initBubbleChart();

    // Small delay to ensure DOM is fully ready
    setTimeout(() => {
        loadFilters();
        refreshData();
    }, 100);

    // Event listeners
    document.getElementById('refresh-btn').addEventListener('click', refreshData);
    document.getElementById('url-filter').addEventListener('change', refreshData);
    document.getElementById('granularity-filter').addEventListener('change', refreshData);

    // View toggle (bubble/table)
    const bubblesBtn = document.getElementById('view-bubbles');
    const tableBtn = document.getElementById('view-table');
    if (bubblesBtn && tableBtn) {
        bubblesBtn.addEventListener('click', () => setView('bubbles'));
        tableBtn.addEventListener('click', () => setView('table'));
    }

    // Reload filters when period or measurement type changes
    document.getElementById('period-filter').addEventListener('change', async () => {
        await loadFilters();
        refreshData();
    });
    document.getElementById('measurement-filter').addEventListener('change', async () => {
        await loadFilters();
        refreshData();
    });

    // Auto-refresh every 30 seconds
    setInterval(refreshData, 30000);
});

function setView(view) {
    currentView = view === 'table' ? 'table' : 'bubbles';
    const chartEl = document.getElementById('bubble-chart');
    const tableContainer = document.getElementById('bubble-table-container');
    const bubblesBtn = document.getElementById('view-bubbles');
    const tableBtn = document.getElementById('view-table');

    if (!chartEl || !tableContainer || !bubblesBtn || !tableBtn) return;

    if (currentView === 'table') {
        chartEl.classList.add('is-hidden');
        tableContainer.classList.remove('is-hidden');
        tableContainer.setAttribute('aria-hidden', 'false');
        bubblesBtn.classList.remove('is-active');
        bubblesBtn.setAttribute('aria-selected', 'false');
        tableBtn.classList.add('is-active');
        tableBtn.setAttribute('aria-selected', 'true');
        renderBubbleTable(currentData);
    } else {
        chartEl.classList.remove('is-hidden');
        tableContainer.classList.add('is-hidden');
        tableContainer.setAttribute('aria-hidden', 'true');
        tableBtn.classList.remove('is-active');
        tableBtn.setAttribute('aria-selected', 'false');
        bubblesBtn.classList.add('is-active');
        bubblesBtn.setAttribute('aria-selected', 'true');
        // Bubble chart already rendered by loadBubbleData
    }
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
        tbody.innerHTML = '<tr><td colspan="13" class="text-center">No data yet</td></tr>';
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

        return `
            <tr>
                <td>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div><strong>${escapeHtml(label)}</strong></div>
                        <div class="text-muted mono">${escapeHtml(item.url || '')}</div>
                    </div>
                </td>
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

        // Fetch real URLs from API
        const response = await fetch(`${API_BASE}/urls?period=${period}&type=${measurementType}`);

        if (!response.ok) {
            console.warn('Failed to load URL filters');
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
        console.log(`Loaded ${data.urls.length} URLs into filter`);

    } catch (error) {
        console.error('Failed to load filters:', error);
        document.getElementById('url-filter').innerHTML = '<option value="">All URLs</option>';
    }
}

// Refresh all dashboard data
async function refreshData() {
    const btn = document.getElementById('refresh-btn');
    btn.textContent = 'Loading...';
    btn.disabled = true;

    try {
        // Load bubble data first (populates currentData)
        await loadBubbleData();

        // Then load other components that depend on currentData
        await Promise.all([
            loadStats(),
            loadComparisonTable(),
            loadAlerts(),
            loadQueueStatus()
        ]);

        // Render all new charts
        if (currentData.length > 0) {
            renderBarChart(currentData);
            renderPieChart(currentData);
            renderHistogram(currentData);
            renderScatterPlot(currentData);
        }

        // Render async charts (that fetch their own data)
        await Promise.all([
            renderTimeSeriesChart(),
            renderHeatmap()
        ]);
    } catch (error) {
        console.error('Failed to refresh data:', error);
    } finally {
        btn.textContent = 'Refresh Data';
        btn.disabled = false;
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

        console.log('Initializing bubble chart:', { width, height });

        // Clear existing
        container.innerHTML = '';

        // Remove old tooltip if exists
        d3.selectAll('.bubble-tooltip').remove();

        // Create SVG
        const svg = d3.select('#bubble-chart')
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('background', 'transparent');

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

        // Update stat label based on granularity
        const statLabel = document.getElementById('stat-label-items');
        if (statLabel) {
            const labels = {
                'url': 'Total URLs',
                'country': 'Total Countries',
                'region': 'Total Regions',
                'city': 'Total Cities'
            };
            statLabel.textContent = labels[granularity] || 'Total Items';
        }

        // Build query parameters
        const params = new URLSearchParams({
            period: period,
            granularity: granularity,
            type: measurementType
        });

        if (urlFilter) {
            params.append('url', urlFilter);
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
        renderBubbles(currentData);

        if (currentView === 'table') {
            renderBubbleTable(currentData);
        }

    } catch (error) {
        console.error('Error loading bubble data:', error);
        currentData = [];
        renderBubbles([]);
        if (currentView === 'table') {
            renderBubbleTable([]);
        }
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
                    <strong>${d.region}</strong><br/>
                    Latency: ${d.latency}ms · Measurements: ${d.measurements.toLocaleString()}
                `);
        })
        .on('mousemove', function (event) {
            tooltip
                .style('top', (event.pageY - 10) + 'px')
                .style('left', (event.pageX + 10) + 'px');
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
async function renderTimeSeriesChart() {
    const container = document.getElementById('timeseries-chart');
    if (!container) return;

    container.innerHTML = '';

    try {
        const period = document.getElementById('period-filter').value;
        const measurementType = document.getElementById('measurement-filter').value;
        const urlFilter = document.getElementById('url-filter').value;

        const params = new URLSearchParams({
            period: period,
            type: measurementType
        });

        if (urlFilter) params.append('url', urlFilter);

        // Fetch time series data
        const response = await fetch(`${API_BASE}/timeseries?${params}`);
        if (!response.ok) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No time series data available</div>';
            return;
        }

        const result = await response.json();
        const data = result.data || [];

        if (data.length === 0) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No time series data available</div>';
            return;
        }

        // Parse dates and sort
        const timeData = data.map(d => ({
            date: new Date(d.time_bucket || d.timestamp),
            avgLatency: parseFloat(d.avg_latency) || 0,
            p95: parseFloat(d.p95) || 0,
            measurements: parseInt(d.measurement_count) || 0
        })).sort((a, b) => a.date - b.date);

        const width = container.clientWidth;
        const height = container.clientHeight;
        const margin = { top: 20, right: 80, bottom: 50, left: 60 };

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(timeData, d => d.date))
            .range([0, innerWidth]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(timeData, d => Math.max(d.avgLatency, d.p95)) * 1.1])
            .range([innerHeight, 0]);

        // Axes
        const xAxis = d3.axisBottom(xScale).ticks(6);
        const yAxis = d3.axisLeft(yScale).ticks(6);

        g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis)
            .selectAll('text')
            .style('fill', '#64748b')
            .style('font-size', '12px');

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

        // Line generators
        const avgLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.avgLatency))
            .curve(d3.curveMonotoneX);

        const p95Line = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.p95))
            .curve(d3.curveMonotoneX);

        // Draw lines
        g.append('path')
            .datum(timeData)
            .attr('fill', 'none')
            .attr('stroke', '#4f46e5')
            .attr('stroke-width', 3)
            .attr('d', avgLine);

        g.append('path')
            .datum(timeData)
            .attr('fill', 'none')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('d', p95Line);

        // Add dots
        g.selectAll('.dot-avg')
            .data(timeData)
            .enter()
            .append('circle')
            .attr('class', 'dot-avg')
            .attr('cx', d => xScale(d.date))
            .attr('cy', d => yScale(d.avgLatency))
            .attr('r', 4)
            .attr('fill', '#4f46e5')
            .style('cursor', 'pointer')
            .on('mouseover', function (event, d) {
                d3.select(this).attr('r', 6);
                showTooltip(event, `<strong>${d.date.toLocaleString()}</strong><br/>Avg: ${d.avgLatency}ms<br/>Measurements: ${d.measurements}`);
            })
            .on('mouseout', function () {
                d3.select(this).attr('r', 4);
                hideTooltip();
            });

        // Legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`);

        legend.append('line')
            .attr('x1', 0).attr('x2', 20)
            .attr('y1', 0).attr('y2', 0)
            .attr('stroke', '#4f46e5')
            .attr('stroke-width', 3);

        legend.append('text')
            .attr('x', 25).attr('y', 4)
            .style('font-size', '12px')
            .style('fill', '#334155')
            .text('Avg');

        legend.append('line')
            .attr('x1', 0).attr('x2', 20)
            .attr('y1', 20).attr('y2', 20)
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');

        legend.append('text')
            .attr('x', 25).attr('y', 24)
            .style('font-size', '12px')
            .style('fill', '#334155')
            .text('P95');

        // Y-axis label
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 15)
            .attr('x', -(height / 2))
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#64748b')
            .text('Latency (ms)');

    } catch (error) {
        console.error('Error rendering time series chart:', error);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">Error loading chart</div>';
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
            const value = barSortMode === 'volume' ? `${d.measurements.toLocaleString()} measurements` : `${d.latency}ms`;
            showTooltip(event, `<strong>${d.region}</strong><br/>${value}`);
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
            showTooltip(event, `<strong>${d.region}</strong><br/>Latency: ${d.latency}ms<br/>Measurements: ${d.measurements.toLocaleString()}`);
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
async function renderHeatmap() {
    const container = document.getElementById('heatmap-chart');
    if (!container) return;

    container.innerHTML = '';

    try {
        const period = document.getElementById('period-filter').value;
        const measurementType = document.getElementById('measurement-filter').value;
        const urlFilter = document.getElementById('url-filter').value;

        const params = new URLSearchParams({
            period: period,
            type: measurementType
        });

        if (urlFilter) params.append('url', urlFilter);

        // Fetch heatmap data
        const response = await fetch(`${API_BASE}/heatmap?${params}`);
        if (!response.ok) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No heatmap data available</div>';
            return;
        }

        const result = await response.json();
        const data = result.data || [];

        if (data.length === 0) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">No heatmap data available</div>';
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
