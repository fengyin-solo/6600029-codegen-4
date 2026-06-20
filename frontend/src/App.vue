<script setup lang="ts">
import { onMounted, computed } from 'vue';
import MapView from './components/MapView.vue';
import TerrainProfile from './components/TerrainProfile.vue';
import FlightStats from './components/FlightStats.vue';
import { useDroneStore } from './store/drone';

const store = useDroneStore();

onMounted(() => {
  store.loadMockData();
});

function handlePlanRoute() {
  if (store.waypoints.length < 2) return;
  const first = store.waypoints[0];
  const last = store.waypoints[store.waypoints.length - 1];
  store.planRoute([first.lat, first.lng], [last.lat, last.lng]);
}

const safeZonePercent = computed(() => {
  const total = store.terrainRiskPoints.length || 1;
  const count = store.terrainRiskPoints.filter(p => p.level === 'safe').length;
  return Math.round((count / total) * 100);
});

const cautionZonePercent = computed(() => {
  const total = store.terrainRiskPoints.length || 1;
  const count = store.terrainRiskPoints.filter(p => p.level === 'caution').length;
  return Math.round((count / total) * 100);
});

const highZonePercent = computed(() => {
  const total = store.terrainRiskPoints.length || 1;
  const count = store.terrainRiskPoints.filter(p => p.level === 'high').length;
  return Math.round((count / total) * 100);
});

const criticalZonePercent = computed(() => {
  const total = store.terrainRiskPoints.length || 1;
  const count = store.terrainRiskPoints.filter(p => p.level === 'critical').length;
  return Math.round((count / total) * 100);
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <!-- Header -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <h1 class="text-lg font-bold text-sky-400">
        🛸 无人机 3D 航线规划与地形避障
      </h1>
      <div class="text-xs text-slate-500">
        航点: {{ store.waypoints.length }} |
        禁区: {{ store.noFlyZones.length }}
      </div>
    </header>

    <!-- Main content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Map area -->
      <div class="flex-1 flex flex-col" style="width: 70%">
        <div class="flex-1 relative">
          <MapView />
        </div>

        <!-- Bottom terrain profile -->
        <div class="p-2 bg-slate-900 border-t border-slate-800">
          <TerrainProfile />
        </div>
      </div>

      <!-- Right sidebar -->
      <div class="w-[30%] min-w-[280px] bg-slate-900 border-l border-slate-800 p-3 flex flex-col gap-3 overflow-y-auto">
        <!-- Algorithm selector -->
        <div class="bg-slate-800 rounded-lg p-3">
          <h3 class="text-xs font-semibold text-slate-300 mb-2">规划算法</h3>
          <div class="flex gap-2">
            <label class="flex-1 cursor-pointer">
              <input
                type="radio"
                :value="'astar'"
                v-model="store.selectedAlgorithm"
                class="hidden peer"
              />
              <div class="text-center py-1.5 rounded text-xs font-medium peer-checked:bg-sky-700 peer-checked:text-white bg-slate-700 text-slate-400 transition">
                A* 搜索
              </div>
            </label>
            <label class="flex-1 cursor-pointer">
              <input
                type="radio"
                :value="'rrt'"
                v-model="store.selectedAlgorithm"
                class="hidden peer"
              />
              <div class="text-center py-1.5 rounded text-xs font-medium peer-checked:bg-sky-700 peer-checked:text-white bg-slate-700 text-slate-400 transition">
                RRT 随机树
              </div>
            </label>
          </div>
        </div>

        <!-- Terrain risk heatmap -->
        <div class="bg-slate-800 rounded-lg p-3">
          <h3 class="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1">
            <span>🔥</span>
            <span>地形风险热力图</span>
          </h3>
          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>巡航高度</span>
                <span class="text-orange-400 font-semibold">{{ store.flightAltitude }} m</span>
              </div>
              <input
                type="range"
                min="30"
                max="300"
                step="10"
                v-model.number="store.flightAltitude"
                class="w-full accent-orange-500"
              />
              <div class="flex justify-between text-[9px] text-slate-500 mt-0.5">
                <span>30m 低空</span>
                <span>300m 高空</span>
              </div>
            </div>

            <!-- Risk distribution -->
            <div class="bg-slate-900 rounded p-2 space-y-1.5">
              <div class="text-[10px] text-slate-400 mb-1">风险分布</div>
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                <span class="text-[10px] text-slate-300 w-8">安全</span>
                <div class="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div class="h-full bg-green-500 rounded-full" :style="{ width: safeZonePercent + '%' }"></div>
                </div>
                <span class="text-[10px] text-slate-400 w-8 text-right">{{ safeZonePercent }}%</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span class="text-[10px] text-slate-300 w-8">注意</span>
                <div class="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div class="h-full bg-yellow-500 rounded-full" :style="{ width: cautionZonePercent + '%' }"></div>
                </div>
                <span class="text-[10px] text-slate-400 w-8 text-right">{{ cautionZonePercent }}%</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-orange-500"></span>
                <span class="text-[10px] text-slate-300 w-8">高危</span>
                <div class="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div class="h-full bg-orange-500 rounded-full" :style="{ width: highZonePercent + '%' }"></div>
                </div>
                <span class="text-[10px] text-slate-400 w-8 text-right">{{ highZonePercent }}%</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                <span class="text-[10px] text-slate-300 w-8">危险</span>
                <div class="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div class="h-full bg-red-500 rounded-full" :style="{ width: criticalZonePercent + '%' }"></div>
                </div>
                <span class="text-[10px] text-slate-400 w-8 text-right">{{ criticalZonePercent }}%</span>
              </div>
            </div>

            <div class="bg-red-950/50 border border-red-900/50 rounded p-2 flex items-center justify-between">
              <span class="text-[10px] text-red-300">⚠️ 低空危险区</span>
              <span class="text-sm font-bold text-red-400">{{ store.dangerZoneCount }} 处</span>
            </div>

            <p class="text-[9px] text-slate-500 leading-snug">
              💡 调整巡航高度可实时查看不同高度下的地形风险分布。航线颜色随风险等级联动变化。
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="bg-slate-800 rounded-lg p-3 space-y-2">
          <h3 class="text-xs font-semibold text-slate-300 mb-2">操作</h3>
          <button
            @click="handlePlanRoute"
            :disabled="store.waypoints.length < 2"
            class="w-full py-2 rounded text-xs font-medium bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            🧭 规划航线
          </button>
          <button
            @click="store.simulateFlight()"
            :disabled="store.isSimulating || store.waypoints.length < 2"
            class="w-full py-2 rounded text-xs font-medium bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {{ store.isSimulating ? '飞行中...' : '▶ 模拟飞行' }}
          </button>

          <!-- Progress bar -->
          <div v-if="store.isSimulating || store.simProgress > 0" class="space-y-1">
            <div class="flex justify-between text-[10px] text-slate-400">
              <span>模拟进度</span>
              <span>{{ store.simProgress }}%</span>
            </div>
            <div class="w-full bg-slate-700 rounded-full h-2">
              <div
                class="h-2 rounded-full transition-all bg-amber-500"
                :style="{ width: store.simProgress + '%' }"
              />
            </div>
          </div>

          <button
            @click="store.clearRoute()"
            class="w-full py-2 rounded text-xs font-medium bg-red-800 text-white hover:bg-red-700 transition"
          >
            🗑 清除航线
          </button>
        </div>

        <!-- Flight stats -->
        <FlightStats />
      </div>
    </div>
  </div>
</template>
