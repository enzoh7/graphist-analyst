// ========== NEWS ÉCONOMIQUES MANAGER ==========
// Gère l'affichage des news économiques depuis des sources réelles

export interface EconomicNews {
  date: string;
  time: string;
  timestamp: number;
  title: string;
  country: string;
  countryCode: string;
  impact: 'high' | 'medium' | 'low';
  forecast: string;
  previous: string;
  actual: string;
}

class NewsManager {
  private newsOverlay: HTMLElement | null = null;
  private newsButton: HTMLElement | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private readonly FINNHUB_API_KEY = 'cuchkbd1r5pbou40l3eg'; // Clé API gratuite
  private newsHistory: EconomicNews[] = []; // Historique des news
  private readonly MAX_DAYS = 7; // Garder max 7 jours d'historique
  private readonly STORAGE_KEY = 'graphist_news_history'; // Clé localStorage

  constructor() {
    this.init();
  }

  init() {
    this.loadHistoryFromStorage(); // Charger l'historique sauvegardé
    this.createNewsButton();
    this.createNewsOverlay();
    this.setupEventListeners();
    this.loadNews();
    
    // Rafraîchir les news toutes les 5 minutes
    this.refreshInterval = setInterval(() => this.loadNews(), 5 * 60 * 1000);
  }

  /**
   * Créer le bouton news dans le header
   */
  private createNewsButton() {
    const authContainer = document.getElementById('auth-button-container');
    if (!authContainer) return;

    const newsBtn = document.createElement('button');
    newsBtn.id = 'news-btn';
    newsBtn.className = 'news-btn';
    newsBtn.title = 'Calendrier économique et news';
    newsBtn.innerHTML = '📰 News';
    
    // Insérer avant le bouton auth
    authContainer.insertBefore(newsBtn, authContainer.firstChild);
    
    this.newsButton = newsBtn;
  }

