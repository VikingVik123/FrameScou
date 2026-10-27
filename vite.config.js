import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Camera access needs a secure context. localhost is fine on your computer;
// to test from a phone on your network, `npm run dev:https` serves over HTTPS
// (the basicSsl plugin makes a self-signed certificate; accept the browser warning).
export default defineConfig(({ command }) => ({
  plugins: [vue(), ...(process.argv.includes('--host') ? [basicSsl()] : [])],
  optimizeDeps: { include: ['@tensorflow/tfjs', '@tensorflow-models/coco-ssd'] },
}))
