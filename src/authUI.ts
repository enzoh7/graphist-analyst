// ========== AUTH UI CONTROLLER ==========
// Gère l'interface utilisateur de l'authentification

import AuthClient from './authClient.js';
import DrawingApiClient from './drawingApiClient.js';

class AuthUI {
  constructor() {
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.restoreSessionIfExists();
    
    // Vérifier périodiquement l'état du serveur et du bridge
    setInterval(() => {
      if (AuthClient.isAuthenticated()) {
        this.updateBrokerStatus();
      }
    }, 5000);
  }

  /**
   * Configurer les event listeners
   */
  setupEventListeners() {
    // Bouton d'ouverture du modal
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const authModal = document.getElementById('auth-modal');
    const authModalClose = document.getElementById('auth-modal-close');
    const authModalOverlay = document.querySelector('.auth-modal-overlay');

    if (authToggleBtn) {
      authToggleBtn.addEventListener('click', () => this.toggleAuthModal());
    }

    if (authModalClose) {
      authModalClose.addEventListener('click', () => this.closeAuthModal());
    }

    if (authModalOverlay) {
      authModalOverlay.addEventListener('click', () => this.closeAuthModal());
    }

    // Onglets
    const tabButtons = document.querySelectorAll('.auth-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => this.switchAuthTab(btn.dataset.tab));
    });

    // Formulaires
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const brokerForm = document.getElementById('broker-config-form');

    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    if (signupForm) {
      signupForm.addEventListener('submit', (e) => this.handleSignup(e));
    }

    if (brokerForm) {
      brokerForm.addEventListener('submit', (e) => this.handleBrokerConfig(e));
    }

    // Préférences et logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    const prefEconomicNews = document.getElementById('pref-economic-news');
    const prefExplanations = document.getElementById('pref-explanations');
    const prefTheme = document.getElementById('pref-theme');

    if (prefEconomicNews) {
      prefEconomicNews.addEventListener('change', () => this.updatePreferences());
    }

    if (prefExplanations) {
      prefExplanations.addEventListener('change', () => this.updatePreferences());
    }

