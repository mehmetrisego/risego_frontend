/**
 * Light Rays Background - Vanilla JS/WebGL
 * Adapted from React Bits: https://reactbits.dev/backgrounds/light-rays
 * Volumetric light rays effect with mouse interaction
 */
(function () {
  'use strict';

  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
  };

  const getAnchorAndDir = (origin, w, h) => {
    const outside = 0.2;
    switch (origin) {
      case 'top-left':
        return { anchor: [0, -outside * h], dir: [0, 1] };
      case 'top-right':
        return { anchor: [w, -outside * h], dir: [0, 1] };
      case 'left':
        return { anchor: [-outside * w, 0.5 * h], dir: [1, 0] };
      case 'right':
        return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] };
      case 'bottom-left':
        return { anchor: [0, (1 + outside) * h], dir: [0, -1] };
      case 'bottom-center':
        return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
      case 'bottom-right':
        return { anchor: [w, (1 + outside) * h], dir: [0, -1] };
      default: // "top-center"
        return { anchor: [0.5 * w, -outside * h], dir: [0, 1] };
    }
  };

  const vertShader = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragShader = `
    precision highp float;

    uniform float iTime;
    uniform vec2 iResolution;
    uniform vec2 rayPos;
    uniform vec2 rayDir;
    uniform vec3 raysColor;
    uniform float raysSpeed;
    uniform float lightSpread;
    uniform float rayLength;
    uniform float pulsating;
    uniform float fadeDistance;
    uniform float saturation;
    uniform vec2 mousePos;
    uniform float mouseInfluence;
    uniform float noiseAmount;
    uniform float distortion;

    varying vec2 vUv;

    float noise(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
      float seedA, float seedB, float speed) {
      vec2 sourceToCoord = coord - raySource;
      vec2 dirNorm = normalize(sourceToCoord);
      float cosAngle = dot(dirNorm, rayRefDirection);

      float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;

      float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));

      float distance = length(sourceToCoord);
      float maxDistance = iResolution.x * rayLength;
      float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);

      float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
      float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;

      float baseStrength = clamp(
        (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
        (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
        0.0, 1.0
      );

      return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
    }

    void main() {
      vec2 coord = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);

      vec2 finalRayDir = rayDir;
      if (mouseInfluence > 0.0) {
        vec2 mouseScreenPos = mousePos * iResolution.xy;
        vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
        finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
      }

      vec4 rays1 = vec4(1.0) *
        rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
      vec4 rays2 = vec4(1.0) *
        rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);

      vec4 fragColor = rays1 * 0.5 + rays2 * 0.4;

      if (noiseAmount > 0.0) {
        float n = noise(coord * 0.01 + iTime * 0.1);
        fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
      }

      float brightness = 1.0 - (coord.y / iResolution.y);
      fragColor.x *= 0.1 + brightness * 0.8;
      fragColor.y *= 0.3 + brightness * 0.6;
      fragColor.z *= 0.5 + brightness * 0.5;

      if (saturation != 1.0) {
        float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
        fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
      }

      fragColor.rgb *= raysColor;
      gl_FragColor = fragColor;
    }
  `;

  function initLightRays(container, options) {
    options = options || {};
    const config = {
      raysOrigin: options.raysOrigin || 'top-center',
      raysColor: options.raysColor || '#6366f1',
      raysSpeed: options.raysSpeed || 1,
      lightSpread: options.lightSpread || 1,
      rayLength: options.rayLength || 2,
      pulsating: options.pulsating !== false,
      fadeDistance: options.fadeDistance || 1.0,
      saturation: options.saturation || 1.0,
      followMouse: options.followMouse !== false,
      mouseInfluence: options.mouseInfluence || 0.1,
      noiseAmount: options.noiseAmount || 0.0,
      distortion: options.distortion || 0.0
    };

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;-webkit-backface-visibility:hidden;backface-visibility:hidden;';
    container.appendChild(canvas);

    // Mobil uyumluluk: farklı WebGL context seçenekleri dene
    let gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) gl = canvas.getContext('webgl', { alpha: true });
    if (!gl) gl = canvas.getContext('experimental-webgl', { alpha: true });
    if (!gl) {
      container.classList.add('light-rays-fallback');
      return;
    }

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    const mouse = { x: 0.5, y: 0.5 };
    const smoothMouse = { x: 0.5, y: 0.5 };
    let animationId = null;

    function compileShader(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = compileShader(gl.VERTEX_SHADER, vertShader);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragShader);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    const positionLoc = gl.getAttribLocation(program, 'position');
    const uniforms = {
      iTime: gl.getUniformLocation(program, 'iTime'),
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      rayPos: gl.getUniformLocation(program, 'rayPos'),
      rayDir: gl.getUniformLocation(program, 'rayDir'),
      raysColor: gl.getUniformLocation(program, 'raysColor'),
      raysSpeed: gl.getUniformLocation(program, 'raysSpeed'),
      lightSpread: gl.getUniformLocation(program, 'lightSpread'),
      rayLength: gl.getUniformLocation(program, 'rayLength'),
      pulsating: gl.getUniformLocation(program, 'pulsating'),
      fadeDistance: gl.getUniformLocation(program, 'fadeDistance'),
      saturation: gl.getUniformLocation(program, 'saturation'),
      mousePos: gl.getUniformLocation(program, 'mousePos'),
      mouseInfluence: gl.getUniformLocation(program, 'mouseInfluence'),
      noiseAmount: gl.getUniformLocation(program, 'noiseAmount'),
      distortion: gl.getUniformLocation(program, 'distortion')
    };

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    function resize() {
      const w = Math.max(container.clientWidth || window.innerWidth, 1);
      const h = Math.max(container.clientHeight || window.innerHeight, 1);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }

    function updateUniforms(t) {
      const w = canvas.width;
      const h = canvas.height;
      const { anchor, dir } = getAnchorAndDir(config.raysOrigin, w, h);

      gl.uniform1f(uniforms.iTime, t * 0.001);
      gl.uniform2f(uniforms.iResolution, w, h);
      gl.uniform2fv(uniforms.rayPos, anchor);
      gl.uniform2fv(uniforms.rayDir, dir);
      gl.uniform3fv(uniforms.raysColor, hexToRgb(config.raysColor));
      gl.uniform1f(uniforms.raysSpeed, config.raysSpeed);
      gl.uniform1f(uniforms.lightSpread, config.lightSpread);
      gl.uniform1f(uniforms.rayLength, config.rayLength);
      gl.uniform1f(uniforms.pulsating, config.pulsating ? 1.0 : 0.0);
      gl.uniform1f(uniforms.fadeDistance, config.fadeDistance);
      gl.uniform1f(uniforms.saturation, config.saturation);
      gl.uniform2f(uniforms.mousePos, smoothMouse.x, smoothMouse.y);
      gl.uniform1f(uniforms.mouseInfluence, config.mouseInfluence);
      gl.uniform1f(uniforms.noiseAmount, config.noiseAmount);
      gl.uniform1f(uniforms.distortion, config.distortion);
    }

    function render(t) {
      if (config.followMouse && config.mouseInfluence > 0) {
        const smoothing = 0.92;
        smoothMouse.x = smoothMouse.x * smoothing + mouse.x * (1 - smoothing);
        smoothMouse.y = smoothMouse.y * smoothing + mouse.y * (1 - smoothing);
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      updateUniforms(t);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      animationId = requestAnimationFrame(render);
    }

    function handlePointerMove(e) {
      const rect = container.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      mouse.x = (clientX - rect.left) / rect.width;
      mouse.y = (clientY - rect.top) / rect.height;
    }

    resize();
    if (config.followMouse) {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('touchmove', handlePointerMove, { passive: true });
    }
    var orientationHandler = function () { setTimeout(resize, 100); };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', orientationHandler);
    animationId = requestAnimationFrame(render);

    return function destroy() {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', orientationHandler);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }

  function init() {
    const container = document.getElementById('lightRaysBg');
    if (!container) return;
    // Mobilde layout hazır olsun diye kısa gecikme
    function doInit() {
      initLightRays(container, {
        raysOrigin: 'top-center',
        raysColor: '#6366f1',
        raysSpeed: 0.25,
        lightSpread: 1,
        rayLength: 2,
        pulsating: true,
        fadeDistance: 1.0,
        saturation: 1.0,
        followMouse: true,
        mouseInfluence: 0.1,
        noiseAmount: 0,
        distortion: 0
      });
    }
    if (document.readyState === 'complete') {
      requestAnimationFrame(doInit);
    } else {
      window.addEventListener('load', function () { requestAnimationFrame(doInit); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
