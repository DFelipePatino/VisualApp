import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type PipelineControls = {
  glitch: number
  outlineBoost: number
  fireIntensity: number
}

type PipelineHandle = {
  render: () => void
  dispose: () => void
}

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureDimensions;
uniform float u_time;
uniform float u_glitch;
uniform float u_outlineBoost;
uniform float u_fireIntensity;
uniform float u_effectChromatic;
uniform float u_effectInvert;
uniform float u_effectScanline;
uniform float u_effectPixelate;
uniform float u_effectVignette;
uniform float u_effectNoise;
varying vec2 v_texCoord;

float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 texel = 1.0 / u_textureDimensions;
  vec2 glitchShift = vec2(
    sin((v_texCoord.y + u_time * 0.45) * 18.0) * 0.003 * u_glitch,
    cos((v_texCoord.x + u_time * 0.35) * 22.0) * 0.002 * u_glitch
  );

  vec2 sampleUV = clamp(v_texCoord + glitchShift, vec2(0.001), vec2(0.999));

  float tl = luminance(texture2D(u_texture, sampleUV + texel * vec2(-1.0, -1.0)).rgb);
  float tc = luminance(texture2D(u_texture, sampleUV + texel * vec2(0.0, -1.0)).rgb);
  float tr = luminance(texture2D(u_texture, sampleUV + texel * vec2(1.0, -1.0)).rgb);
  float ml = luminance(texture2D(u_texture, sampleUV + texel * vec2(-1.0, 0.0)).rgb);
  float mr = luminance(texture2D(u_texture, sampleUV + texel * vec2(1.0, 0.0)).rgb);
  float bl = luminance(texture2D(u_texture, sampleUV + texel * vec2(-1.0, 1.0)).rgb);
  float bc = luminance(texture2D(u_texture, sampleUV + texel * vec2(0.0, 1.0)).rgb);
  float br = luminance(texture2D(u_texture, sampleUV + texel * vec2(1.0, 1.0)).rgb);

  float gx = -1.0 * tl - 2.0 * ml - 1.0 * bl + 1.0 * tr + 2.0 * mr + 1.0 * br;
  float gy = -1.0 * tl - 2.0 * tc - 1.0 * tr + 1.0 * bl + 2.0 * bc + 1.0 * br;

  float edge = length(vec2(gx, gy));
  float silhouette = smoothstep(0.08, 0.35, edge * u_outlineBoost);

  float pulse = 0.5 + 0.5 * sin(u_time * 4.0 + v_texCoord.y * 18.0);
  vec3 neonBase = mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 0.0, 0.7), v_texCoord.y + pulse * 0.25);
  vec3 neon = mix(neonBase, vec3(0.9, 0.95, 1.0), pulse);

  float halo = smoothstep(0.02, 0.25, edge * 4.0);
  vec3 glow = neon * silhouette + neon * halo * 0.35;

  vec3 scanLines = vec3(0.05 * sin((v_texCoord.y * u_resolution.y) * 0.5 + u_time * 25.0));
  vec3 background = vec3(0.005, 0.02, 0.05) + scanLines;

  float fireFlow = sin((v_texCoord.y * 140.0) + u_time * 8.0) * 0.5 + 0.5;
  float fireRipple = sin((v_texCoord.x + u_time * 0.6) * 60.0) * 0.5 + 0.5;
  float fireMask = silhouette * (0.4 + 0.6 * fireFlow) + halo * 0.3;
  fireMask *= smoothstep(0.0, 0.3, edge) * u_fireIntensity;

  vec3 fireColor = mix(vec3(1.0, 0.32, 0.08), vec3(1.0, 0.82, 0.18), fireRipple);
  fireColor *= 0.6 + 0.4 * sin(u_time * 12.0 + v_texCoord.y * 90.0);

  vec2 effectUV = v_texCoord;

  if (u_effectPixelate > 0.0) {
    float grid = mix(180.0, 32.0, clamp(u_effectPixelate, 0.0, 1.0));
    effectUV = floor(effectUV * grid) / grid;
  }

  vec3 chromaSample = vec3(
    texture2D(u_texture, clamp(effectUV + vec2(0.003, 0.0), vec2(0.0), vec2(1.0))).r,
    texture2D(u_texture, clamp(effectUV, vec2(0.0), vec2(1.0))).g,
    texture2D(u_texture, clamp(effectUV - vec2(0.003, 0.0), vec2(0.0), vec2(1.0))).b
  );

  vec3 finalColor = max(background, glow);
  finalColor = mix(finalColor, fireColor, clamp(fireMask, 0.0, 1.0));

  finalColor = mix(finalColor, chromaSample, u_effectChromatic);

  if (u_effectScanline > 0.0) {
    float scan = 0.65 + 0.35 * sin((v_texCoord.y * u_resolution.y) * 1.2 + u_time * 35.0);
    finalColor *= mix(1.0, scan, u_effectScanline);
  }

  if (u_effectVignette > 0.0) {
    vec2 centered = v_texCoord - 0.5;
    float vignette = smoothstep(0.65, 0.2, length(centered));
    finalColor *= mix(1.0, vignette, u_effectVignette);
  }

  if (u_effectNoise > 0.0) {
    float grain = fract(sin(dot(v_texCoord * u_time, vec2(12.9898, 78.233))) * 43758.5453);
    finalColor += (grain - 0.5) * 0.35 * u_effectNoise;
  }

  if (u_effectInvert > 0.0) {
    finalColor = mix(finalColor, vec3(1.0) - finalColor, u_effectInvert);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
`

const tips = [
  'Stand at least one meter away for crisp silhouettes.',
  'Use a contrasting background to help the neon edge detector.',
  'Glitch mode adds motion-reactive wobble effects.',
  'Outline boost sharpens the edge contrast in low light.'
]

const statusCopy: Record<'pending' | 'ready' | 'error', string> = {
  pending: 'Booting vision core…',
  ready: 'Cam online',
  error: 'Camera link failed'
}

const FLOATING_TEXT_BASE_SIZE = 28

type EffectKey = 'chromatic' | 'scanline' | 'vignette' | 'invert' | 'pixelate' | 'noise'

const effectPresets: { key: EffectKey; label: string }[] = [
  { key: 'chromatic', label: 'Remove Effects' },
  { key: 'scanline', label: 'Scanline pulse' },
  { key: 'vignette', label: 'Vignette bloom' },
  { key: 'invert', label: 'Inversion' },
  { key: 'pixelate', label: 'Pixel grid' },
  { key: 'noise', label: 'Particle noise' }
]

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pipelineRef = useRef<PipelineHandle | null>(null)
  const frameRef = useRef<number | null>(null)
  const viewerStageRef = useRef<HTMLDivElement | null>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const sourceCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const controlsRef = useRef<PipelineControls>({
    glitch: 0.22,
    outlineBoost: 1.4,
    fireIntensity: 0
  })
  const effectsRef = useRef<Record<EffectKey, boolean>>({
    chromatic: false,
    scanline: false,
    vignette: false,
    invert: false,
    pixelate: false,
    noise: false
  })
  const floatingVelocityRef = useRef({ x: 85, y: 65 })
  const floatingPositionRef = useRef({ x: 0, y: 0 })
  const floatingSizeRef = useRef({ width: 120, height: 40 })
  const floatingTextValueRef = useRef('')
  const floatingTextScaleRef = useRef(1)

  const [status, setStatus] = useState<'pending' | 'ready' | 'error'>('pending')
  const [errorMessage, setErrorMessage] = useState('')
  const [glitch, setGlitch] = useState(controlsRef.current.glitch)
  const [outlineBoost, setOutlineBoost] = useState(controlsRef.current.outlineBoost)
  const [fireTrailEnabled, setFireTrailEnabled] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)
  const [floatingText, setFloatingText] = useState('')
  const [floatingTextScale, setFloatingTextScale] = useState(1)
  const [effects, setEffects] = useState(effectsRef.current)

  useEffect(() => {
    floatingTextValueRef.current = floatingText
  }, [floatingText])

  useEffect(() => {
    floatingTextScaleRef.current = floatingTextScale
  }, [floatingTextScale])

  useEffect(() => {
    controlsRef.current.glitch = glitch
  }, [glitch])

  useEffect(() => {
    controlsRef.current.outlineBoost = outlineBoost
  }, [outlineBoost])

  useEffect(() => {
    controlsRef.current.fireIntensity = fireTrailEnabled ? 1 : 0
  }, [fireTrailEnabled])

  useEffect(() => {
    effectsRef.current = effects
  }, [effects])

  useEffect(() => {
    const stage = viewerStageRef.current
    if (!stage || !floatingText) return

    if (!measureCtxRef.current) {
      const measureCanvas = document.createElement('canvas')
      measureCtxRef.current = measureCanvas.getContext('2d')
    }

    const measureCtx = measureCtxRef.current
    if (!measureCtx) return

    const fontPx = FLOATING_TEXT_BASE_SIZE * floatingTextScale
    measureCtx.font = `600 ${fontPx}px 'Space Grotesk', sans-serif`
    const metrics = measureCtx.measureText(floatingText)
    const padding = fontPx * 0.8
    const textWidth = metrics.width + padding
    const textHeight = fontPx * 1.6
    floatingSizeRef.current = {
      width: textWidth,
      height: textHeight
    }

    const randomDirection = () => (Math.random() > 0.5 ? 1 : -1)
    floatingVelocityRef.current = {
      x: (70 + Math.random() * 50) * randomDirection(),
      y: (55 + Math.random() * 45) * randomDirection()
    }

    const velocity = floatingVelocityRef.current
    const initialBoundsWidth = Math.max(1, stage.clientWidth - floatingSizeRef.current.width)
    const initialBoundsHeight = Math.max(1, stage.clientHeight - floatingSizeRef.current.height)
    let posX = Math.random() * initialBoundsWidth
    let posY = Math.random() * initialBoundsHeight
    floatingPositionRef.current = { x: posX, y: posY }
    let lastTime: number | null = null
    let frameId: number

    const animate = (time: number) => {
      if (lastTime === null) lastTime = time
      const deltaSeconds = (time - lastTime) / 1000
      lastTime = time

      posX += velocity.x * deltaSeconds
      posY += velocity.y * deltaSeconds

      const boundsWidth = Math.max(1, stage.clientWidth - floatingSizeRef.current.width)
      const boundsHeight = Math.max(1, stage.clientHeight - floatingSizeRef.current.height)

      if (posX <= 0 || posX >= boundsWidth) {
        velocity.x *= -1
        posX = Math.min(Math.max(posX, 0), boundsWidth)
      }

      if (posY <= 0 || posY >= boundsHeight) {
        velocity.y *= -1
        posY = Math.min(Math.max(posY, 0), boundsHeight)
      }

      floatingPositionRef.current = { x: posX, y: posY }
      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [floatingText, floatingTextScale])

  const cycleTips = useMemo(
    () => tips.map((tip, idx) => ({ id: idx, label: tip })),
    []
  )

  useEffect(() => {
    const ticker = setInterval(() => {
      setTipIndex((current) => (current + 1) % tips.length)
    }, 6000)

    return () => clearInterval(ticker)
  }, [])

  const createNeonPipeline = useCallback((canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const gl = canvas.getContext('webgl', {
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    })

    if (!gl) {
      throw new Error('WebGL is not available on this device.')
    }

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Shader creation failed.')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(info ?? 'Shader compilation error.')
      }
      return shader
    }

    const vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)

    const program = gl.createProgram()
    if (!program) {
      throw new Error('Unable to create WebGL program.')
    }

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(info ?? 'Program link error.')
    }

    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const texCoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(texCoordLocation)
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    const textureLocation = gl.getUniformLocation(program, 'u_texture')
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const textureSizeLocation = gl.getUniformLocation(program, 'u_textureDimensions')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const glitchLocation = gl.getUniformLocation(program, 'u_glitch')
    const outlineLocation = gl.getUniformLocation(program, 'u_outlineBoost')
    const fireLocation = gl.getUniformLocation(program, 'u_fireIntensity')
    const chromaticLocation = gl.getUniformLocation(program, 'u_effectChromatic')
    const invertLocation = gl.getUniformLocation(program, 'u_effectInvert')
    const scanlineLocation = gl.getUniformLocation(program, 'u_effectScanline')
    const pixelateLocation = gl.getUniformLocation(program, 'u_effectPixelate')
    const vignetteLocation = gl.getUniformLocation(program, 'u_effectVignette')
    const noiseLocation = gl.getUniformLocation(program, 'u_effectNoise')

    gl.uniform1i(textureLocation, 0)
    gl.clearColor(0, 0, 0, 1)

    const ensureSourceCanvas = () => {
      if (!sourceCanvasRef.current) {
        const offscreen = document.createElement('canvas')
        sourceCanvasRef.current = offscreen
        sourceCtxRef.current = offscreen.getContext('2d')
      }
    }

    ensureSourceCanvas()

    const resizeIfNeeded = () => {
      const dpr = window.devicePixelRatio || 1
      const displayWidth = Math.floor(canvas.clientWidth * dpr)
      const displayHeight = Math.floor(canvas.clientHeight * dpr)

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth
        canvas.height = displayHeight
      }
    }

    return {
      render: () => {
        if (!video.videoWidth || !video.videoHeight) return
        const sourceCanvas = sourceCanvasRef.current
        const sourceCtx = sourceCtxRef.current
        if (!sourceCanvas || !sourceCtx) return
        const toggles = effectsRef.current

        if (sourceCanvas.width !== video.videoWidth || sourceCanvas.height !== video.videoHeight) {
          sourceCanvas.width = video.videoWidth
          sourceCanvas.height = video.videoHeight
        }

        sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height)
        sourceCtx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height)

        const stage = viewerStageRef.current
        const floatingValue = floatingTextValueRef.current
        if (stage && floatingValue) {
          const stageWidth = Math.max(stage.clientWidth, 1)
          const stageHeight = Math.max(stage.clientHeight, 1)
          const ratioX = sourceCanvas.width / stageWidth
          const ratioY = sourceCanvas.height / stageHeight
          const fontPx = FLOATING_TEXT_BASE_SIZE * floatingTextScaleRef.current * ratioY
          const pos = floatingPositionRef.current
          const drawX = pos.x * ratioX
          const drawY = pos.y * ratioY

          sourceCtx.save()
          sourceCtx.font = `600 ${fontPx}px 'Space Grotesk', sans-serif`
          sourceCtx.textBaseline = 'top'
          const gradient = sourceCtx.createLinearGradient(
            drawX,
            drawY,
            drawX + floatingSizeRef.current.width * ratioX,
            drawY
          )
          const gradientPalette = Object.values(toggles).some(Boolean)
            ? ['#7cf1ff', '#ff2fb9', '#ffc45a']
            : ['#7cf1ff', '#ff2fb9']
          gradientPalette.forEach((color, idx) => {
            const position =
              gradientPalette.length === 1 ? 0 : idx / (gradientPalette.length - 1)
            gradient.addColorStop(position, color)
          })
          sourceCtx.fillStyle = gradient
          sourceCtx.shadowColor = 'rgba(124, 241, 255, 0.9)'
          sourceCtx.shadowBlur = 28 * ratioY
          sourceCtx.fillText(floatingValue, drawX, drawY)
          sourceCtx.restore()
        }

        resizeIfNeeded()
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGB,
          gl.RGB,
          gl.UNSIGNED_BYTE,
          sourceCanvasRef.current ?? video
        )

        const controls = controlsRef.current
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
        gl.uniform2f(textureSizeLocation, video.videoWidth, video.videoHeight)
        gl.uniform1f(timeLocation, performance.now() * 0.001)
        gl.uniform1f(glitchLocation, controls.glitch)
        gl.uniform1f(outlineLocation, controls.outlineBoost)
        gl.uniform1f(fireLocation, controls.fireIntensity)
        gl.uniform1f(chromaticLocation, toggles.chromatic ? 1 : 0)
        gl.uniform1f(invertLocation, toggles.invert ? 1 : 0)
        gl.uniform1f(scanlineLocation, toggles.scanline ? 1 : 0)
        gl.uniform1f(pixelateLocation, toggles.pixelate ? 1 : 0)
        gl.uniform1f(vignetteLocation, toggles.vignette ? 1 : 0)
        gl.uniform1f(noiseLocation, toggles.noise ? 1 : 0)

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      },
      dispose: () => {
        gl.deleteTexture(texture)
        if (positionBuffer) gl.deleteBuffer(positionBuffer)
        if (texCoordBuffer) gl.deleteBuffer(texCoordBuffer)
        gl.deleteProgram(program)
        sourceCanvasRef.current = null
        sourceCtxRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    let stream: MediaStream | null = null
    let mounted = true

    const connectCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMessage('Camera access is not supported in this browser.')
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        })

        video.srcObject = stream
        await video.play()

        if (!mounted) return

        pipelineRef.current = createNeonPipeline(canvas, video)
        setStatus('ready')

        const renderLoop = () => {
          pipelineRef.current?.render()
          frameRef.current = requestAnimationFrame(renderLoop)
        }

        renderLoop()
      } catch (err) {
        console.error(err)
        setStatus('error')
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to access the camera feed.'
        )
      }
    }

    connectCamera()

    return () => {
      mounted = false
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      pipelineRef.current?.dispose()
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [createNeonPipeline])

  return (
    <div className="app-shell">
      <div className="glow-grid" aria-hidden />
      <header className="hero">
        <div>
          <p className="eyebrow">Daniel Patino Project</p>
          <h1>
            Cyberpunk <span>Cam</span>
          </h1>
          <p className="lede">
            Real-time edge detection, neon outlining, and glitch-inspired visuals built
            for futuristic performances, art installations, and playful self-expression.
          </p>
        </div>
        {/* <div className="hero-meta">
          <p className="meta-label">Pipeline</p>
          <p className="meta-value">GPU accelerated</p>
          <p className="meta-label">Effect</p>
          <p className="meta-value">Neon trace</p>
        </div> */}
      </header>

      <main className="layout">
        <section className="viewer-card">
          <div className="viewer-header">
            <div>
              <p className="eyebrow small">live feed</p>
              <h2>Enjoy</h2>
            </div>
            <span className={`status-pill status-${status}`}>
              <span className="status-dot" />
              {statusCopy[status]}
            </span>
          </div>

          <div className="viewer-body">
            <div className="viewer-stage" ref={viewerStageRef}>
              <canvas ref={canvasRef} className="silhouette-canvas" />
              <video ref={videoRef} playsInline muted className="hidden-video" />
              {status !== 'ready' && (
                <div className="viewer-overlay">
                  <p>{statusCopy[status]}</p>
                  {status === 'pending' && <p className="hint">Grant camera access to continue.</p>}
                  {status === 'error' && <p className="hint">{errorMessage}</p>}
                </div>
              )}
            </div>

            <aside className="control-column">
              <div className="controls">
                <div className="control">
                  <label htmlFor="glitch">Glitch flow</label>
                  <input
                    id="glitch"
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.02}
                    value={glitch}
                    onChange={(event) => setGlitch(parseFloat(event.target.value))}
                  />
                  <span>{Math.round(glitch * 100)}%</span>
                </div>
                <div className="control">
                  <label htmlFor="outline">Outline boost</label>
                  <input
                    id="outline"
                    type="range"
                    min={0.8}
                    max={2.4}
                    step={0.1}
                    value={outlineBoost}
                    onChange={(event) => setOutlineBoost(parseFloat(event.target.value))}
                  />
                  <span>{outlineBoost.toFixed(1)}x</span>
                </div>
                <div className="control text-input">
                  <label htmlFor="floatingText">Floating text</label>
                  <input
                    id="floatingText"
                    type="text"
                    placeholder="Type a message"
                    value={floatingText}
                    onChange={(event) => setFloatingText(event.target.value)}
                  />
                  <span>{floatingText ? 'Displayed on feed' : 'Nothing shown yet'}</span>
                </div>
                <div className="control">
                  <label htmlFor="floatingTextSize">Text size</label>
                  <input
                    id="floatingTextSize"
                    type="range"
                    min={0.6}
                    max={2}
                    step={0.1}
                    value={floatingTextScale}
                    onChange={(event) => setFloatingTextScale(parseFloat(event.target.value))}
                  />
                  <span>{floatingTextScale.toFixed(1)}×</span>
                </div>
                <button
                  type="button"
                  className={`feature-toggle ${fireTrailEnabled ? 'active' : ''}`}
                  onClick={() => setFireTrailEnabled((prev) => !prev)}
                >
                  {fireTrailEnabled ? 'Disable fire trails' : 'Enable fire trails'}
                </button>
              </div>
            </aside>
          </div>

          <div className="info-panels">
            <div className="side-card">
              <p className="eyebrow small">usage tips</p>
              <p className="tip-copy">{cycleTips[tipIndex]?.label}</p>
              <div className="tip-dots">
                {cycleTips.map((tip, idx) => (
                  <button
                    key={tip.id}
                    className={idx === tipIndex ? 'active' : ''}
                    aria-label={`Show tip ${idx + 1}`}
                    onClick={() => setTipIndex(idx)}
                  />
                ))}
              </div>
            </div>

            <div className="side-card">
              <p className="eyebrow small">tech stack</p>
              <ul>
                <li>
                  <span>Frontend</span>
                  <span>React + Vite</span>
                </li>
                <li>
                  <span>Rendering</span>
                  <span>WebGL fragment shader</span>
                </li>
                <li>
                  <span>Processing</span>
                  <span>Sobel edge detection + glitch</span>
                </li>
              </ul>
            </div>

            <div className="side-card">
              <p className="eyebrow small">status</p>
              <ul>
                <li>
                  <span>FPS target</span>
                  <span>60hz</span>
                </li>
                <li>
                  <span>GPU mode</span>
                  <span>Adaptive</span>
                </li>
                <li>
                  <span>Latency</span>
                  <span>&lt; 30ms</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <aside className="effect-panel">
          <div className="effect-controls">
            <div className="effect-controls-header">
              <p className="eyebrow small">Stackable effects</p>
              <button
                type="button"
                className="effect-master"
                onClick={() => {
                  const shouldEnableAll = !Object.values(effects).every(Boolean)
                  const next = effectPresets.reduce<Record<EffectKey, boolean>>((acc, entry) => {
                    acc[entry.key] = shouldEnableAll
                    return acc
                  }, {} as Record<EffectKey, boolean>)
                  setEffects(next)
                }}
              >
                {Object.values(effects).every(Boolean) ? 'Disable all' : 'Enable all'}
              </button>
            </div>
            <div className="effect-grid">
              {effectPresets.map((effect) => (
                <button
                  key={effect.key}
                  type="button"
                  className={`effect-button ${effects[effect.key] ? 'active' : ''}`}
                  onClick={() =>
                    setEffects((current) => ({
                      ...current,
                      [effect.key]: !current[effect.key]
                    }))
                  }
                >
                  {effect.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
