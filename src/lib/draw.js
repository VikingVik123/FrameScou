const AMBER = '#ffb000'
const MUTED = '#8fa3ad'

// Draws boxes on a canvas whose internal size equals the video's pixel size,
// so detector coordinates can be used directly.
export function drawDetections(ctx, detections, { highlightClasses } = {}) {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)

  const unit = Math.max(width, height) / 640 // scale strokes/text with resolution
  ctx.lineWidth = 3 * unit
  ctx.font = `600 ${14 * unit}px "IBM Plex Sans", system-ui, sans-serif`
  ctx.textBaseline = 'middle'

  for (const d of detections) {
    const [x, y, w, h] = d.bbox
    const isTarget = !highlightClasses || highlightClasses.includes(d.class)
    const color = isTarget ? AMBER : MUTED

    ctx.strokeStyle = color
    ctx.strokeRect(x, y, w, h)

    const label = `${d.class} ${Math.round(d.score * 100)}%`
    const padX = 6 * unit
    const labelH = 22 * unit
    const labelW = ctx.measureText(label).width + padX * 2
    const labelY = y - labelH < 0 ? y : y - labelH // keep label on screen

    ctx.fillStyle = color
    ctx.fillRect(x - ctx.lineWidth / 2, labelY, labelW, labelH)
    ctx.fillStyle = '#10161c'
    ctx.fillText(label, x + padX - ctx.lineWidth / 2, labelY + labelH / 2)
  }
}

// Returns a JPEG data URL of the current frame with the boxes burned in.
export function snapshot(videoEl, detections, maxWidth = 960) {
  const scale = Math.min(1, maxWidth / videoEl.videoWidth)
  const c = document.createElement('canvas')
  c.width = Math.round(videoEl.videoWidth * scale)
  c.height = Math.round(videoEl.videoHeight * scale)
  const ctx = c.getContext('2d')
  ctx.drawImage(videoEl, 0, 0, c.width, c.height)

  const scaled = detections.map((d) => ({ ...d, bbox: d.bbox.map((n) => n * scale) }))
  const overlay = document.createElement('canvas')
  overlay.width = c.width
  overlay.height = c.height
  drawDetections(overlay.getContext('2d'), scaled)
  ctx.drawImage(overlay, 0, 0)

  return c.toDataURL('image/jpeg', 0.85)
}