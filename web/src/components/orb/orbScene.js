import * as THREE from "three";
import gsap from "gsap";
import {
  orbVertex,
  orbFragment,
  glowVertex,
  glowFragment,
  particleVertex,
  particleFragment,
} from "./shaders.js";

/*
  The glowing orb, built with Three.js (a library for 3D graphics in the browser).

  What is in the scene:
    - the ORB      a sphere whose surface is pushed around by noise (see shaders.js)
    - the GLOW     a soft light behind it
    - two RINGS    thin gold lines circling it
    - PARTICLES    a few dozen drifting specks of light
    - a SHOCKWAVE  an expanding ring, shown when a question is sent

  Everything that changes over time lives in the `params` object below.
  GSAP animates those numbers; every frame we copy them into the shaders.
*/

const SIZE = 420; // drawing size in pixels (the page scales it up or down)
const HERO_Z = 5.4; // camera distance in the big state (smaller = orb looks bigger)
const COMPACT_Z = 3.7; // camera distance in the small indicator state
const REST_AMP = 0.1; // how bumpy the surface is once it has settled

export function createOrbScene(canvas, { reducedMotion = false, lowPower = false } = {}) {
  // ---------- renderer, camera, scene ----------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowPower,
    alpha: true, // transparent background: the page shows through
  });
  const maxRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5);
  renderer.setPixelRatio(maxRatio);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.z = HERO_Z;

  // ---------- the numbers that GSAP animates ----------
  const params = {
    reveal: 0, // 0 = not there yet, 1 = fully formed
    amp: 0.4, // surface bulge (starts big, settles down to REST_AMP)
    energy: 0.25, // calm .. excited
    thinking: 0, // 1 while waiting for an answer
    pulse: 0, // ripple when a question is sent
    compact: 0, // 0 = big hero orb, 1 = small indicator
    spin: 0.12, // rotation speed
  };

  // ---------- the orb ----------
  const orbUniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.2 },
    uEnergy: { value: 0.25 },
    uThinking: { value: 0 },
    uPulse: { value: 0 },
    uReveal: { value: 0 },
    uLight: { value: new THREE.Vector3(-0.5, 0.6, 0.7) },
  };
  const orbMaterial = new THREE.ShaderMaterial({
    vertexShader: orbVertex,
    fragmentShader: orbFragment,
    uniforms: orbUniforms,
    transparent: true,
  });
  const orbGeometry = new THREE.IcosahedronGeometry(1, lowPower ? 20 : 32);
  const orb = new THREE.Mesh(orbGeometry, orbMaterial);
  const orbGroup = new THREE.Group();
  orbGroup.add(orb);
  scene.add(orbGroup);

  // ---------- the glow behind it ----------
  const glowUniforms = { uIntensity: { value: 0 }, uTime: { value: 0 } };
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 6.4),
    new THREE.ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      uniforms: glowUniforms,
      transparent: true,
      depthWrite: false,
      // Add light to whatever is behind the canvas (the page), but leave the
      // canvas's alpha alone. With the default additive blending the glow also
      // wrote alpha, which dimmed the page behind it and left a visible box.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    })
  );
  glow.position.z = -1.2;
  scene.add(glow);

  // ---------- two thin rings ----------
  const ringsGroup = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xbd8a38,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringA = new THREE.Mesh(new THREE.RingGeometry(1.36, 1.372, 160), ringMaterial);
  ringA.rotation.x = 1.2;
  ringA.rotation.y = 0.3;

  // the second ring is dashed, which looks like a fine engraved line
  const dashPoints = [];
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    dashPoints.push(new THREE.Vector3(Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0));
  }
  const dashGeometry = new THREE.BufferGeometry().setFromPoints(dashPoints);
  const dashMaterial = new THREE.LineDashedMaterial({
    color: 0xe0bf72,
    dashSize: 0.06,
    gapSize: 0.06,
    transparent: true,
    opacity: 0,
  });
  const ringB = new THREE.Line(dashGeometry, dashMaterial);
  ringB.computeLineDistances();
  ringB.rotation.x = 1.0;
  ringB.rotation.y = -0.6;

  ringsGroup.add(ringA, ringB);
  scene.add(ringsGroup);

  // ---------- the shockwave ring (sent question) ----------
  const shockMaterial = new THREE.MeshBasicMaterial({
    color: 0xf0a13a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shock = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.02, 128), shockMaterial);
  scene.add(shock);

  // ---------- particles ----------
  const count = lowPower ? 50 : 100;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // a random point in a shell around the orb
    const radius = 1.3 + Math.random() * 0.8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) * 0.8;
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    seeds[i] = Math.random();
    sizes[i] = 1.2 + Math.random() * 2.2;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const particleUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: maxRatio },
    uSpeed: { value: 0.35 },
    uAlpha: { value: 0 },
  };
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: particleUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(particles);

  // ---------- pointer: tiny parallax and light movement ----------
  const pointerTarget = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  function onPointerMove(event) {
    // from -1 (left/top) to +1 (right/bottom) across the window
    pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = (event.clientY / window.innerHeight) * 2 - 1;
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ---------- drawing one frame ----------
  let spinAngle = 0.6;
  let lastTime = null;
  const ease = (x) => 1 - Math.pow(1 - x, 3); // fast start, gentle finish

  function frame(seconds, dt) {
    // smooth the pointer so the orb eases toward it
    pointer.x += (pointerTarget.x - pointer.x) * 0.06;
    pointer.y += (pointerTarget.y - pointer.y) * 0.06;

    const hero = 1 - params.compact; // 1 in the big state, 0 in the small one
    const reveal = ease(Math.min(Math.max(params.reveal, 0), 1));

    spinAngle += dt * params.spin;
    orbGroup.rotation.y = spinAngle;
    orbGroup.rotation.x = pointer.y * 0.22 * (0.3 + 0.7 * hero);
    orbGroup.position.x = pointer.x * 0.18 * hero;
    orbGroup.position.y = -pointer.y * 0.1 * hero;
    orbGroup.scale.setScalar(0.3 + 0.7 * reveal);

    // light follows the pointer a little
    orbUniforms.uLight.value.set(-0.5 + pointer.x * 0.9, 0.6 - pointer.y * 0.7, 0.75);

    orbUniforms.uTime.value = seconds;
    orbUniforms.uAmp.value = params.amp * (1 - 0.3 * params.compact);
    orbUniforms.uEnergy.value = params.energy;
    orbUniforms.uThinking.value = params.thinking;
    orbUniforms.uPulse.value = params.pulse;
    orbUniforms.uReveal.value = reveal;

    // glow
    glowUniforms.uIntensity.value = reveal * (0.55 + params.energy * 0.45 + params.pulse * 0.4) * (0.35 + 0.65 * hero);
    glow.position.x = orbGroup.position.x * 0.6;
    glow.position.y = orbGroup.position.y * 0.6;

    // rings and particles only show in the big state
    ringsGroup.rotation.z += dt * 0.12;
    ringsGroup.scale.setScalar(0.6 + 0.4 * reveal + params.pulse * 0.08);
    ringMaterial.opacity = reveal * hero * (0.3 + params.energy * 0.3);
    dashMaterial.opacity = reveal * hero * (0.25 + params.energy * 0.3);

    particleUniforms.uTime.value = seconds;
    particleUniforms.uSpeed.value = 0.35 + params.thinking * 0.9;
    particleUniforms.uAlpha.value = reveal * hero * (0.45 + params.energy * 0.4);

    // closer camera when small, so the orb fills its tiny space
    camera.position.z = THREE.MathUtils.lerp(HERO_Z, COMPACT_Z, params.compact);

    // Keep the glow's size matched to what the camera can see, so its soft
    // edge always stays inside the canvas (in the big state and the small one).
    glow.scale.setScalar((camera.position.z - glow.position.z) / (HERO_Z - glow.position.z));

    renderer.render(scene, camera);
  }

  function loop(timeMs) {
    const seconds = timeMs / 1000;
    const dt = lastTime === null ? 0.016 : Math.min(seconds - lastTime, 0.05);
    lastTime = seconds;
    frame(seconds, dt);
  }

  // With reduced motion we draw single still frames instead of a loop.
  const STILL_TIME = 2.0;
  function drawStill() {
    frame(STILL_TIME, 0);
  }

  if (reducedMotion) {
    params.reveal = 1;
    params.amp = REST_AMP;
    drawStill();
  } else {
    renderer.setAnimationLoop(loop);
  }

  // ---------- controls used by Orb.jsx ----------
  const states = {
    idle: { energy: 0.25, thinking: 0, spin: 0.12 },
    focus: { energy: 0.6, thinking: 0, spin: 0.2 },
    thinking: { energy: 1, thinking: 1, spin: 0.5 },
  };

  return {
    params, // exposed so developers can inspect the animation values

    // The orb forms into view: it grows, brightens and its surface calms down.
    intro() {
      if (reducedMotion) return;
      gsap.to(params, { reveal: 1, duration: 2.4, ease: "power2.out" });
      gsap.to(params, { amp: REST_AMP, duration: 2.8, ease: "power3.out" });
    },

    // "idle" | "focus" | "thinking"
    setState(name) {
      const target = states[name] || states.idle;
      if (reducedMotion) {
        Object.assign(params, target);
        drawStill();
        return;
      }
      gsap.to(params, { ...target, duration: 0.9, ease: "power2.out", overwrite: "auto" });
    },

    // A burst of light: a ripple across the surface and an expanding ring.
    pulse(strength = 1) {
      if (reducedMotion) return;
      gsap
        .timeline()
        .to(params, { pulse: strength, duration: 0.18, ease: "power2.out" })
        .to(params, { pulse: 0, duration: 1.1, ease: "power3.out" });

      shock.scale.set(1.05, 1.05, 1);
      shockMaterial.opacity = 0.55 * strength;
      gsap.to(shock.scale, { x: 2.5, y: 2.5, duration: 1.2, ease: "power2.out" });
      gsap.to(shockMaterial, { opacity: 0, duration: 1.2, ease: "power1.out" });
    },

    // "hero" = big and central, "chat" = small indicator
    setMode(mode, animate = true) {
      const compact = mode === "chat" ? 1 : 0;
      if (compact === 0) renderer.setPixelRatio(maxRatio); // sharp again before growing
      if (reducedMotion || !animate) {
        params.compact = compact;
        if (compact === 1) renderer.setPixelRatio(0.6);
        if (reducedMotion) drawStill();
        return;
      }
      gsap.to(params, {
        compact,
        duration: 1,
        ease: "power3.inOut",
        overwrite: "auto",
        // the small orb needs far fewer pixels: saves work on the graphics card
        onComplete: () => {
          if (compact === 1) renderer.setPixelRatio(0.6);
        },
      });
    },

    // Used only by developers to draw a frame at a chosen time.
    renderAt(seconds) {
      frame(seconds, 0.016);
    },

    onContextLost(callback) {
      canvas.addEventListener("webglcontextlost", callback, { once: true });
    },

    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("pointermove", onPointerMove);
      gsap.killTweensOf(params);
      gsap.killTweensOf(shock.scale);
      gsap.killTweensOf(shockMaterial);
      orbGeometry.dispose();
      orbMaterial.dispose();
      glow.geometry.dispose();
      glow.material.dispose();
      ringA.geometry.dispose();
      ringMaterial.dispose();
      dashGeometry.dispose();
      dashMaterial.dispose();
      shock.geometry.dispose();
      shockMaterial.dispose();
      particleGeometry.dispose();
      particles.material.dispose();
      renderer.dispose();
    },
  };
}
