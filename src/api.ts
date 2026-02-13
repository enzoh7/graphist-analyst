import type { Candle, Time } from './types';

export class MarketDataService {
    private socket: WebSocket | null = null;
    private onTick: (candle: Candle) => void;
    private symbol: string;
    private interval: string;

    // On passe maintenant le symbole et l'intervalle au constructeur
    constructor(
        symbol: string, 
        interval: string, 
        callback: (candle: Candle) => void
    ) {
        this.symbol = symbol;
        this.interval = interval;
        this.onTick = callback;
    }

    // Génère l'URL d'historique dynamiquement
    private get historyUrl(): string {
        return `https://api.binance.com/api/v3/klines?symbol=${this.symbol.toUpperCase()}&interval=${this.interval}&limit=500`;
    }

    // Génère l'URL WebSocket dynamiquement
    private get wsUrl(): string {
        return `wss://stream.binance.com:9443/ws/${this.symbol.toLowerCase()}@kline_${this.interval}`;
    }

    public async getHistory(): Promise<Candle[]> {
        try {
            const response = await fetch(this.historyUrl);
            const data = await response.json();
            
            return data.map((d: any) => ({
                time: (d[0] / 1000) as Time,
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5]),
            }));
        } catch (error) {
            console.error("Erreur historique:", error);
            return [];
        }
    }

    public connect() {
        // On ferme l'ancienne connexion si elle existe
        this.disconnect();

        this.socket = new WebSocket(this.wsUrl);
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const k = data.k; 
            const candle: Candle = {
                time: Math.floor(k.t / 1000) as Time,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v)
            };
            this.onTick(candle);
        };
    }

    public disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}