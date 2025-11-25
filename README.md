# Cyberpunk Silhouette Lab

Modern, neon-infused visualizer that captures the device camera, extracts the user’s outline, and redraws it as a glowing holographic silhouette in real time. Built for installations, live streams, and futuristic UI experiments.

## Features

- Live camera capture via `navigator.mediaDevices.getUserMedia`.
- GPU-accelerated WebGL pipeline with Sobel edge detection.
- Animated neon/glitch shader with pulses, halos, scanlines, and toggleable fire trails.
- Responsive cyberpunk UI with tip carousel and control sliders.
- Adjustable glitch and outline intensity without restarting the stream.

## Tech stack

- React + TypeScript + Vite
- WebGL fragment shader for silhouette and glow
- Modern CSS (no external UI libraries)

## Getting started

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`) in a browser that supports WebGL and camera access. Grant permission when prompted to see the neon silhouette.

### Production build

```bash
npm run build
npm run preview
```

## Controls & usage tips

- **Glitch flow** increases UV wobble for more aggressive holographic distortion.
- **Outline boost** raises the Sobel edge gain to keep silhouettes sharp in low-light scenes.
- **Fire trails** button toggles the flame ripple overlay that lingers behind motion.
- The rotating tips surface practical guidance (contrast backdrop, keep distance, etc.).

## Notes

- WebGL must be available; unsupported devices fall back to an inline error message.
- Chrome/Edge on desktop GPUs offer the smoothest 60fps render path.
- Customize the shader inside `src/App.tsx` to experiment with new looks and colorways.
