<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { COCO_CLASSES } from './lib/cocoClasses'
import { drawDetections, snapshot } from './lib/draw'
import { useCamera } from './composables/useCamera'
import { useDetector } from './composables/useDetector'

// --- settings -------------------------------------------------------------
const MAX_TARGETS = 3
const targets = ref(['person']) // up to MAX_TARGETS classes to look for
const pick = ref('') // value of the "add a target" dropdown
const minScore = ref(60) // percent
const intervalMs = ref(250) // how often a frame is analysed
const autoSnap = ref(true)
const showAll = ref(false)
const facing = ref('environment')
const SNAP_COOLDOWN_MS = 3000
const MAX_LOG = 24

// --- state ----------------------------------------------------------------
const videoEl = ref(null)
const canvasEl = ref(null)
const aspect = ref('16 / 9')
const phase = ref('idle') // idle | starting | running
const found = ref(null) // [{ cls, count, best }] while any target is in view
const log = ref([])

const camera = useCamera()
const detector = useDetector()

let runId = 0
let timer = null
let lastSnapAt = 0
let lastShown = []

const running = computed(() => phase.value === 'running')
const error = computed(() => camera.error.value || detector.loadError.value)
const availableClasses = computed(() => COCO_CLASSES.filter((c) => !targets.value.includes(c)))
const targetText = computed(() => targets.value.join(' or '))

// --- targets --------------------------------------------------------------
function addTarget() {
  if (pick.value && targets.value.length < MAX_TARGETS && !targets.value.includes(pick.value)) {
    targets.value.push(pick.value)
  }
  pick.value = ''
}

function removeTarget(c) {
  targets.value = targets.value.filter((t) => t !== c)
}

// --- start / stop ---------------------------------------------------------
async function startScouting() {
  phase.value = 'starting'
  try {
    // Permission prompt and model download happen together.
    const [camOk] = await Promise.all([camera.start(videoEl.value, facing.value), detector.load()])
    if (!camOk) return stopScouting()
  } catch {
    return stopScouting()
  }
  phase.value = 'running'
  const id = ++runId
  tick(id)
}

function stopScouting() {
  runId++
  clearTimeout(timer)
  camera.stop()
  const c = canvasEl.value
  c?.getContext('2d').clearRect(0, 0, c.width, c.height)
  found.value = null
  lastShown = []
  phase.value = 'idle'
}

async function flipCamera() {
  facing.value = facing.value === 'environment' ? 'user' : 'environment'
  if (running.value) {
    stopScouting()
    await startScouting()
  }
}

// --- detection loop -------------------------------------------------------
async function tick(id) {
  if (id !== runId) return
  const t0 = performance.now()
  const v = videoEl.value

  if (v && v.readyState >= 2 && v.videoWidth) {
    syncCanvas(v)
    const preds = await detector.detect(v, minScore.value / 100)
    if (id !== runId) return
    handle(preds, v)
  }

  const wait = Math.max(0, intervalMs.value - (performance.now() - t0))
  timer = setTimeout(() => tick(id), wait)
}

function syncCanvas(v) {
  const c = canvasEl.value
  if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
    c.width = v.videoWidth
    c.height = v.videoHeight
    aspect.value = `${v.videoWidth} / ${v.videoHeight}`
  }
}

function handle(preds, v) {
  const matches = preds.filter((p) => targets.value.includes(p.class))
  lastShown = showAll.value ? preds : matches

  drawDetections(canvasEl.value.getContext('2d'), lastShown, {
    highlightClasses: showAll.value ? [...targets.value] : null,
  })

  if (!matches.length) {
    found.value = null
    return
  }

  found.value = summarize(matches)

  const now = Date.now()
  if (autoSnap.value && now - lastSnapAt > SNAP_COOLDOWN_MS) {
    lastSnapAt = now
    addLog(v, found.value)
  }
}

// One row per class: how many were seen and the best confidence.
function summarize(matches) {
  const byClass = new Map()
  for (const m of matches) {
    const row = byClass.get(m.class) ?? { cls: m.class, count: 0, best: 0 }
    row.count++
    row.best = Math.max(row.best, m.score)
    byClass.set(m.class, row)
  }
  return [...byClass.values()].sort((a, b) => b.best - a.best)
}

