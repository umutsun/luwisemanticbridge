// Dashboard Internationalization System
const translations = {
  tr: {
    title: "ASB Kontrol Merkezi",
    description: "AI Destekli Bilgi Yönetim Sistemi",
    system: "Sistem",
    api: "API",
    redis: "Redis",
    n8n: "n8n",
    status: {
      online: "Çevrimiçi",
      offline: "Çevrimdışı",
      checking: "Kontrol Ediliyor..."
    },
    tabs: {
      overview: "📊 Genel Bakış",
      lightrag: "🧠 Bilgi Grafiği",
      agents: "🤖 Ajanlar",
      workflows: "🔄 İş Akışları"
    },
    sections: {
      projectOverview: "📁 Proje Genel Bakışı",
      agentStatus: "🤖 Ajan Durumu",
      performanceMetrics: "Performans Metrikleri",
      workflowStatus: "🔄 n8n İş Akışı Durumu",
      redisMonitor: "💾 Redis Bellek Monitörü",
      activityLog: "📜 Aktivite Günlüğü",
      controlPanel: "🎮 Kontrol Paneli"
    },
    labels: {
      currentProject: "Mevcut Proje",
      version: "Versiyon",
      environment: "Ortam",
      tasks: "Görevler",
      memory: "Bellek",
      used: "Kullanılan",
      peak: "Zirve",
      keys: "Anahtarlar",
      lastUpdated: "Son Güncelleme",
      totalPages: "Toplam Sayfa",
      totalSize: "Toplam Boyut",
      totalChunks: "Toplam Parça",
      successRate: "Başarı Oranı",
      searchPlaceholder: "Ara...",
      noPages: "Henüz taranmış sayfa yok",
      noHistory: "Henüz geçmiş kaydı yok"
    },
    buttons: {
      deploy: "🚀 Üretime Al",
      runTests: "🧪 Testleri Çalıştır",
      clearCache: "🗑️ Önbelleği Temizle",
      refresh: "🔄 Durumu Yenile"
    },
    messages: {
      dashboardInitialized: "Dashboard başlatıldı. Veriler getiriliyor...",
      successfullyFetched: "Metrikler başarıyla getirildi ve güncellendi.",
      failedToFetch: "Durum getirilemedi",
      deploymentComingSoon: "Deployment özelliği yakında gelecek!",
      testFunctionality: "Test fonksiyonu yeni API'den tetiklenmeli.",
      cacheClearConfirm: "Önbelleği temizlemek istediğinizden emin misiniz? Bu henüz yeni API'de uygulanmadı.",
      cacheClearNotImplemented: "Önbelleği temizleme özelliği henüz uygulanmadı",
      enterUrl: "Lütfen bir URL girin",
      validUrl: "Lütfen geçerli bir URL girin",
      scrapeSuccess: "Başarıyla tarandı: {{title}}",
      scrapeFailed: "Tarama başarısız oldu",
      networkError: "Ağ hatası",
      copied: "Panoya kopyalandı",
      pageDeleted: "Sayfa silindi",
      pageDeleteFailed: "Sayfa silinemedi",
      historyDeleted: "Geçmiş kaydı silindi",
      historyDeleteFailed: "Kayıt silinemedi",
      historyCleared: "Geçmiş temizlendi",
      historyClearFailed: "Geçmiş temizlenemedi",
      confirmClearHistory: "Tüm geçmiş kayıtları silinecek. Emin misiniz?",
      pageLoadFailed: "Sayfalar yüklenemedi"
    },
    errors: {
      settingsNotSaved: "Ayarlar kaydedilemedi. Lütfen tekrar deneyin.",
      connectionError: "Bağlantı hatası"
    }
  },
  en: {
    title: "ASB Control Center",
    description: "AI-Powered Knowledge Management System",
    system: "System",
    api: "API",
    redis: "Redis",
    n8n: "n8n",
    status: {
      online: "Online",
      offline: "Offline",
      checking: "Checking..."
    },
    tabs: {
      overview: "📊 Overview",
      lightrag: "🧠 Knowledge Graph",
      agents: "🤖 Agents",
      workflows: "🔄 Workflows"
    },
    sections: {
      projectOverview: "📁 Project Overview",
      agentStatus: "🤖 Agent Status",
      performanceMetrics: "Performance Metrics",
      workflowStatus: "🔄 n8n Workflow Status",
      redisMonitor: "💾 Redis Memory Monitor",
      activityLog: "📜 Activity Log",
      controlPanel: "🎮 Control Panel"
    },
    labels: {
      currentProject: "Current Project",
      version: "Version",
      environment: "Environment",
      tasks: "Tasks",
      memory: "Memory",
      used: "Used",
      peak: "Peak",
      keys: "Keys",
      lastUpdated: "Last Updated",
      totalPages: "Total Pages",
      totalSize: "Total Size",
      totalChunks: "Total Chunks",
      successRate: "Success Rate",
      searchPlaceholder: "Search...",
      noPages: "No pages scraped yet",
      noHistory: "No history yet"
    },
    buttons: {
      deploy: "🚀 Deploy to Production",
      runTests: "🧪 Run Tests",
      clearCache: "🗑️ Clear Cache",
      refresh: "🔄 Refresh Status"
    },
    messages: {
      dashboardInitialized: "Dashboard initialized. Fetching data...",
      successfullyFetched: "Successfully fetched and updated metrics.",
      failedToFetch: "Failed to fetch status",
      deploymentComingSoon: "Deployment feature coming soon!",
      testFunctionality: "Test functionality should be triggered from the new API.",
      cacheClearConfirm: "Are you sure you want to clear the cache? This is not yet implemented in the new API.",
      cacheClearNotImplemented: "Cache clear feature not yet implemented",
      enterUrl: "Please enter a URL",
      validUrl: "Please enter a valid URL",
      scrapeSuccess: "Successfully scraped: {{title}}",
      scrapeFailed: "Scraping failed",
      networkError: "Network error",
      copied: "Copied to clipboard",
      pageDeleted: "Page deleted",
      pageDeleteFailed: "Failed to delete page",
      historyDeleted: "History entry deleted",
      historyDeleteFailed: "Failed to delete entry",
      historyCleared: "History cleared",
      historyClearFailed: "Failed to clear history",
      confirmClearHistory: "All history records will be deleted. Are you sure?",
      pageLoadFailed: "Failed to load pages"
    },
    errors: {
      settingsNotSaved: "Settings could not be saved. Please try again.",
      connectionError: "Connection error"
    }
  }
};

