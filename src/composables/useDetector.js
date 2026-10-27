import { ref, shallowRef } from 'vue'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'

// Shared across the app so the model downloads once.
const model = shallowRef(null)
const loading = ref(false)
const loadError = ref('')
let pending = null

export function useDetector() {
  function load() {
    if (model.value) return Promise.resolve(model.value)
    if (pending) return pending

    loading.value = true
    loadError.value = ''
    pending = (async () => {
      try {
        await tf.ready() // picks WebGL when available, falls back to CPU
        model.value = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
        return model.value
      } catch (e) {
        loadError.value = 'The detection model failed to load. Check your connection and retry.'
        pending = null
        throw e
      } finally {
        loading.value = false
      }
    })()
    return pending
  }

  // Returns [{ class, score, bbox: [x, y, width, height] }] in video pixel coordinates.
  async function detect(videoEl, minScore = 0.5) {
    if (!model.value) return []
    return model.value.detect(videoEl, 20, minScore)
  }

  return { model, loading, loadError, load, detect, backend: () => tf.getBackend() }
}
