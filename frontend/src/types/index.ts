export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  altitude: number;   // meters AGL
  speed: number;      // m/s
  action: 'hover' | 'photo' | 'video' | 'none';
}

export interface FlightPlan {
  id: string;
  name: string;
  waypoints: Waypoint[];
  totalDistance: number;
  estimatedTime: number;
  batteryUsage: number;  // percentage
}

export interface NoFlyZone {
  id: string;
  name: string;
  center: [number, number];
  radius: number;  // meters
  type: 'airport' | 'military' | 'restricted';
}

export interface TerrainPoint {
  lat: number;
  lng: number;
  elevation: number;
}

export interface DroneConfig {
  maxAltitude: number;
  maxSpeed: number;
  batteryCapacity: number;  // mAh
  consumptionRate: number;  // mAh/min
  safeDistance: number;     // meters from obstacles
}

// Terrain risk is how hazardous a ground cell is for a drone cruising at a
// given altitude: the closer the terrain elevation is to (or above) the
// flight altitude, the higher the collision risk for low-altitude flight.
export type TerrainRiskLevel = 'safe' | 'caution' | 'high' | 'critical';

export interface TerrainRiskPoint extends TerrainPoint {
  risk: number;   // normalized 0..1
  level: TerrainRiskLevel;
}

export interface RouteSegmentRisk {
  from: Waypoint;
  to: Waypoint;
  risk: number;   // normalized 0..1
  level: TerrainRiskLevel;
  color: string;  // hex color derived from risk
}
