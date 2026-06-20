<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import { useDroneStore } from '../store/drone';
import { riskToColor, riskLevelLabel } from '../utils/pathfinding';
import type { TerrainRiskLevel } from '../types';

const store = useDroneStore();
const canvas = ref<HTMLCanvasElement>();

function classifyTerrainRisk(
  elevation: number,
  flightAltitude: number,
  safeDistance: number
): { risk: number; level: TerrainRiskLevel } {
  const risk = Math.max(0, Math.min(1, elevation / Math.max(flightAltitude, 1)));
  const collideThreshold = flightAltitude - safeDistance;
  let level: TerrainRiskLevel;
  if (elevation >= collideThreshold) level = 'critical';
  else if (risk >= 0.75) level = 'high';
  else if (risk >= 0.5) level = 'caution';
  else level = 'safe';
  return { risk, level };
}

const riskProfile = computed(() => {
  return store.terrainProfile.map((p) => ({
    ...p,
    ...classifyTerrainRisk(p.terrainElevation, store.flightAltitude, store.droneConfig.safeDistance),
  }));
});

function draw() {
  const ctx = canvas.value?.getContext('2d');
  if (!ctx) return;

  const W = 800;
  const H = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, W, H);

  const profile = riskProfile.value;
  if (profile.length < 2) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无航线数据 — 规划航线后显示地形剖面', W / 2, H / 2);
    return;
  }

  const distances: number[] = [0];
  for (let i = 1; i < profile.length; i++) {
    const dx = (profile[i].lng - profile[i - 1].lng) * 111000;
    const dy = (profile[i].lat - profile[i - 1].lat) * 111000;
    distances.push(distances[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const maxDist = distances[distances.length - 1] || 1;

  let minAlt = Infinity;
  let maxAlt = -Infinity;
  for (const p of profile) {
    minAlt = Math.min(minAlt, p.terrainElevation);
    maxAlt = Math.max(maxAlt, p.altitude);
  }
  minAlt = Math.max(0, minAlt - 20);
  maxAlt = maxAlt + 20;
  const altRange = maxAlt - minAlt || 1;

  const toX = (d: number) => padding.left + (d / maxDist) * plotW;
  const toY = (a: number) => padding.top + plotH - ((a - minAlt) / altRange) * plotH;

  // Draw terrain with risk-based coloring (segment by segment)
  for (let i = 0; i < profile.length - 1; i++) {
    const p1 = profile[i];
    const p2 = profile[i + 1];
    const color = riskToColor(p1.risk);

    ctx.beginPath();
    ctx.moveTo(toX(distances[i]), toY(p1.terrainElevation));
    ctx.lineTo(toX(distances[i + 1]), toY(p2.terrainElevation));
    ctx.lineTo(toX(distances[i + 1]), padding.top + plotH);
    ctx.lineTo(toX(distances[i]), padding.top + plotH);
    ctx.closePath();
    ctx.fillStyle = color + '66';
    ctx.fill();
  }

  // Draw terrain outline
  ctx.beginPath();
  ctx.moveTo(toX(distances[0]), toY(profile[0].terrainElevation));
  for (let i = 1; i < profile.length; i++) {
    ctx.lineTo(toX(distances[i]), toY(profile[i].terrainElevation));
  }
  ctx.strokeStyle = '#92613a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw safe distance line
  const safeAlt = store.flightAltitude - store.droneConfig.safeDistance;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, toY(safeAlt));
  ctx.lineTo(padding.left + plotW, toY(safeAlt));
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw flight altitude line
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, toY(store.flightAltitude));
  ctx.lineTo(padding.left + plotW, toY(store.flightAltitude));
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw flight path with risk coloring
  for (let i = 0; i < profile.length - 1; i++) {
    const p1 = profile[i];
    const p2 = profile[i + 1];
    const color = riskToColor(p1.risk);
    const isDanger = p1.level === 'high' || p1.level === 'critical';

    ctx.beginPath();
    ctx.moveTo(toX(distances[i]), toY(p1.altitude));
    ctx.lineTo(toX(distances[i + 1]), toY(p2.altitude));
    ctx.strokeStyle = color;
    ctx.lineWidth = isDanger ? 3 : 2;
    if (p1.level === 'critical') {
      ctx.setLineDash([8, 4]);
    } else if (p1.level === 'high') {
      ctx.setLineDash([4, 3]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw waypoint dots
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    const color = riskToColor(p.risk);
    ctx.beginPath();
    ctx.arc(toX(distances[i]), toY(p.altitude), 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotH);
  ctx.lineTo(padding.left + plotW, padding.top + plotH);
  ctx.stroke();

  // X axis labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const d = (maxDist / xTicks) * i;
    const x = toX(d);
    ctx.fillText(`${(d / 1000).toFixed(1)} km`, x, padding.top + plotH + 16);
    ctx.beginPath();
    ctx.moveTo(x, padding.top + plotH);
    ctx.lineTo(x, padding.top + plotH + 4);
    ctx.strokeStyle = '#475569';
    ctx.stroke();
  }

  // Y axis labels
  ctx.textAlign = 'right';
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const a = minAlt + (altRange / yTicks) * i;
    const y = toY(a);
    ctx.fillText(`${Math.round(a)}m`, padding.left - 6, y + 4);
    ctx.beginPath();
    ctx.moveTo(padding.left - 3, y);
    ctx.lineTo(padding.left, y);
    ctx.strokeStyle = '#475569';
    ctx.stroke();
  }

  // Altitude labels
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
  ctx.font = '10px sans-serif';
  ctx.fillText(`巡航 ${store.flightAltitude}m`, padding.left + plotW - 80, toY(store.flightAltitude) - 4);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
  ctx.fillText(`安全线 ${safeAlt}m`, padding.left + plotW - 80, toY(safeAlt) - 4);

  // Legend
  ctx.textAlign = 'left';
  const legendY = padding.top + 4;
  const levels = [
    { level: 'safe' as TerrainRiskLevel, label: '安全' },
    { level: 'caution' as TerrainRiskLevel, label: '注意' },
    { level: 'high' as TerrainRiskLevel, label: '高危' },
    { level: 'critical' as TerrainRiskLevel, label: '危险' },
  ];
  let legendX = padding.left + 10;
  for (const { level, label } of levels) {
    const color = riskToColor(level === 'safe' ? 0.1 : level === 'caution' ? 0.4 : level === 'high' ? 0.7 : 0.95);
    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY - 3, 12, 8);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText(label, legendX + 16, legendY + 5);
    legendX += 70;
  }
}

onMounted(() => nextTick(draw));
watch(() => riskProfile.value, draw, { deep: true });
watch(() => store.flightAltitude, draw);
</script>

<template>
  <canvas
    ref="canvas"
    width="800"
    height="200"
    class="w-full rounded-lg border border-slate-700"
  />
</template>
