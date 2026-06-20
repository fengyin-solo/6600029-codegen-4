<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDroneStore } from '../store/drone';
import { riskToColor, riskLevelLabel } from '../utils/pathfinding';

const store = useDroneStore();
const mapContainer = ref<HTMLElement>();
let map: L.Map | null = null;
let waypointLayer: L.LayerGroup | null = null;
let routeLayer: L.LayerGroup | null = null;
let zoneLayer: L.LayerGroup | null = null;
let heatmapLayer: L.LayerGroup | null = null;
let droneMarker: L.CircleMarker | null = null;

const addMode = ref(false);

function initMap() {
  if (!mapContainer.value || map) return;
  map = L.map(mapContainer.value).setView(store.mapCenter, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18,
  }).addTo(map);

  // Layer stacking (bottom → top): heatmap, no-fly zones, waypoints, route
  heatmapLayer = L.layerGroup().addTo(map);
  zoneLayer = L.layerGroup().addTo(map);
  waypointLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (addMode.value) {
      store.addWaypoint(e.latlng.lat, e.latlng.lng);
    }
  });

  // Initial paint of data-driven layers (mock data is loaded in App onMounted)
  drawTerrainHeatmap();
  drawNoFlyZones();
}

function drawNoFlyZones() {
  if (!zoneLayer) return;
  zoneLayer.clearLayers();
  for (const zone of store.noFlyZones) {
    const color =
      zone.type === 'airport' ? '#ef4444' :
      zone.type === 'military' ? '#f97316' : '#a855f7';
    L.circle([zone.center[0], zone.center[1]], {
      radius: zone.radius,
      color,
      fillColor: color,
      fillOpacity: 0.15,
      weight: 2,
    })
      .bindPopup(`<b>${zone.name}</b><br>Type: ${zone.type}<br>Radius: ${zone.radius}m`)
      .addTo(zoneLayer);
  }
}

function drawTerrainHeatmap() {
  if (!heatmapLayer) return;
  heatmapLayer.clearLayers();
  if (!store.showTerrainHeatmap || store.terrainData.length === 0) return;

  const terrain = store.terrainData;
  const spacing =
    terrain.length > 1 ? Math.abs(terrain[1].lng - terrain[0].lng) || 0.005 : 0.005;
  const half = spacing / 2;

  for (const tp of store.terrainRiskPoints) {
    const color = riskToColor(tp.risk);
    const isDanger = tp.level === 'high' || tp.level === 'critical';
    const fillOpacity = tp.level === 'safe' ? 0.15 :
                        tp.level === 'caution' ? 0.3 :
                        tp.level === 'high' ? 0.5 : 0.7;

    const rect = L.rectangle(
      [
        [tp.lat - half, tp.lng - half],
        [tp.lat + half, tp.lng + half],
      ],
      {
        color: isDanger ? color : 'transparent',
        weight: tp.level === 'critical' ? 2 : isDanger ? 1 : 0,
        fillColor: color,
        fillOpacity,
        className: tp.level === 'critical' ? 'heatmap-danger-pulse' : '',
      }
    );

    const dangerIcon = tp.level === 'critical' ? ' ⚠️ 危险' :
                       tp.level === 'high' ? ' ⚡ 高危' : '';

    rect.bindPopup(
      `<div style="min-width:150px">
        <b style="color:${color}">地形风险${dangerIcon}</b><br>
        海拔: <b>${Math.round(tp.elevation)} m</b><br>
        风险值: <b>${(tp.risk * 100).toFixed(0)}%</b><br>
        等级: <b style="color:${color}">${riskLevelLabel(tp.level)}</b><br>
        巡航高度: ${store.flightAltitude} m
      </div>`
    );
    rect.addTo(heatmapLayer);
  }
}

function drawWaypoints() {
  if (!waypointLayer) return;
  waypointLayer.clearLayers();
  store.waypoints.forEach((wp, idx) => {
    const marker = L.circleMarker([wp.lat, wp.lng], {
      radius: 8,
      color: '#3b82f6',
      fillColor: '#60a5fa',
      fillOpacity: 0.9,
      weight: 2,
    });
    marker.bindTooltip(`WP${idx + 1}`, { permanent: true, direction: 'top', className: 'wp-tooltip' });
    marker.bindPopup(`
      <div style="min-width:160px">
        <b>Waypoint ${idx + 1}</b><br>
        Altitude: ${wp.altitude}m<br>
        Speed: ${wp.speed} m/s<br>
        Action: ${wp.action}<br>
        <button onclick="this.closest('.leaflet-popup').remove()" style="margin-top:4px;color:#ef4444">Remove</button>
      </div>
    `);
    marker.on('dragend', (e: any) => {
      const ll = e.target.getLatLng();
      store.updateWaypoint(wp.id, { lat: ll.lat, lng: ll.lng });
    });
    marker.addTo(waypointLayer!);
  });
}

function drawRoute() {
  if (!routeLayer) return;
  routeLayer.clearLayers();
  if (store.waypoints.length < 2 || !map) return;

  const segments = store.routeSegmentRisks;
  for (const seg of segments) {
    const isDanger = seg.level === 'high' || seg.level === 'critical';
    const weight = seg.level === 'critical' ? 6 :
                   seg.level === 'high' ? 5 :
                   seg.level === 'caution' ? 4 : 3;
    const dashArray = seg.level === 'critical' ? '10,5' :
                      seg.level === 'high' ? '6,3' : undefined;

    const line = L.polyline(
      [
        [seg.from.lat, seg.from.lng],
        [seg.to.lat, seg.to.lng],
      ] as [number, number][],
      {
        color: seg.color,
        weight,
        opacity: 0.95,
        dashArray,
      }
    );

    line.bindTooltip(
      `<b>航段风险</b><br>
       等级: <span style="color:${seg.color};font-weight:bold">${riskLevelLabel(seg.level)}</span><br>
       风险值: ${(seg.risk * 100).toFixed(0)}%`,
      { direction: 'top', offset: [0, -8] }
    );

    line.addTo(routeLayer);
  }
}

