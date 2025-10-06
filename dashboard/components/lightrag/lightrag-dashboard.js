class RAGDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container with id #${containerId} not found.`);
      return;
    }
    this.apiBase = '/api/v2';
    this.selectedEngine = 'lightrag'; // 'lightrag' or 'rag-anything'
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();
    this.loadStats();
  }

  render() {
    this.container.innerHTML = `
      <div class="rag-dashboard">
        <div class="rag-header">
          <h2>RAG Management Dashboard</h2>
          <div class="rag-stats" id="rag-stats">
            <span class="stat-item">Loading stats...</span>
          </div>
        </div>
        
        <div class="rag-query-area">
          <div class="engine-selector">
            <label for="rag-engine">Active Engine:</label>
            <select id="rag-engine">
              <option value="lightrag" selected>LightRAG (Local)</option>
              <option value="rag-anything">RAG-anything (Python)</option>
            </select>
          </div>
          <textarea id="rag-query" placeholder="Ask a question..."></textarea>
          <div class="query-controls">
            <button id="rag-submit-query">
              <span class="btn-text">Submit Query</span>
              <span class="spinner" style="display: none;"></span>
            </button>
            <button id="manage-docs-btn">Manage Documents</button>
          </div>
          <details class="advanced-options">
            <summary>Advanced Options</summary>
            <div class="options-content">
              <label for="rag-temperature">RAG Temperature:</label>
              <input type="range" id="rag-temperature" min="0" max="1" step="0.1" value="0.3">
              <span id="temp-value">0.3</span>
              <small class="text-gray-500">Temperature for RAG queries only</small>
            </div>
          </details>
        </div>

        <div class="rag-response-area">
          <h3>Answer</h3>
          <div id="rag-answer" class="response-box"></div>
          <h3>Sources</h3>
          <div id="rag-sources" class="response-box"></div>
        </div>
        
        <div id="error-banner" class="error-banner" style="display: none;"></div>
      </div>

      <!-- Document Management Modal -->
      <div id="docs-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>Document Management (<span id="modal-engine-name"></span>)</h3>
          <div class="modal-body">
            <h4>Add New Document</h4>
            <input type="text" id="doc-title" placeholder="Document Title">
            <textarea id="doc-content" placeholder="Document content..." rows="5"></textarea>
            <button id="add-doc-btn">Add Document</button>
            <hr>
            <h4>Existing Documents</h4>
            <ul id="docs-list"><li>Loading...</li></ul>
          </div>
          <div class="modal-footer">
            <button id="close-modal-btn">Close</button>
          </div>
        </div>
      </div>
      <style>${this.getStyles()}</style>
    `;
  }

  attachEventListeners() {
    document.getElementById('rag-engine').addEventListener('change', (e) => {
      this.selectedEngine = e.target.value;
      this.loadStats();
    });

    document.getElementById('rag-submit-query').addEventListener('click', () => this.submitQuery());
    document.getElementById('manage-docs-btn').addEventListener('click', () => this.openDocsModal());
    document.getElementById('close-modal-btn').addEventListener('click', () => this.closeDocsModal());
    document.getElementById('add-doc-btn').addEventListener('click', () => this.addDocument());
    
    const tempSlider = document.getElementById('rag-temperature');
    const tempValue = document.getElementById('temp-value');
    tempSlider.addEventListener('input', () => {
      tempValue.textContent = tempSlider.value;
    });
  }

  async fetchApi(endpoint, options = {}) {
    const url = `${this.apiBase}/${this.selectedEngine}${endpoint}`;
    const button = document.getElementById('rag-submit-query');
    const spinner = button.querySelector('.spinner');
    const btnText = button.querySelector('.btn-text');
    const errorBanner = document.getElementById('error-banner');
    
    spinner.style.display = 'inline-block';
    btnText.style.display = 'none';
    errorBanner.style.display = 'none';

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          ...options.headers,
        },
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      errorBanner.textContent = `Error: ${error.message}`;
      errorBanner.style.display = 'block';
      return null;
    } finally {
      spinner.style.display = 'none';
      btnText.style.display = 'inline-block';
    }
  }

  async loadStats() {
    const statsEl = document.getElementById('rag-stats');
    statsEl.innerHTML = '<span class="stat-item">Loading stats...</span>';
    const data = await this.fetchApi('/stats');
    if (data) {
      statsEl.innerHTML = `
        <span class="stat-item"><strong>Status:</strong> ${data.initialized ? 'Initialized' : 'Not Initialized'}</span>
        <span class="stat-item"><strong>Documents:</strong> ${data.documentCount || 0}</span>
        <span class="stat-item"><strong>Provider:</strong> ${data.provider || 'N/A'}</span>
      `;
    } else {
      statsEl.innerHTML = '<span class="stat-item">Failed to load stats.</span>';
    }
  }

  async submitQuery() {
    const query = document.getElementById('rag-query').value;
    if (!query) return;

    const temperature = parseFloat(document.getElementById('rag-temperature').value);
    const answerEl = document.getElementById('rag-answer');
    const sourcesEl = document.getElementById('rag-sources');
    
    answerEl.textContent = 'Thinking...';
    sourcesEl.innerHTML = '';

    const data = await this.fetchApi('/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, temperature })
    });

    if (data) {
      answerEl.textContent = data.answer;
      sourcesEl.innerHTML = data.sources.map(s => `
        <div class="source-item">
          <strong>${s.title} (Score: ${s.score || 'N/A'})</strong>
          <p>${s.content}</p>
        </div>
      `).join('');
    } else {
      answerEl.textContent = 'Query failed. Check the error banner above.';
    }
  }

  async openDocsModal() {
    document.getElementById('modal-engine-name').textContent = this.selectedEngine;
    document.getElementById('docs-modal').style.display = 'flex';
    this.loadDocuments();
  }

  closeDocsModal() {
    document.getElementById('docs-modal').style.display = 'none';
  }

  async loadDocuments() {
    const listEl = document.getElementById('docs-list');
    listEl.innerHTML = '<li>Loading...</li>';
    const data = await this.fetchApi('/documents');
    if (data && Array.isArray(data)) {
      if (data.length === 0) {
        listEl.innerHTML = '<li>No documents found.</li>';
        return;
      }
      listEl.innerHTML = data.map(doc => `
        <li>
          <span>${doc.title} (ID: ${doc.id})</span>
          <button class="delete-btn" data-id="${doc.id}">Delete</button>
        </li>
      `).join('');
      
      listEl.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => this.deleteDocument(e.target.dataset.id));
      });
    } else {
      listEl.innerHTML = '<li>Failed to load documents.</li>';
    }
  }

  async addDocument() {
    const title = document.getElementById('doc-title').value;
    const content = document.getElementById('doc-content').value;
    if (!title || !content) {
      alert('Title and content are required.');
      return;
    }

    const documents = [{ title, content }];
    const data = await this.fetchApi('/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents })
    });

    if (data && data.success) {
      document.getElementById('doc-title').value = '';
      document.getElementById('doc-content').value = '';
      this.loadDocuments();
      this.loadStats(); // Refresh stats after adding
    } else {
      alert('Failed to add document.');
    }
  }

  async deleteDocument(id) {
    if (!confirm(`Are you sure you want to delete document ${id}?`)) return;

    const data = await this.fetchApi(`/documents/${id}`, { method: 'DELETE' });
    if (data && data.success) {
      this.loadDocuments();
      this.loadStats(); // Refresh stats after deleting
    } else {
      alert('Failed to delete document.');
    }
  }

  getStyles() {
    return `
      .rag-dashboard { padding: 20px; background: #f8f9fa; font-family: sans-serif; }
      .rag-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .rag-stats { display: flex; gap: 15px; }
      .stat-item { background: white; padding: 8px 12px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 14px; }
      .rag-query-area { background: white; padding: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .engine-selector { margin-bottom: 15px; }
      #rag-query { width: 100%; height: 80px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px; box-sizing: border-box; }
      .query-controls { display: flex; gap: 10px; margin-bottom: 10px; }
      #rag-submit-query, #manage-docs-btn { padding: 10px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; position: relative; }
      #rag-submit-query:hover { background: #0056b3; }
      .advanced-options summary { cursor: pointer; }
      .options-content { margin-top: 10px; }
      .rag-response-area { margin-top: 20px; }
      .response-box { background: white; padding: 15px; border-radius: 5px; min-height: 50px; margin-top: 10px; white-space: pre-wrap; }
      .source-item { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
      .source-item:last-child { border-bottom: none; }
      .error-banner { background: #dc3545; color: white; padding: 10px; border-radius: 5px; margin-top: 15px; }
      .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .modal-content { background: white; padding: 20px; border-radius: 8px; width: 600px; max-width: 90%; }
      .modal-body input, .modal-body textarea { width: 100%; padding: 8px; margin-bottom: 10px; box-sizing: border-box; }
      .modal-footer { text-align: right; margin-top: 20px; }
      #docs-list { list-style: none; padding: 0; max-height: 200px; overflow-y: auto; }
      #docs-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee; }
      .delete-btn { background: #dc3545; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px; }
    `;
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lightrag-container')) {
      new RAGDashboard('lightrag-container');
    }
  });
}