function addLog(v, items) {
  log.value.unshift({
    id: crypto.randomUUID(),
    at: new Date(),
    items,
    image: snapshot(v, lastShown),
  })
  if (log.value.length > MAX_LOG) log.value.length = MAX_LOG
}

function captureNow() {
  if (!running.value) return
  addLog(videoEl.value, found.value ?? [])
}

// --- helpers --------------------------------------------------------------
const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fileName = (e) =>
  `framescout-${(e.items.map((i) => i.cls).join('+') || 'capture').replace(/\s+/g, '-')}-${e.at.toISOString().replace(/[:.]/g, '-')}.jpg`
const pct = (n) => `${Math.round(n * 100)}%`

onBeforeUnmount(stopScouting)
</script>

<template>
  <div class="app">
    <header class="top">
      <h1>FrameScout</h1>
      <p>Pick something to look for. Your camera does the rest, and nothing leaves your device.</p>
    </header>

    <main class="layout">
      <section class="stage-col" aria-label="Camera">
        <div class="stage" :style="{ aspectRatio: aspect }" :data-hit="!!found">
          <video ref="videoEl" playsinline muted :class="{ mirror: facing === 'user' }"></video>
          <canvas ref="canvasEl" :class="{ mirror: facing === 'user' }"></canvas>

          <div v-if="!running" class="placeholder">
            <p v-if="phase === 'starting'">
              {{ detector.loading.value ? 'Loading the detection model…' : 'Waiting for camera permission…' }}
            </p>
            <p v-else>Choose up to {{ MAX_TARGETS }} targets, then start the camera.</p>
          </div>
        </div>

        <p class="readout" role="status" aria-live="polite">
          <template v-if="running && found">
            <template v-for="(f, i) in found" :key="f.cls">
              <strong>{{ f.cls }}</strong> {{ pct(f.best) }}<span v-if="f.count > 1"> (×{{ f.count }})</span
              ><span v-if="i < found.length - 1">, </span>
            </template>
            detected
          </template>
          <template v-else-if="running">Looking for {{ targetText }}…</template>
          <template v-else>Camera is off.</template>
        </p>

        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </section>

      <aside class="side">
        <div class="controls">
          <div class="field">
            <span>Targets <b>{{ targets.length }} of {{ MAX_TARGETS }}</b></span>
            <ul v-if="targets.length" class="chips">
              <li v-for="t in targets" :key="t">
                <button class="chip" :aria-label="`Remove ${t}`" @click="removeTarget(t)">
                  {{ t }} <span aria-hidden="true">×</span>
                </button>
              </li>
            </ul>
            <select v-model="pick" aria-label="Add a target" :disabled="targets.length >= MAX_TARGETS" @change="addTarget">
              <option value="" disabled>
                {{ targets.length >= MAX_TARGETS ? 'Remove one to add another' : 'Add a target…' }}
              </option>
              <option v-for="c in availableClasses" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>

          <div class="actions">
            <button v-if="!running" class="primary" :disabled="phase === 'starting' || !targets.length" @click="startScouting">
              {{ phase === 'starting' ? 'Starting…' : 'Start camera' }}
            </button>
            <button v-else class="primary stop" @click="stopScouting">Stop camera</button>
            <button class="ghost" @click="flipCamera">
              Use {{ facing === 'environment' ? 'front' : 'back' }} camera
            </button>
          </div>

          <label class="field">
            <span>Minimum confidence <b>{{ minScore }}%</b></span>
            <input type="range" min="30" max="95" step="5" v-model.number="minScore" />
          </label>

          <label class="field">
            <span>Check a frame</span>
            <select v-model.number="intervalMs">
              <option :value="100">every 0.1 s (fastest, uses more battery)</option>
              <option :value="250">every 0.25 s</option>
              <option :value="500">every 0.5 s</option>
              <option :value="1000">every 1 s (lightest)</option>
            </select>
          </label>

          <label class="check"><input type="checkbox" v-model="autoSnap" /> Save a snapshot when found</label>
          <label class="check"><input type="checkbox" v-model="showAll" /> Also outline other objects</label>
        </div>

        <div class="log">
          <div class="log-head">
            <h2>Detections</h2>
            <div class="log-tools">
              <button class="link" :disabled="!running" @click="captureNow">Capture now</button>
              <button class="link" :disabled="!log.length" @click="log = []">Clear</button>
            </div>
          </div>

          <p v-if="!log.length" class="empty">
            Snapshots appear here with the time they were taken. Start the camera and point it at your target.
          </p>

          <ul v-else>
            <li v-for="e in log" :key="e.id">
              <img :src="e.image" :alt="`Snapshot taken at ${fmtTime(e.at)}`" />
              <div class="meta">
                <strong>{{ fmtTime(e.at) }}</strong>
                <span v-if="!e.items.length">Manual capture</span>
                <span v-for="i in e.items" :key="i.cls">
                  {{ i.cls }} {{ pct(i.best) }}<template v-if="i.count > 1"> ×{{ i.count }}</template>
                </span>
                <a :href="e.image" :download="fileName(e)">Download</a>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </main>
  </div>
