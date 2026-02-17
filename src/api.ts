import type { Candle } from './types';

// ========== MAPPING DES SYMBOLES ==========
const SYMBOL_MAPPING: Record<string, string> = {
    'XAUUSD': 'PAXGUSDT',
    'BTCUSDT': 'BTCUSDT',
    'EURUSD': 'EURUSDT',
    'GBPUSD': 'GBPUSDT',
    'USDJPY': 'JPYUSDT',
};

/**
 * Convertir un symbole affiché à l'utilisateur en symbole Binance
 */
export function getBinanceSymbol(displayedSymbol: string): string {
    return SYMBOL_MAPPING[displayedSymbol] || displayedSymbol;
}

// ========== BACKEND API CLIENT ==========
export interface TradeOrder {
    symbol: string;
    type: 'buy' | 'sell';
    volume: number;
    tp: number;  // Take Profit
    sl: number;  // Stop Loss
}

export interface TradeResponse {
    success: boolean;
    orderId: string;
    symbol: string;
    type: string;
    volume: number;
    tp: number;
    sl: number;
    timestamp: string;
}

export interface HealthResponse {
    status: string;
    serverPort: number;
    bridgeUrl: string;
    bridgeConnected: boolean;
}

export class TradingApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
    }

    /**
     * Vérifier la connexion au serveur et au bridge
     */
    async checkHealth(): Promise<HealthResponse | null> {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('❌ Serveur indisponible:', error);
            return null;
        }
    }

    /**
     * Exécuter une ordre (BUY ou SELL) - Route unifiée /trade
     */
    async executeOrder(order: TradeOrder): Promise<TradeResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/trade`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(order),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || error.message || 'Erreur lors de l\'exécution de l\'ordre');
            }

            const result: TradeResponse = await response.json();
            console.log('✅ Ordre exécutée avec succès:', result.orderId);
            return result;
        } catch (error) {
            console.error('❌ Erreur lors de l\'exécution de l\'ordre:', error);
            throw error;
        }
    }

    /**
     * Récupérer les positions ouvertes
     */
    async getPositions() {
        try {
            const response = await fetch(`${this.baseUrl}/positions`);
            if (!response.ok) throw new Error('Impossible de récupérer les positions');
            return await response.json();
        } catch (error) {
            console.error('❌ Erreur positions:', error);
            throw error;
        }
    }

    /**
     * BUY - Raccourci pratique
     */
    async buy(symbol: string, volume: number, tp: number, sl: number): Promise<TradeResponse> {
        return this.executeOrder({ symbol, type: 'buy', volume, tp, sl });
    }

    /**
     * SELL - Raccourci pratique
     */
    async sell(symbol: string, volume: number, tp: number, sl: number): Promise<TradeResponse> {
        return this.executeOrder({ symbol, type: 'sell', volume, tp, sl });
    }
}

// ========== DONNÉES DE MARCHÉ ==========
export class MarketDataService {
    private socket: WebSocket | null = null;
    private onTick: (candle: Candle) => void;
    private symbol: string;
    private interval: string;

    constructor(symbol: string, interval: string, callback: (candle: Candle) => void) {
        this.symbol = getBinanceSymbol(symbol);  // Convertir au symbole Binance
        this.interval = interval;
        this.onTick = callback;
    }

    private get historyUrl() {
        return `https://api.binance.com/api/v3/klines?symbol=${this.symbol.toUpperCase()}&interval=${this.interval}&limit=500`;
    }

    public async getHistory(): Promise<Candle[]> {
        try {
            const response = await fetch(this.historyUrl);
            const data = await response.json();
            return data.map((d: any) => ({
                time: Math.floor(d[0] / 1000),
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5]),
            }));
        } catch (e) {
            console.error('Erreur getHistory:', e);
            return [];
        }
    }

    public connect() {
        this.socket = new WebSocket(
            `wss://stream.binance.com:9443/ws/${this.symbol.toLowerCase()}@kline_${this.interval}`
        );
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const k = data.k;
                const candle: Candle = {
                    time: Math.floor(k.t / 1000),
                    open: parseFloat(k.o),
                    high: parseFloat(k.h),
                    low: parseFloat(k.l),
                    close: parseFloat(k.c),
                    volume: parseFloat(k.v),
                };
                this.onTick(candle);
            } catch (e) {
                console.error('Erreur parsing WebSocket:', e);
            }
        };
        this.socket.onerror = (err) => {
            console.error('WebSocket erreur:', err);
        };
    }

    public disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}