function drawSimDrone() {
  if (!map || store.waypoints.length < 2) return;
  const progress = store.simProgress / 100;
  const totalWp = store.waypoints.length;
  const segIdx = Math.min(Math.floor(progress * (totalWp - 1)), totalWp - 2);
  const segProgress = (progress * (totalWp - 1)) - segIdx;
  const wp1 = store.waypoints[segIdx];
  const wp2 = store.waypoints[segIdx + 1];
  const lat = wp1.lat + (wp2.lat - wp1.lat) * segProgress;
  const lng = wp1.lng + (wp2.lng - wp1.lng) * segProgress;

  if (droneMarker) {
    droneMarker.setLatLng([lat, lng]);
  } else {
    droneMarker = L.circleMarker([lat, lng], {
      radius: 10,
      color: '#fbbf24',
      fillColor: '#f59e0b',
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
  }
}

watch(() => store.waypoints.length, () => {
  drawWaypoints();
  drawRoute();
});

watch(() => store.noFlyZones.length, drawNoFlyZones);
watch(() => store.simProgress, drawSimDrone);

// Terrain risk heatmap: redraw on toggle, risk recompute, or terrain load
watch(() => store.showTerrainHeatmap, drawTerrainHeatmap);
watch(() => store.terrainRiskPoints, drawTerrainHeatmap, { deep: true });

// Recolor route segments when underlying risk changes (altitude/terrain/waypoints)
watch(() => store.routeSegmentRisks, drawRoute, { deep: true });

onMounted(() => {
  nextTick(initMap);
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

function toggleAddMode() {
  addMode.value = !addMode.value;
}

function handlePlanRoute() {
  if (store.waypoints.length < 2) return;
  const first = store.waypoints[0];
  const last = store.waypoints[store.waypoints.length - 1];
  store.planRoute([first.lat, first.lng], [last.lat, last.lng]);
}
</script>

<template>
  <div class="relative w-full h-full">
    <div ref="mapContainer" class="w-full h-full rounded-lg" />
    <div class="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
      <button
        @click="toggleAddMode"
        :class="addMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'"
        class="px-3 py-1 rounded text-xs font-medium shadow hover:opacity-90 transition"
      >
        {{ addMode ? '✦ 添加模式' : '○ 点击添加' }}
      </button>
      <button
        @click="handlePlanRoute"
        class="px-3 py-1 rounded text-xs font-medium bg-green-700 text-white shadow hover:opacity-90 transition"
      >
        规划航线
      </button>
      <button
        @click="store.clearRoute()"
        class="px-3 py-1 rounded text-xs font-medium bg-red-700 text-white shadow hover:opacity-90 transition"
      >
        清除
      </button>
      <button
        @click="store.showTerrainHeatmap = !store.showTerrainHeatmap"
        :class="store.showTerrainHeatmap ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300'"
        class="px-3 py-1 rounded text-xs font-medium shadow hover:opacity-90 transition"
      >
        {{ store.showTerrainHeatmap ? '🔥 风险热力图' : '○ 风险热力图' }}
      </button>
    </div>

    <!-- Heatmap legend -->
    <div
      v-if="store.showTerrainHeatmap"
      class="absolute bottom-2 left-2 z-[1000] bg-slate-900/95 text-slate-200 rounded-lg p-3 text-[11px] shadow-xl border border-slate-700 backdrop-blur-sm"
    >
      <div class="font-bold mb-2 text-orange-400 text-sm flex items-center gap-1">
        <span>🔥</span>
        <span>地形风险热力图</span>
      </div>
      <div class="text-[10px] text-slate-400 mb-2">
        巡航高度: <span class="text-orange-400 font-semibold">{{ store.flightAltitude }} m</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <span class="inline-block w-4 h-4 rounded shadow-sm" style="background:#22c55e;opacity:0.7" />
          <span class="text-green-400 font-medium">安全</span>
          <span class="text-slate-500 text-[10px]">地形较低，无碰撞风险</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-4 h-4 rounded shadow-sm" style="background:#eab308;opacity:0.7" />
          <span class="text-yellow-400 font-medium">注意</span>
          <span class="text-slate-500 text-[10px]">需关注地形变化</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-4 h-4 rounded shadow-sm" style="background:#f97316;opacity:0.7" />
          <span class="text-orange-400 font-medium">高危</span>
          <span class="text-slate-500 text-[10px]">接近安全距离阈值</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-4 h-4 rounded shadow-sm animate-pulse" style="background:#ef4444;opacity:0.8" />
          <span class="text-red-400 font-bold">危险</span>
          <span class="text-slate-500 text-[10px]">低空碰撞风险</span>
        </div>
      </div>
      <div class="mt-2 pt-2 border-t border-slate-700 flex justify-between text-[10px]">
        <span class="text-slate-400">危险区域:</span>
        <span class="text-red-400 font-bold">{{ store.dangerZoneCount }} 处</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.wp-tooltip) {
  background: rgba(30, 41, 59, 0.9);
  color: #e2e8f0;
  border: 1px solid #475569;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
}

:deep(.heatmap-danger-pulse) {
  animation: danger-pulse 2s ease-in-out infinite;
}

@keyframes danger-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
</style>
