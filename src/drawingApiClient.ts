// ========== DRAWING API CLIENT ==========
// Gère la sauvegarde, chargement et suppression des dessins

import AuthClient from './authClient.js';

const API_BASE_URL = 'http://localhost:3000';

export interface DrawingData {
  id?: string;
  type: 'hline' | 'rect' | 'position' | 'fib';
  symbol: string;
  timeframe: string;
  p1: { time?: number | string; price: number };
  p2?: { time?: number | string; price: number };
  color?: string;
  textColor?: string;
  text?: string;
  textPos?: string;
  textSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DrawingsResponse {
  success: boolean;
  drawings?: DrawingData[];
  drawing?: DrawingData;
  count?: number;
  error?: string;
}

class DrawingApiClient {
  /**
   * Faire une requête sécurisée avec token
   */
  private static async fetchWithToken(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = AuthClient.getToken();
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
   * GET /api/drawings - Récupérer les dessins de l'utilisateur
   */
  static async getDrawings(
    symbol?: string,
    timeframe?: string,
    limit: number = 100
  ): Promise<DrawingsResponse> {
    try {
      if (!AuthClient.isAuthenticated()) {
        return {
          success: false,
          error: 'Non authentifié',
          drawings: [],
        };
      }

      let url = `${API_BASE_URL}/api/drawings?limit=${limit}`;
      if (symbol) url += `&symbol=${symbol}`;
      if (timeframe) url += `&timeframe=${timeframe}`;

      const response = await this.fetchWithToken(url);
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur de chargement des dessins',
          drawings: [],
        };
      }

      return {
        success: true,
        drawings: data.drawings || [],
      };
    } catch (error) {
      console.error('❌ Erreur chargement dessins:', error);
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
        drawings: [],
      };
    }
  }

  /**
   * POST /api/drawings - Créer un nouveau dessin
   */
  static async createDrawing(drawing: DrawingData): Promise<DrawingsResponse> {
    try {
      if (!AuthClient.isAuthenticated()) {
        return {
          success: false,
          error: 'Non authentifié',
        };
      }

      if (!drawing.type || !drawing.symbol || !drawing.timeframe || !drawing.p1) {
        return {
          success: false,
          error: 'Paramètres manquants',
        };
      }

      const response = await this.fetchWithToken(
        `${API_BASE_URL}/api/drawings`,
        {
          method: 'POST',
          body: JSON.stringify(drawing),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur création dessin',
        };
      }

      return {
        success: true,
        drawing: data.drawing,
      };
    } catch (error) {
      console.error('❌ Erreur création dessin:', error);
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }

  /**
   * PUT /api/drawings/:id - Mettre à jour un dessin
   */
  static async updateDrawing(
    id: string,
    updates: Partial<DrawingData>
  ): Promise<DrawingsResponse> {
    try {
      if (!AuthClient.isAuthenticated()) {
        return {
          success: false,
          error: 'Non authentifié',
        };
      }

      const response = await this.fetchWithToken(
        `${API_BASE_URL}/api/drawings/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur mise à jour',
        };
      }

      return {
        success: true,
        drawing: data.drawing,
      };
    } catch (error) {
      console.error('❌ Erreur mise à jour dessin:', error);
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }

  /**
   * DELETE /api/drawings/:id - Supprimer un dessin
   */
  static async deleteDrawing(id: string): Promise<DrawingsResponse> {
    try {
      if (!AuthClient.isAuthenticated()) {
        return {
          success: false,
          error: 'Non authentifié',
        };
      }

      const response = await this.fetchWithToken(
        `${API_BASE_URL}/api/drawings/${id}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur suppression',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('❌ Erreur suppression dessin:', error);
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }

  /**
   * POST /api/drawings/bulk-save - Sauvegarder plusieurs dessins à la fois
   */
  static async bulkSaveDrawings(drawings: DrawingData[]): Promise<DrawingsResponse> {
    try {
      if (!AuthClient.isAuthenticated()) {
        return {
          success: false,
          error: 'Non authentifié',
        };
      }

      if (drawings.length === 0) {
        return {
          success: true,
          count: 0,
          drawings: [],
        };
      }

      const response = await this.fetchWithToken(
        `${API_BASE_URL}/api/drawings/bulk-save`,
        {
          method: 'POST',
          body: JSON.stringify({ drawings }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur sauvegarde en masse',
        };
      }

      return {
        success: true,
        count: data.count,
        drawings: data.drawings,
      };
    } catch (error) {
      console.error('❌ Erreur sauvegarde en masse:', error);
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }

  /**
   * GET /api/drawings/stats - Récupérer les statistiques des dessins
   */
  static async getDrawingStats(): Promise<{
    success: boolean;
    stats?: any[];
    error?: string;
  }> {
    try {
      if (!AuthClient.isAuthenticated()) {
        return {
          success: false,
          error: 'Non authentifié',
        };
      }

      const response = await this.fetchWithToken(
        `${API_BASE_URL}/api/drawings/stats`
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Erreur récupération stats',
        };
      }

      return {
        success: true,
        stats: data.stats,
      };
    } catch (error) {
      console.error('❌ Erreur stats:', error);
      return {
        success: false,
        error: `Erreur réseau: ${error}`,
      };
    }
  }
}

export default DrawingApiClient;
