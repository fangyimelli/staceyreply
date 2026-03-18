import type { EventLogItem, ReplayMode, ReplayStageId } from '../types/domain';

export interface ReplayUiState {
  mode: ReplayMode;
  currentBarIndex: number;
  isPlaying: boolean;
}

export const stageStops = (events: EventLogItem[]) => events.map((event) => event.visibleFromIndex).filter((value, index, list) => list.indexOf(value) === index).sort((a, b) => a - b);

export const nextStageStop = (events: EventLogItem[], currentBarIndex: number) => stageStops(events).find((stop) => stop > currentBarIndex);

export const currentStage = (events: EventLogItem[], currentBarIndex: number): ReplayStageId => (events.filter((event) => event.visibleFromIndex <= currentBarIndex).slice(-1)[0]?.stage) ?? 'background';
