import type { CandlestickData, Time } from 'lightweight-charts';

export type { Time };

export interface Candle extends CandlestickData<Time> {
    time: Time | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