// Language detection and management
class DashboardI18n {
  constructor() {
    this.currentLanguage = this.detectLanguage();
    this.translations = translations;
  }

  detectLanguage() {
    // Check URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam && translations[langParam]) {
      return langParam;
    }

    // Check browser language
    const browserLang = navigator.language.split('-')[0];
    if (translations[browserLang]) {
      return browserLang;
    }

    // Check localStorage
    const savedLang = localStorage.getItem('dashboard-language');
    if (savedLang && translations[savedLang]) {
      return savedLang;
    }

    // Default to Turkish
    return 'tr';
  }

  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLanguage = lang;
      localStorage.setItem('dashboard-language', lang);
      this.updateUI();
      this.updateHTMLLang();
    }
  }

  getCurrentLanguage() {
    return this.currentLanguage;
  }

  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations[this.currentLanguage];
    
    for (const k of keys) {
      if (value && value[k]) {
        value = value[k];
      } else {
        // Fallback to English
        value = this.translations.en;
        for (const k of keys) {
          if (value && value[k]) {
            value = value[k];
          } else {
            return key; // Return key if translation not found
          }
        }
        break;
      }
    }

    if (typeof value === 'string') {
      // Replace parameters
      return value.replace(/\{\{(\w+)\}\}/g, (match, param) => params[param] || match);
    }

    return value;
  }

  updateHTMLLang() {
    document.documentElement.lang = this.currentLanguage;
    document.documentElement.setAttribute('data-lang', this.currentLanguage);
  }

  updateUI() {
    // Update title
    const titleElement = document.querySelector('.main-header h1');
    if (titleElement) {
      titleElement.textContent = `🌉 ${this.t('title')} Control Center`;
    }

    // Update description
    const descriptionElement = document.querySelector('.header-description');
    if (descriptionElement) {
      descriptionElement.textContent = this.t('description');
    }

    // Update status labels
    document.querySelectorAll('.status-item').forEach(item => {
      const text = item.textContent;
      if (text.includes('System:')) item.innerHTML = `${this.t('system')}: <span class="status-indicator active">Online</span>`;
      if (text.includes('API:')) item.innerHTML = `${this.t('api')}: <span class="status-indicator">Checking...</span>`;
      if (text.includes('Redis:')) item.innerHTML = `${this.t('redis')}: <span class="status-indicator">Checking...</span>`;
      if (text.includes('n8n:')) item.innerHTML = `${this.t('n8n')}: <span class="status-indicator">Checking...</span>`;
    });

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach((btn, index) => {
      const tabKeys = ['overview', 'lightrag', 'agents', 'workflows'];
      if (tabKeys[index]) {
        btn.textContent = this.t(`tabs.${tabKeys[index]}`);
      }
    });

    // Update section headers
    const sectionMappings = {
      'Project Overview': 'sections.projectOverview',
      'Agent Status': 'sections.agentStatus',
      'Performance Metrics': 'sections.performanceMetrics',
      'n8n Workflow Status': 'sections.workflowStatus',
      'Redis Memory Monitor': 'sections.redisMonitor',
      'Activity Log': 'sections.activityLog',
      'Control Panel': 'sections.controlPanel'
    };

    Object.entries(sectionMappings).forEach(([english, key]) => {
      const elements = document.querySelectorAll(`h2:contains("${english}")`);
      elements.forEach(el => {
        el.textContent = this.t(key);
      });
    });

    // Update control panel buttons
    const buttonMappings = {
      'Deploy to Production': 'buttons.deploy',
      'Run Tests': 'buttons.runTests',
      'Clear Cache': 'buttons.clearCache',
      'Refresh Status': 'buttons.refresh'
    };

    Object.entries(buttonMappings).forEach(([english, key]) => {
      const buttons = document.querySelectorAll(`button:contains("${english}")`);
      buttons.forEach(btn => {
        btn.textContent = this.t(key);
      });
    });
  }

  // Initialize language selector
  initLanguageSelector() {
    const selector = document.getElementById('language-selector');
    if (selector) {
      selector.value = this.currentLanguage;
      selector.addEventListener('change', (e) => {
        this.setLanguage(e.target.value);
      });
    }
  }

  // Create language selector
  createLanguageSelector() {
    const existingSelector = document.getElementById('language-selector');
    if (existingSelector) return;

    const selector = document.createElement('select');
    selector.id = 'language-selector';
    selector.className = 'language-selector';
    
    Object.keys(translations).forEach(lang => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = lang === 'tr' ? 'Türkçe' : 'English';
      selector.appendChild(option);
    });

    selector.value = this.currentLanguage;
    selector.addEventListener('change', (e) => {
      this.setLanguage(e.target.value);
    });

    return selector;
  }
}

// Create global instance
window.dashboardI18n = new DashboardI18n();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DashboardI18n;
}