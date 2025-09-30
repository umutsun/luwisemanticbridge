document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:8083'; // Updated API port

    // --- Application Configuration ---
    let appConfig = {
        name: 'Alice Semantic Bridge',
        description: 'AI-Powered Knowledge Management System'
    };

    // Load application configuration
    async function loadAppConfig() {
        try {
            const response = await fetch('/config/asb-config.json');
            if (response.ok) {
                const config = await response.json();
                if (config.app) {
                    appConfig = config.app;
                    updateHeaderInfo();
                }
            }
        } catch (error) {
            console.error('Failed to load app config:', error);
            // Use default values
            updateHeaderInfo();
        }
    }

    // Update header with app information
    function updateHeaderInfo() {
        const headerTitle = document.querySelector('.main-header h1');
        const headerDescription = document.querySelector('.header-description');
        
        if (headerTitle) {
            headerTitle.textContent = `🌉 ${appConfig.name} Control Center`;
        }
        
        if (headerDescription) {
            headerDescription.textContent = appConfig.description;
        }
    }

    // --- Element Selections ---
    const apiStatus = document.getElementById('api-status')?.querySelector('.status-indicator');
    const redisStatus = document.getElementById('redis-status')?.querySelector('.status-indicator');
    const n8nStatus = document.getElementById('n8n-status')?.querySelector('.status-indicator');
    const claudeTasks = document.getElementById('claude-tasks');
    const claudeMemory = document.getElementById('claude-memory');
    const geminiTasks = document.getElementById('gemini-tasks');
    const geminiMemory = document.getElementById('gemini-memory');
    const codexTasks = document.getElementById('codex-tasks');
    const codexMemory = document.getElementById('codex-memory');
    const searchLatency = document.getElementById('search-latency');
    const throughput = document.getElementById('throughput');
    const cacheHitRate = document.getElementById('cache-hit-rate');
    const errorRate = document.getElementById('error-rate');
    const workflowList = document.getElementById('workflow-list');
    const redisUsed = document.getElementById('redis-used');
    const redisPeak = document.getElementById('redis-peak');
    const redisKeys = document.getElementById('redis-keys');
    const activityLog = document.getElementById('activity-log');

    // --- Chart.js Initialization ---
    const redisChartCtx = document.getElementById('redis-chart').getContext('2d');
    const redisChart = new Chart(redisChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Redis Memory Usage (MB)',
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 1
            }]
        },
        options: { scales: { y: { beginAtZero: true } } }
    });

    // --- Main Data Fetching and UI Update Logic ---
    async function fetchAndUpdateDashboard() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/analytics/metrics`);
            if (!response.ok) {
                throw new Error(`API responded with status ${response.status}`);
            }
            const data = await response.json();

            // --- Data Adapter ---
            // Convert new API data structure to the format the old UI functions expect
            const adaptedData = {
                api: 'active',
                redis: data.cache ? 'active' : 'inactive',
                n8n: 'checking', // This info is not in the new API, so we set a default
                agents: {
                    // Mocking agent data as it's not in the new API
                    claude: { tasks: data.lightrag.entities || 0, memory: 'N/A' },
                    gemini: { tasks: data.lightrag.relationships || 0, memory: 'N/A' },
                    codex: { tasks: 0, memory: 'N/A' }
                },
                performance: {
                    searchLatency: parseFloat(data.performance.avgResponseTime) || 0,
                    throughput: 0, // Not available in new API
                    cacheHitRate: ((data.cache.hits / (data.cache.hits + data.cache.misses || 1)) * 100).toFixed(1),
                    errorRate: (100 - parseFloat(data.performance.successRate)).toFixed(1)
                },
                workflows: [
                    { name: 'LightRAG Service', status: data.lightrag.status }
                ],
                redis_stats: {
                    used: (data.cache.size / (1024*1024)).toFixed(2), // Assuming size is in bytes
                    peak: 'N/A',
                    keys: data.cache.size
                }
            };

            // --- UI Updates ---
            updateStatus(apiStatus, adaptedData.api);
            updateStatus(redisStatus, adaptedData.redis);
            updateStatus(n8nStatus, adaptedData.n8n);
            updateAgent(adaptedData.agents.claude, claudeTasks, claudeMemory);
            updateAgent(adaptedData.agents.gemini, geminiTasks, geminiMemory);
            updateAgent(adaptedData.agents.codex, codexTasks, codexMemory);
            updatePerformance(adaptedData.performance);
            updateWorkflows(adaptedData.workflows);
            updateRedis(adaptedData.redis_stats);
            
            addLogEntry({ timestamp: new Date(), message: 'Successfully fetched and updated metrics.' });

        } catch (error) {
            console.error('Failed to fetch status:', error);
            updateStatus(apiStatus, 'inactive');
            updateStatus(redisStatus, 'inactive');
            addLogEntry({ timestamp: new Date(), message: `Failed to fetch metrics: ${error.message}` });
        }
    }

    // --- Helper Functions (unchanged but kept for UI rendering) ---
    function updateStatus(element, status) {
        if (!element) return;
        element.className = `status-indicator ${status}`;
        element.textContent = status === 'active' ? 'Online' : status === 'inactive' ? 'Offline' : 'Checking...';
    }

    function updateAgent(agent, tasksElement, memoryElement) {
        if (!agent || !tasksElement || !memoryElement) return;
        tasksElement.textContent = agent.tasks;
        memoryElement.textContent = `${agent.memory}`;
    }

    function updatePerformance(performance) {
        if (searchLatency) searchLatency.textContent = `${performance.searchLatency}ms`;
        if (throughput) throughput.textContent = `${performance.throughput}/s`;
        if (cacheHitRate) cacheHitRate.textContent = `${performance.cacheHitRate}%`;
        if (errorRate) errorRate.textContent = `${performance.errorRate}%`;
    }

    function updateWorkflows(workflows) {
        if (!workflowList) return;
        workflowList.innerHTML = '';
        workflows.forEach(workflow => {
            const item = document.createElement('div');
            item.className = 'workflow-item';
            item.innerHTML = `<span class="workflow-name">${workflow.name}</span><span class="workflow-status ${workflow.status}">${workflow.status}</span>`;
            workflowList.appendChild(item);
        });
    }

    function updateRedis(redis) {
        if (redisUsed) redisUsed.textContent = `${redis.used}MB`;
        if (redisPeak) redisPeak.textContent = `${redis.peak}`;
        if (redisKeys) redisKeys.textContent = redis.keys;

        redisChart.data.labels.push(new Date().toLocaleTimeString());
        redisChart.data.datasets[0].data.push(redis.used);
        if (redisChart.data.labels.length > 20) {
            redisChart.data.labels.shift();
            redisChart.data.datasets[0].data.shift();
        }
        redisChart.update();
    }

    function addLogEntry(entry) {
        if (!activityLog) return;
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `<span class="log-timestamp">${new Date(entry.timestamp).toLocaleTimeString()}</span><span class="log-message">${entry.message}</span>`;
        activityLog.appendChild(item);
        activityLog.scrollTop = activityLog.scrollHeight;
        
        while (activityLog.children.length > 50) {
            activityLog.removeChild(activityLog.firstChild);
        }
    }

    // --- Initial Load and Periodic Refresh ---
    addLogEntry({ timestamp: new Date(), message: 'Dashboard initialized. Fetching data...' });
    
    // Load application configuration first
    loadAppConfig().then(() => {
        fetchAndUpdateDashboard(); // Initial fetch after config is loaded
    });
    
    setInterval(fetchAndUpdateDashboard, 5000); // Refresh every 5 seconds
});

// --- Control Panel Functions (unchanged but pointing to new API) ---
const API_BASE_URL = 'http://localhost:8083';

function deployToProduction() {
    console.log('Deploying to production...');
    alert('Deployment feature coming soon!');
}

function runTests() {
    console.log('Running tests...');
    alert('Test functionality should be triggered from the new API.');
}

function clearCache() {
    console.log('Clearing cache...');
    if (confirm('Are you sure you want to clear the cache? This is not yet implemented in the new API.')) {
        // Example of how it would be implemented:
        // fetch(`${API_BASE_URL}/api/cache/clear`, { method: 'POST' })
        //     .then(res => res.json())
        //     .then(data => alert('Cache cleared successfully!'))
        //     .catch(err => alert('Cache clear feature not yet implemented'));
        alert('Cache clear feature not yet implemented');
    }
}

function refreshStatus() {
    console.log('Refreshing status...');
    location.reload();
}