    if (prefTheme) {
      prefTheme.addEventListener('change', () => this.updatePreferences());
    }
  }

  /**
   * Restaurer la session si l'utilisateur était connecté
   */
  restoreSessionIfExists() {
    if (AuthClient.isAuthenticated()) {
      this.updateAuthUIState();
      console.log('✅ Session restaurée');
    }
  }

  /**
   * Basculer le modal d'authentification
   */
  toggleAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal.classList.contains('active')) {
      this.closeAuthModal();
    } else {
      this.openAuthModal();
    }
  }

  /**
   * Ouvrir le modal d'authentification
   */
  openAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.add('active');
  }

  /**
   * Fermer le modal d'authentification
   */
  closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('active');
  }

  /**
   * Basculer entre les onglets
   */
  switchAuthTab(tabName) {
    // Désactiver tous les boutons et panes
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelectorAll('.auth-tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    // Activer le bouton et la pane sélectionnés
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`auth-tab-${tabName}`).classList.add('active');
  }

  /**
   * Gérer la connexion
   */
  async handleLogin(e) {
    e.preventDefault();

    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-password') as HTMLInputElement).value;
    const errorDiv = document.getElementById('login-error');
    const loadingDiv = document.getElementById('login-loading');

    // ========== VALIDATION ==========
    if (!email || !password) {
      this.showError(errorDiv, 'Veuillez remplir tous les champs');
      return;
    }

    // ========== AFFICHER LE CHARGEMENT ==========
    this.showLoading(loadingDiv);
    this.hideError(errorDiv);

    // ========== APPEL API ==========
    const result = await AuthClient.login(email, password);

    this.hideLoading(loadingDiv);

    if (!result.success) {
      this.showError(errorDiv, result.error || 'Erreur de connexion');
      return;
    }

    // ========== SUCCÈS ==========
    console.log('✅ Connexion réussie:', result.user);
    this.updateAuthUIState();
    (document.getElementById('login-form') as HTMLFormElement).reset();
  }

  /**
   * Gérer l'inscription
   */
  async handleSignup(e) {
    e.preventDefault();

    const email = (document.getElementById('signup-email') as HTMLInputElement).value;
    const username = (document.getElementById('signup-username') as HTMLInputElement).value;
    const password = (document.getElementById('signup-password') as HTMLInputElement).value;
    const passwordConfirm = (
      document.getElementById('signup-password-confirm') as HTMLInputElement
    ).value;
    const errorDiv = document.getElementById('signup-error');
    const loadingDiv = document.getElementById('signup-loading');

    // ========== VALIDATION ==========
    if (!email || !password || !passwordConfirm) {
      this.showError(errorDiv, 'Veuillez remplir les champs requis');
      return;
    }

    if (password !== passwordConfirm) {
      this.showError(errorDiv, 'Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 8) {
      this.showError(errorDiv, 'Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    // ========== AFFICHER LE CHARGEMENT ==========
    this.showLoading(loadingDiv);
    this.hideError(errorDiv);

    // ========== APPEL API ==========
    const result = await AuthClient.signup(email, password, passwordConfirm, username || undefined);

    this.hideLoading(loadingDiv);

    if (!result.success) {
      this.showError(errorDiv, result.error || 'Erreur d\'inscription');
      return;
    }

    // ========== SUCCÈS ==========
    console.log('✅ Inscription réussie:', result.user);
    this.updateAuthUIState();
    (document.getElementById('signup-form') as HTMLFormElement).reset();
    this.switchAuthTab('login');
  }

  /**
   * Gérer la configuration du bridge Python
   */
  async handleBrokerConfig(e) {
    e.preventDefault();

    const successDiv = document.getElementById('broker-success');
    
    // Bridge Python est automatiquement détecté, juste afficher un message
    this.showSuccess(successDiv, 'Configuration du bridge: Lancez le serveur Flask sur port 5000');
    
    console.log('ℹ️ Bridge Python doit être consulté sur http://localhost:5000');
    console.log('💡 Les ordres seront exécutées via ce bridge local');
    
    // Vérifier immédiatement l'état
    setTimeout(() => this.updateBrokerStatus(), 500);
  }

  /**
   * Mettre à jour les préférences
   */
  async updatePreferences() {
    const economicNews = (document.getElementById('pref-economic-news') as HTMLInputElement)
      .checked;
    const explanations = (document.getElementById('pref-explanations') as HTMLInputElement)
      .checked;
    const theme = (document.getElementById('pref-theme') as HTMLSelectElement).value;

    const preferences = {
      notifyEconomicNews: economicNews,
      allowEconomicExplanations: explanations,
      theme: theme as 'dark' | 'light'
    };

    const result = await AuthClient.updatePreferences(preferences);

    if (result.success) {
      console.log('✅ Préférences mises à jour');
    } else {
      console.error('❌ Erreur de mise à jour:', result.error);
    }
  }

  /**
   * Gérer la déconnexion
   */
  handleLogout() {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      AuthClient.logout();
      this.updateAuthUIState();
      this.closeAuthModal();
      console.log('✅ Déconnecté');
    }
  }

  /**
   * Mettre à jour l'état de l'UI en fonction du statut d'authentification
   */
  updateAuthUIState() {
    const isAuth = AuthClient.isAuthenticated();
    const user = AuthClient.getCurrentUser();
    const authBtn = document.getElementById('auth-toggle-btn');
    const loginTab = document.getElementById('auth-tab-login');
    const signupTab = document.getElementById('auth-tab-signup');
    const brokerSection = document.getElementById('auth-broker-section');
    const userSection = document.getElementById('auth-user-section');

    if (isAuth && user) {
      // ========== UTILISATEUR CONNECTÉ ==========
      if (authBtn) {
        authBtn.textContent = `👤 ${user.username || user.email}`;
        authBtn.classList.add('logged-in');
      }

      // Masquer les onglets de connexion/inscription
      if (loginTab) loginTab.style.display = 'none';
      if (signupTab) signupTab.style.display = 'none';
      document.querySelectorAll('.auth-tab-btn').forEach(btn => {
        btn.style.display = 'none';
      });

      // Afficher la section utilisateur
      if (userSection) {
        userSection.classList.add('active');
      }

      // Afficher la section broker
      if (brokerSection) {
        brokerSection.classList.remove('hidden');
      }

      // Remplir les infos utilisateur
      const userEmail = document.getElementById('auth-user-email');
      if (userEmail) {
        userEmail.textContent = user.email;
      }

      // Charger et afficher le statut du broker
      this.updateBrokerStatus();

      // Remplir les préférences
      if (user.preferences) {
        const economicNews = document.getElementById('pref-economic-news') as HTMLInputElement;
        const explanations = document.getElementById('pref-explanations') as HTMLInputElement;
        const theme = document.getElementById('pref-theme') as HTMLSelectElement;

        if (economicNews) economicNews.checked = user.preferences.notifyEconomicNews;
        if (explanations) explanations.checked = user.preferences.allowEconomicExplanations;
        if (theme) theme.value = user.preferences.theme;
      }
    } else {
      // ========== UTILISATEUR NON CONNECTÉ ==========
      if (authBtn) {
        authBtn.textContent = '🔐 Connexion';
        authBtn.classList.remove('logged-in');
      }

      // Afficher les onglets
      if (loginTab) loginTab.style.display = 'block';
      if (signupTab) signupTab.style.display = 'block';
      document.querySelectorAll('.auth-tab-btn').forEach(btn => {
        btn.style.display = 'block';
      });

      // Masquer la section utilisateur
      if (userSection) {
        userSection.classList.remove('active');
      }

      // Masquer la section broker
      if (brokerSection) {
        brokerSection.classList.add('hidden');
      }

      // Afficher par défaut le tab login
      this.switchAuthTab('login');
    }
  }

  /**
   * Afficher une erreur
   */
  /**
   * Mettre à jour le statut du serveur et du bridge Python
   */
  async updateBrokerStatus() {
    const health = await AuthClient.getBrokerStatus();
    
    const serverIndicator = document.getElementById('broker-status-indicator');
    const bridgeIndicator = document.getElementById('bridge-status-indicator');
    const orderStatus = document.getElementById('broker-connection-status');
    const detailsSection = document.getElementById('broker-details-section');

    // ========== MISE À JOUR SERVEUR NODE.JS (PORT 3000) ==========
    if (serverIndicator) {
      if (health.serverConnected) {
        serverIndicator.className = 'broker-status-indicator online';
        serverIndicator.textContent = '● Serveur: Connecté';
      } else {
        serverIndicator.className = 'broker-status-indicator offline';
        serverIndicator.textContent = '● Serveur: Déconnecté';
      }
    }

    // ========== MISE À JOUR BRIDGE PYTHON (PORT 5000) ==========
    if (bridgeIndicator) {
      if (health.bridgeConnected) {
        bridgeIndicator.className = 'broker-status-indicator online';
        bridgeIndicator.textContent = '● Bridge: Connecté';
      } else {
        bridgeIndicator.className = 'broker-status-indicator offline';
        bridgeIndicator.textContent = '● Bridge: Déconnecté';
      }
    }

    // ========== STATUT DES ORDRES ==========
    if (orderStatus) {
      if (health.serverConnected && health.bridgeConnected) {
        orderStatus.className = 'status-badge online';
        orderStatus.textContent = '✓ Prêt (Ordres activées)';
      } else if (health.serverConnected && !health.bridgeConnected) {
        orderStatus.className = 'status-badge offline';
        orderStatus.textContent = '⚠️ Bridge non actif';
      } else {
        orderStatus.className = 'status-badge offline';
        orderStatus.textContent = '✗ Non disponible';
      }
    }

    // ========== AFFICHAGE DES DÉTAILS ==========
    if (detailsSection) {
      if (health.serverConnected) {
        detailsSection.classList.add('active');
      } else {
        detailsSection.classList.remove('active');
      }
    }

    // ========== LOG DE DÉBOGAGE ==========
    if (health.serverConnected && health.bridgeConnected) {
      console.log('✅ Système complet opérationnel');
    } else if (!health.bridgeConnected) {
      console.warn('⚠️ Bridge Python non disponible - Lancez le serveur Flask sur port 5000');
    } else {
      console.error('❌ Serveur Node.js non disponible');
    }
  }

  showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
  }

  /**
   * Masquer une erreur
   */
  hideError(element) {
    if (!element) return;
    element.classList.remove('show');
    element.textContent = '';
  }

  /**
   * Afficher le chargement
   */
  showLoading(element) {
    if (!element) return;
    element.classList.add('show');
  }

  /**
   * Masquer le chargement
   */
  hideLoading(element) {
    if (!element) return;
    element.classList.remove('show');
  }

  /**
   * Afficher un succès
   */
  showSuccess(element, message) {
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => {
      element.classList.remove('show');
    }, 3000);
  }
}

// ========== INITIALISATION ==========
document.addEventListener('DOMContentLoaded', () => {
  new AuthUI();
  console.log('✅ Auth UI initialisé');
});

export default AuthUI;
