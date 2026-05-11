export interface Depot {
  ID: number;
  MechanicHours: number;
}

export interface Vehicle {
  TaskID: string;
  Duration: number;
  Impact: number;
}

export interface DepotResponse {
  depots: Depot[];
}

export interface VehicleResponse {
  vehicles: Vehicle[];
}

export interface ScheduleResult {
  depotId: number;
  mechanicHours: number;
  totalImpact: number;
  totalDuration: number;
  selectedTasks: Vehicle[];
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}