  /**
   * Créer l'overlay des news
   */
  private createNewsOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'news-overlay';
    overlay.className = 'news-overlay';
    overlay.innerHTML = `
      <div class="news-overlay-backdrop"></div>
      <div class="news-overlay-content">
        <div class="news-header">
          <div>
            <h2>📰 Calendrier Économique Mondial</h2>
            <p style="font-size: 12px; color: #999; margin: 4px 0 0 0;">Historique des 7 derniers jours</p>
          </div>
          <button class="news-close-btn">✕</button>
        </div>
        <div class="news-body">
          <div class="news-list" id="news-list">
            <div class="news-loading">Chargement des news économiques...</div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    this.newsOverlay = overlay;
  }

  /**
   * Setup des event listeners
   */
  private setupEventListeners() {
    if (this.newsButton) {
      this.newsButton.addEventListener('click', () => this.openNews());
    }

    const closeBtn = document.querySelector('.news-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeNews());
    }

    const backdrop = document.querySelector('.news-overlay-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeNews());
    }
  }

  /**
   * Charger l'historique depuis localStorage
   */
  private loadHistoryFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.newsHistory = JSON.parse(stored);
        console.log(`✅ ${this.newsHistory.length} news charges depuis l'historique`);
      }
    } catch (error) {
      console.warn('⚠️ Erreur chargement historique:', error);
      this.newsHistory = [];
    }
  }

  /**
   * Sauvegarder l'historique dans localStorage
   */
  private saveHistoryToStorage() {
    try {
      // Garder seulement les news des 7 derniers jours
      const oneWeekAgo = (Date.now() / 1000) - (this.MAX_DAYS * 24 * 60 * 60);
      const filtered = this.newsHistory.filter(news => news.timestamp > oneWeekAgo);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      this.newsHistory = filtered;
    } catch (error) {
      console.warn('⚠️ Erreur sauvegarde historique:', error);
    }
  }

  /**
   * Ajouter des news à l'historique
   */
  private addToHistory(newNews: EconomicNews[]) {
    // Fusionner avec l'historique existant (éviter les doublons par timestamp)
    const timestamps = new Set(this.newsHistory.map(n => n.timestamp));
    const onlyNew = newNews.filter(n => !timestamps.has(n.timestamp));
    
    if (onlyNew.length > 0) {
      this.newsHistory = [...this.newsHistory, ...onlyNew];
      this.saveHistoryToStorage();
      console.log(`✅ ${onlyNew.length} nouvelles news ajoutées à l'historique`);
    }
  }

  /**
   * Obtenir toutes les news avec historique (triées par date)
   */
  private getAllNews(): EconomicNews[] {
    // Filtrer pour garder max 7 jours
    const oneWeekAgo = (Date.now() / 1000) - (this.MAX_DAYS * 24 * 60 * 60);
    return this.newsHistory
      .filter(news => news.timestamp > oneWeekAgo)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Ouvrir l'overlay des news
   */
  openNews() {
    if (this.newsOverlay) {
      this.newsOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  /**
   * Fermer l'overlay des news
   */
  closeNews() {
    if (this.newsOverlay) {
      this.newsOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  /**
   * Charger les news économiques
   */
  private async loadNews() {
    try {
      const newsList = document.getElementById('news-list');
      if (!newsList) return;

      // Essayer de récupérer les news réelles
      const freshNews = await this.fetchEconomicNews();
      
      // Ajouter les news fraiches à l'historique
      if (freshNews && freshNews.length > 0) {
        this.addToHistory(freshNews);
      }

      // Afficher toutes les news avec historique (max 7 jours)
      const allNews = this.getAllNews();
      
      if (!allNews || allNews.length === 0) {
        newsList.innerHTML = `
          <div class="news-empty">
            <p>📊 Pas de news disponibles pour le moment</p>
            <p style="font-size: 12px; color: #999;">
              Le calendrier économique sera mis à jour régulièrement
            </p>
          </div>
        `;
        return;
      }

      // Afficher les news avec historique (7 derniers jours)
      newsList.innerHTML = allNews.map(item => this.createNewsItem(item)).join('');
      
      console.log(`✅ ${allNews.length} news économiques affichées (derniers 7 jours)`);
    } catch (error) {
      console.error('❌ Erreur chargement news:', error);
      const newsList = document.getElementById('news-list');
      if (newsList) {
        newsList.innerHTML = `
          <div class="news-empty">
            <p>❌ Erreur chargement news</p>
            <p style="font-size: 12px; color: #999;">Vérifiez votre connexion et réessayez</p>
          </div>
        `;
      }
    }
  }

  /**
   * Récupérer les news économiques réelles via Finnhub API
   */
  private async fetchEconomicNews(): Promise<EconomicNews[]> {
    try {
      // Utiliser l'API Finnhub pour le calendrier économique
      const url = `https://finnhub.io/api/v1/calendar/economic?token=${this.FINNHUB_API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`⚠️ API Finnhub: ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.economicCalendar || !Array.isArray(data.economicCalendar)) {
        console.warn('⚠️ Format de réponse inattendu');
        return [];
      }

      // Filtrer et mapper les données
      const news: EconomicNews[] = data.economicCalendar
        .filter((event: any) => event.event && event.country) // Exclure les vides
        .slice(0, 20) // Limiter à 20 derniers events
        .map((event: any) => this.parseEconomicEvent(event));

      return news;
    } catch (error) {
      console.error('❌ Erreur Finnhub API:', error);
      // Retourner un array vide au lieu de crash
      return [];
    }
  }

  /**
   * Parser un événement économique de Finnhub
   */
  private parseEconomicEvent(event: any): EconomicNews {
    // Convertir le timestamp Unix
    const timestamp = parseInt(event.releaseDate) || Date.now() / 1000;
    const date = new Date(timestamp * 1000);
    
    // Formater la date et l'heure
    const dateStr = date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const timeStr = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Déterminer l'impact (high/medium/low)
    const impact = this.getImpactLevel(event.impact);

    // Mapper le pays au drapeau
    const countryFlag = this.getCountryFlag(event.country);

    return {
      date: dateStr,
      time: timeStr,
      timestamp: timestamp,
      title: event.event || 'N/A',
      country: `${countryFlag} ${event.country}`,
      countryCode: event.country,
      impact: impact,
      forecast: event.estimate || '-',
      previous: event.previous || '-',
      actual: event.actual || ''
    };
  }

  /**
   * Déterminer le niveau d'impact
   */
  private getImpactLevel(impact: string): 'high' | 'medium' | 'low' {
    if (!impact) return 'low';
    const str = impact.toLowerCase();
    if (str.includes('high')) return 'high';
    if (str.includes('medium')) return 'medium';
    return 'low';
  }

  /**
   * Obtenir le drapeau du pays
   */
  private getCountryFlag(countryCode: string): string {
    const flags: Record<string, string> = {
      'US': '🇺🇸',
      'GB': '🇬🇧',
      'EU': '🇪🇺',
      'JP': '🇯🇵',
      'CH': '🇨🇭',
      'CA': '🇨🇦',
      'AU': '🇦🇺',
      'NZ': '🇳🇿',
      'FR': '🇫🇷',
      'DE': '🇩🇪',
      'IT': '🇮🇹',
      'ES': '🇪🇸',
      'IN': '🇮🇳',
      'CN': '🇨🇳',
      'MX': '🇲🇽',
      'BR': '🇧🇷',
      'ZA': '🇿🇦'
    };
    return flags[countryCode] || '🌍';
  }

  /**
   * Créer un élément de news
   */
  private createNewsItem(news: EconomicNews): string {
    const isActual = news.actual !== '';
    const statusIcon = isActual ? '✓' : '⏳';
    const statusClass = isActual ? 'released' : 'upcoming';
    
    return `
      <div class="news-item impact-${news.impact} ${statusClass}">
        <div class="news-item-header">
          <div class="news-item-left">
            <span class="news-status">${statusIcon}</span>
            <div class="news-item-info">
              <div class="news-item-title">${news.title}</div>
              <div class="news-item-country">${news.country}</div>
            </div>
          </div>
          <div class="news-item-time">
            <div>${news.date}</div>
            <div style="font-size: 11px; margin-top: 2px;">${news.time}</div>
          </div>
        </div>
        <div class="news-item-values">
          <div class="news-value">
            <span class="news-value-label">Prévision</span>
            <span class="news-value-amount">${news.forecast}</span>
          </div>
          <div class="news-value">
            <span class="news-value-label">Précédent</span>
            <span class="news-value-amount">${news.previous}</span>
          </div>
          ${isActual ? `
            <div class="news-value actual">
              <span class="news-value-label">Réalisé</span>
              <span class="news-value-amount">${news.actual}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Nettoyer les ressources
   */
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

// Initialiser au chargement
declare global {
  var newsManagerInstance: NewsManager;
}

let newsManagerInstance: NewsManager;
document.addEventListener('DOMContentLoaded', () => {
  newsManagerInstance = new NewsManager();
  (window as any).newsManagerInstance = newsManagerInstance;
  console.log('✅ NewsManager initialisé avec API Finnhub');
});

export default NewsManager;
