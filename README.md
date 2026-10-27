# FrameScout

Pick a target (person, dog, cup…), allow the camera, and FrameScout runs object detection
in the browser and boxes the target when it appears. Nothing is uploaded: the model runs
locally with TensorFlow.js + COCO-SSD.

## Run it

    npm install
    npm run dev          # http://localhost:5173 (camera works on localhost)
    npm run dev:https    # for testing on a phone on your network (self-signed cert)

## How it works

- `src/composables/useCamera.js`   getUserMedia, permission errors, stop/restart
- `src/composables/useDetector.js` loads COCO-SSD once, `detect(video, minScore)`
- `src/lib/draw.js`                draws boxes + labels, burns them into snapshots
- `src/App.vue`                    UI and the throttled detection loop

Detection runs on a timer (default every 250 ms), not every video frame, which keeps
phones cool. Change it in the "Check a frame" setting.

## Notes

- The model detects the 80 COCO classes (see `src/lib/cocoClasses.js`). Custom targets
  (e.g. "my red backpack") need a custom-trained model.
- Camera access requires HTTPS in production (any static host with HTTPS works).
- Swap `lite_mobilenet_v2` for `mobilenet_v2` in `useDetector.js` for better accuracy, slower.