</template>

<style>
:root {
  --bg: #0e1418;
  --panel: #151d23;
  --line: #28353e;
  --text: #e6edf0;
  --muted: #8fa3ad;
  --signal: #ffb000;
  --danger: #ff6b5e;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 400 16px/1.5 'IBM Plex Sans', system-ui, sans-serif;
}
button, select, input { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
</style>

<style scoped>
.app { max-width: 1180px; margin: 0 auto; padding: 24px 20px 48px; }

.top h1 { margin: 0; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.01em; }
.top p { margin: 4px 0 24px; color: var(--muted); max-width: 52ch; }

.layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; align-items: start; }

/* viewfinder */
.stage {
  position: relative;
  width: 100%;
  max-height: 72vh;
  background: #05080a;
  border: 1px solid var(--line);
  overflow: hidden;
  transition: border-color 0.15s;
}
.stage[data-hit='true'] { border-color: var(--signal); }
.stage video, .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.stage video { object-fit: fill; background: #05080a; }
.mirror { transform: scaleX(-1); }

.placeholder {
  position: absolute; inset: 0; display: grid; place-items: center; padding: 24px;
  text-align: center; color: var(--muted); background: #05080a;
}

.readout { margin: 12px 0 0; min-height: 1.5em; color: var(--muted); }
.readout strong { color: var(--signal); font-weight: 600; }
.error { margin: 8px 0 0; color: var(--danger); }

/* controls */
.controls { display: grid; gap: 16px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.field { display: grid; gap: 6px; font-size: 0.9rem; color: var(--muted); }
.field b { color: var(--text); font-weight: 500; margin-left: 6px; }
select {
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  padding: 9px 10px; color: var(--text);
}
input[type='range'] { accent-color: var(--signal); width: 100%; }
.check { display: flex; gap: 8px; align-items: center; font-size: 0.95rem; }
.check input { accent-color: var(--signal); width: 16px; height: 16px; }

.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border-radius: 999px; padding: 4px 12px; border-color: var(--signal); color: var(--signal); font-size: 0.9rem; }
.chip:hover { background: rgba(255, 176, 0, 0.12); }

.actions { display: grid; gap: 8px; }
button { cursor: pointer; border-radius: 6px; padding: 10px 14px; border: 1px solid var(--line); background: transparent; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.primary { background: var(--signal); color: #1a1200; border-color: var(--signal); font-weight: 600; }
.primary.stop { background: transparent; color: var(--text); border-color: var(--muted); }
.ghost:hover:not(:disabled) { border-color: var(--muted); }

/* log */
.log { padding-top: 20px; }
.log-head { display: flex; justify-content: space-between; align-items: baseline; }
.log-head h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.log-tools { display: flex; gap: 14px; }
.link { background: none; border: 0; padding: 0; color: var(--muted); text-decoration: underline; }
.link:hover:not(:disabled) { color: var(--text); }
.empty { color: var(--muted); font-size: 0.9rem; max-width: 36ch; }
.log ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 12px; max-height: 420px; overflow: auto; }
.log li { display: grid; grid-template-columns: 112px 1fr; gap: 12px; align-items: center; }
.log li img { width: 112px; aspect-ratio: 4 / 3; object-fit: cover; border: 1px solid var(--line); }
.meta { display: grid; gap: 2px; font-size: 0.9rem; color: var(--muted); }
.meta strong { color: var(--text); font-weight: 500; }
.meta a { color: var(--signal); width: fit-content; }

@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .stage { transition: none; }
}
</style>