export interface Reading {
  id: number;
  time: string;
  temp: number;
  humidity: number;
  soil: number;
  pitchStatus: string;
  pumpOn: boolean;
  fanOn: boolean;
  mode: 'auto' | 'manual';
}

export interface TimelineEvent {
  id: number;
  time: string;
  type: 'sensor' | 'pump' | 'fan' | 'mode' | 'export';
  message: string;
}
