import type { Annotation } from '../types/domain';

export const annotationColor = (kind: Annotation['kind']) => ({
  source: '#f59e0b',
  stopHunt: '#ef4444',
  point1: '#22c55e',
  point2: '#38bdf8',
  point3: '#a78bfa',
  ema: '#e879f9',
  entry: '#14b8a6',
  stop: '#dc2626',
  tp30: '#84cc16',
  tp35: '#65a30d',
  tp40: '#4d7c0f',
  tp50: '#3f6212',
  marker: '#f8fafc',
}[kind]);
