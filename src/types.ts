import type { Time } from 'lightweight-charts';

export type { Time };

export interface Candle {
    time: Time; // Timestamp en secondes
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
