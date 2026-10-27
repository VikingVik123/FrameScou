import { ref } from 'vue'

export function useCamera() {
  const stream = ref(null)
  const error = ref('')

  async function start(videoEl, facingMode = 'environment') {
    error.value = ''
    stop()

    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Camera access needs HTTPS or localhost. Open the site over a secure connection.'
      return false
    }

    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      videoEl.srcObject = stream.value
      await videoEl.play()
      return true
    } catch (e) {
      error.value = describeError(e)
      stream.value = null
      return false
    }
  }

  function stop() {
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
  }

  return { stream, error, start, stop }
}

function describeError(e) {
  switch (e?.name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Allow camera access in your browser’s site settings, then try again.'
    case 'NotFoundError':
      return 'No camera was found on this device.'
    case 'NotReadableError':
      return 'The camera is in use by another app. Close it and try again.'
    default:
      return `Could not start the camera (${e?.message || e}).`
  }
}
