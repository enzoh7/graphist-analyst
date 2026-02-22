// ========== AUTH CLIENT ==========
// Gère l'authentification et les appels API sécurisés

const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'current_user';

export interface User {
  id: string;
  email: string;
  username?: string;
  brokerConfigured?: boolean;
  preferences?: {
    notifyEconomicNews: boolean;
    allowEconomicExplanations: boolean;
    theme: 'dark' | 'light';
  };
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

class AuthClient {
  /**
   * Récupérer le token stocké localement
   */
  static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }
  /**
   * Stocker le token et l'utilisateur
   */
  static setToken(token: string, user : User): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  /**
   * Récupérer l'utilisateur actuellement connecté
   */
  static getCurrentUser(): User | null {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  /**
   * Vérifier si l'utilisateur est connecté
   */
  static isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Faire une requête protégée avec token JWT
   */
  private static async fetchWithToken(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Décodeur basique de JWT pour Debug (ne pas utiliser en prod)
   */
  private static decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const decoded = atob(parts[1]);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * POST /auth/signup - Créer un compte utilisateur
   */
  static async signup(
    email: string,
    password: string,
    passwordConfirm: string,
    username?: string
  ): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          passwordConfirm,
          username: username || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur d\'inscription',
        };
      }

      if (data.token && data.user) {
        this.setToken(data.token, data.user);
      }

      return {
        success: true,
        user: data.user,
        token: data.token,
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }

  /**
   * POST /auth/login - Connexion à l'application
   */
  static async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur de connexion',
        };
      }

      if (data.token && data.user) {
        this.setToken(data.token, data.user);
      }

      return {
        success: true,
        user: data.user,
        token: data.token,
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }

  /**
   * GET /auth/profile - Récupérer le profil utilisateur
   */
  static async getProfile(): Promise<AuthResponse> {
    try {
      const response = await this.fetchWithToken(
        `${API_BASE_URL}/auth/profile`
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        return {
          success: false,
          error: data.error || 'Erreur de récupération du profil',
        };
      }

      if (data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }

      return {
        success: true,
        user: data.user,
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }

  /**
   * PUT /auth/preferences - Mettre à jour les préférences
   */
  static async updatePreferences(preferences: Partial<User['preferences']>): Promise<AuthResponse> {
    try {
      const response = await this.fetchWithToken(
        `${API_BASE_URL}/auth/preferences`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur de mise à jour',
        };
      }

      const user = this.getCurrentUser();
      if (user && data.preferences) {
        user.preferences = data.preferences;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }

      return {
        success: true,
        user: this.getCurrentUser() || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }


  /**
   * GET /health - Vérifier l'état du serveur et du bridge Python
   */
  static async getBrokerStatus(): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET'
      });

      if (!response.ok) {
        return {
          serverConnected: false,
          bridgeConnected: false,
          brokerConnected: false,
        };
      }

      const health = await response.json();
      
      return {
        serverConnected: true,
        bridgeConnected: health.bridgeConnected || false,
        brokerConnected: false, // Legacy pour compatibilité
        serverPort: health.serverPort,
        bridgeUrl: health.bridgeUrl,
      };
    } catch (error) {
      console.error('Erreur vérification santé:', error);
      return {
        serverConnected: false,
        bridgeConnected: false,
        brokerConnected: false,
      };
    }
  }

  /**
   * POST /auth/logout - Déconnecter l'utilisateur
   */
  static logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    console.log('✅ Déconnecté');
  }

  /**
   * Vérifier si le token est expiré
   */
  static isTokenExpired(): boolean {
    const token = this.getToken();
    if (!token) return true;

    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    const expiryTime = decoded.exp * 1000;
    return Date.now() > expiryTime;
  }

  /**
   * Renouveler le token si presque expiré
   */
  static async refreshTokenIfNeeded(): Promise<boolean> {
    if (this.isTokenExpired()) {
      this.logout();
      return false;
    }
    return true;
  }
}

export default AuthClient;
