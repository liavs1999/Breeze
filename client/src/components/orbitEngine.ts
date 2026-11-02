import * as THREE from 'three';
import { subsolarPoint, worldTemperatures, type GlobePlace } from '../lib/geo';
import { later, orbit, orbitNow, type Stage } from '../lib/orbit';
import { temperatureColor } from '../charts/temperatureColors';

/**
 * The Earth from space: day and night textures split by the real terminator, city lights on the
 * night side, ocean glint, a cloud shell and a thin atmosphere at the rim, on a field of stars.
 * The camera follows the orbit store: a slow spin in orbit, a searching drift, an approach to the
 * places of the question (with arcs between several), then a dive through the clouds into the sky.
 */

const HOME_TILT = 0.36; // radians: a little of the northern hemisphere, where most cities are
const DEG = Math.PI / 180;

export interface OrbitDom {
  host: HTMLElement;
  labels: HTMLElement;
  veil: HTMLElement;
}

interface Pose {
  dist: number;
  ry: number;
  rx: number;
  fov: number;
}

interface Tween {
  from: Pose;
  to: Partial<Pose>;
  start: number;
  duration: number;
  ease: (t: number) => number;
  onUpdate?: (t: number) => void;
  done?: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 4;
/** Starts moving at once, then keeps accelerating to the surface. */
const easeInDive = (t: number) => 0.35 * t + 0.65 * t * t * t;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** A unit vector on the globe for a latitude and longitude, matching three's sphere UV layout. */
function toVec(lat: number, lon: number, r = 1): THREE.Vector3 {
  const theta = (90 - lat) * DEG;
  const phi = (lon + 180) * DEG;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r);
}

/** The globe rotation that brings a place to the middle of the view. */
function aim(lat: number, lon: number): { ry: number; rx: number } {
  const v = toVec(lat, lon);
  return { ry: -Math.atan2(v.x, v.z), rx: Math.max(-1.1, Math.min(1.1, lat * DEG)) };
}

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vObjNormal;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vObjNormal = normal;
    vNormalView = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  uniform vec3 sunView;
  varying vec2 vUv;
  varying vec3 vObjNormal;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  void main() {
    vec3 n = normalize(vObjNormal);
    float ndl = dot(n, sunDir);
    float dayMix = smoothstep(-0.12, 0.16, ndl);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float diffuse = clamp(ndl * 1.15 + 0.08, 0.0, 1.0);
    vec3 lit = day * (0.04 + 1.08 * diffuse);
    vec3 N = normalize(vNormalView);
    vec3 V = normalize(-vViewPos);
    vec3 H = normalize(normalize(sunView) + V);
    float ocean = smoothstep(0.03, 0.14, day.b - day.r) * (1.0 - smoothstep(0.3, 0.55, day.g));
    float glint = pow(max(dot(N, H), 0.0), 70.0) * ocean;
    lit += vec3(1.0, 0.93, 0.8) * glint * 0.75 * dayMix;
    vec3 lights = pow(night, vec3(1.7)) * vec3(1.0, 0.76, 0.45) * 3.2;
    vec3 col = mix(lights + day * 0.015, lit, dayMix);
    float twilight = exp(-pow((ndl - 0.02) * 8.0, 2.0));
    col += vec3(1.0, 0.4, 0.14) * twilight * 0.16;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    col += vec3(0.3, 0.58, 1.0) * fres * (0.08 + 0.9 * smoothstep(-0.25, 0.45, ndl));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vObjNormal;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  void main() {
    float c = texture2D(cloudMap, vUv).r;
    float ndl = dot(normalize(vObjNormal), sunDir);
    float light = smoothstep(-0.18, 0.35, ndl);
    vec3 col = mix(vec3(0.04, 0.06, 0.1), vec3(1.0), light);
    float a = smoothstep(0.12, 0.9, c) * (0.18 + 0.72 * light);
    gl_FragColor = vec4(col, a);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vNormalWorld;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 sunWorld;
  uniform float strength;
  varying vec3 vNormalView;
  varying vec3 vNormalWorld;
  void main() {
    // Back faces of the shell: brightest just outside the planet's limb, nothing at the shell's edge.
    float i = pow(clamp(-vNormalView.z / 0.34, 0.0, 1.0), 3.0);
    float lit = 0.18 + 0.82 * smoothstep(-0.35, 0.5, dot(-vNormalWorld, sunWorld));
    gl_FragColor = vec4(vec3(0.32, 0.6, 1.0) * i * lit * strength, 1.0);
  }
`;

export function createOrbitEngine(dom: OrbitDom) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('No WebGL');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x02040a, 1);
  const canvas = renderer.domElement;
  canvas.className = 'orbit-canvas';
  dom.host.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 400);
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  tilt.add(spin);
  scene.add(tilt);

  // ── Textures ──
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let loaded = 0;
  const texture = (url: string) =>
    loader.load(url, (t) => {
      t.anisotropy = Math.min(8, maxAniso);
      t.needsUpdate = true;
      loaded++;
      if (loaded === 3) onReady();
    });
  const dayMap = texture('/earth/day.jpg');
  const nightMap = texture('/earth/night.jpg');
  const cloudMap = texture('/earth/clouds.jpg');

  // ── Earth, clouds, atmosphere ──
  const sunObj = new THREE.Vector3();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: dayMap }, nightMap: { value: nightMap }, sunDir: { value: sunObj }, sunView: { value: new THREE.Vector3() } },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), earthMat);
  spin.add(earth);

  const cloudSun = new THREE.Vector3();
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { cloudMap: { value: cloudMap }, sunDir: { value: cloudSun } },
    vertexShader: EARTH_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.009, 96, 48), cloudMat);
  spin.add(clouds);

  const sunWorld = new THREE.Vector3();
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sunWorld: { value: sunWorld }, strength: { value: 1.25 } },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 48), atmoMat);
  scene.add(atmosphere);

  // ── Stars ──
  {
    const count = 2200;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(a) * 120, u * 120, s * Math.sin(a) * 120], i * 3);
      const b = 0.35 + rnd() ** 3 * 0.65;
      const warm = rnd();
      col.set([b * (0.85 + warm * 0.15), b * 0.92, b * (1.05 - warm * 0.2)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 })));
  }

  // ── Places of the question: arcs between them ──
  const arcs: { mesh: THREE.Mesh; total: number; born: number }[] = [];
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  function addArc(a: GlobePlace, b: GlobePlace) {
    const va = toVec(a.lat, a.lon);
    const vb = toVec(b.lat, b.lon);
    const angle = va.angleTo(vb);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const p = new THREE.Vector3().copy(va).lerp(vb, t).normalize();
      pts.push(p.multiplyScalar(1.012 + Math.sin(Math.PI * t) * angle * 0.22));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.0045, 6, false);
    const total = geo.index ? geo.index.count : 0;
    geo.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(geo, arcMat);
    spin.add(mesh);
    arcs.push({ mesh, total, born: orbitNow() });
  }
  function clearArcs() {
    for (const a of arcs) {
      spin.remove(a.mesh);
      a.mesh.geometry.dispose();
    }
    arcs.length = 0;
  }

  // ── Labels (HTML over the canvas): city temperatures and the places of the question ──
  interface Label {
    el: HTMLElement;
    vec: THREE.Vector3;
    kind: 'city' | 'place';
    width: number;
  }
  const labels: Label[] = [];
  function addCityLabels(cities: { name: string; lat: number; lon: number; temperature: number }[]) {
    for (const c of cities) {
      const el = document.createElement('div');
      el.className = 'globe-city';
      const color = temperatureColor(c.temperature);
      el.style.setProperty('--dot', color);
      el.innerHTML = `<i></i><span>${c.name} <b>${Math.round(c.temperature)}°</b></span>`;
      dom.labels.appendChild(el);
      labels.push({ el, vec: toVec(c.lat, c.lon, 1.012), kind: 'city', width: 0 });
    }
  }
  function addPlaceLabel(p: GlobePlace) {
    const el = document.createElement('div');
    el.className = 'globe-place';
    el.innerHTML = `<i></i><span></span>`;
    el.querySelector('span')!.textContent = p.name;
    dom.labels.appendChild(el);
    labels.push({ el, vec: toVec(p.lat, p.lon, 1.012), kind: 'place', width: 0 });
  }
  function clearPlaceLabels() {
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].kind === 'place') {
        labels[i].el.remove();
        labels.splice(i, 1);
      }
    }
  }
  void worldTemperatures().then((cities) => cities && addCityLabels(cities));

  // ── Camera state ──
  const userLon = -new Date().getTimezoneOffset() / 4; // minutes → degrees, roughly where the viewer is
  const startAim = aim(28, userLon);
  const pose: Pose = { dist: 5, ry: startAim.ry, rx: HOME_TILT, fov: 35 };
  let tween: Tween | null = null;
  let spinSpeed = 0.035;
  let spinTarget = 0.035;
  let homeDist = 5;
  let width = 1;
  let height = 1;
  let stage: Stage = orbit.get().stage;
  let started = false;
  let visible = stage !== 'sky';

  function layout() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    camera.aspect = width / height;
    // The globe takes about two thirds of the height, never more than 88% of the width, and sits low.
    const tanV = Math.tan((35 / 2) * DEG);
    const kV = 0.66 * tanV;
    const kH = 0.88 * tanV * camera.aspect;
    homeDist = 1 / Math.sin(Math.atan(Math.min(kV, kH)));
    camera.setViewOffset(width, height, 0, -height * 0.06, width, height);
    camera.updateProjectionMatrix();
  }
  layout();
  pose.dist = homeDist;

  function animateTo(to: Partial<Pose>, duration: number, ease: Tween['ease'], extra?: Pick<Tween, 'onUpdate' | 'done'>) {
    const from = { ...pose };
    if (to.ry != null) to = { ...to, ry: pose.ry + wrap(to.ry - pose.ry) };
    tween = { from, to, start: orbitNow(), duration, ease, ...extra };
    wake();
  }

  function setVisible(v: boolean, fade = true) {
    visible = v;
    canvas.style.transition = fade ? 'opacity 0.9s ease' : 'none';
    dom.labels.style.transition = canvas.style.transition;
    canvas.style.opacity = v ? '1' : '0';
    dom.labels.style.opacity = v ? '1' : '0';
    if (v) wake();
  }

  function veil(opacity: number, scale = 1, transition = 'none') {
    dom.veil.style.transition = transition;
    dom.veil.style.opacity = String(opacity);
    dom.veil.style.transform = `scale(${scale})`;
  }

  // ── Stage changes ──
  let lastPlaces: GlobePlace[] = [];
  let approachEnds = 0;
  function onStage() {
    const s = orbit.get();
    const prev = stage;
    stage = s.stage;
    dom.host.dataset.stage = stage;
    const still = s.instant || reducedMotion();

    if (stage === 'orbit') {
      clearArcs();
      clearPlaceLabels();
      spinTarget = 0.035;
      if (!started) return; // the opening runs once the textures are in
      if (prev === 'sky' && !still) {
        // Fly back out: from just above the last place, up through the clouds, to orbit.
        const at = lastPlaces[0];
        if (at) Object.assign(pose, aim(at.lat, at.lon));
        pose.dist = 1.18;
        pose.fov = 62;
        tween = null;
        setVisible(true, false);
        veil(1, 1.4);
        requestAnimationFrame(() => veil(0, 1, 'opacity 0.9s ease, transform 1.2s ease'));
        animateTo({ dist: homeDist, rx: HOME_TILT, fov: 35 }, 2600, easeOut);
      } else {
        tween = null;
        Object.assign(pose, { dist: homeDist, rx: HOME_TILT, fov: 35 });
        veil(0);
        setVisible(true, !s.instant);
      }
      return;
    }
    if (stage === 'search') {
      setVisible(true);
      spinTarget = 0.28;
      animateTo({ dist: homeDist * 0.86, rx: 0.3 }, 1600, easeInOut);
      return;
    }
    if (stage === 'approach') {
      spinTarget = 0;
      const places = s.places;
      places.forEach((p, i) => {
        if (lastPlaces.includes(p)) return;
        addPlaceLabel(p);
        if (i > 0) addArc(places[i - 1], p);
      });
      lastPlaces = places;
      approachEnds = orbitNow() + 1500;
      if (places.length === 1) {
        animateTo({ ...aim(places[0].lat, places[0].lon), dist: homeDist * 0.58 }, 1500, easeInOut);
      } else {
        // Frame all of them: aim at their middle, back off with their spread.
        const mid = places.reduce((v, p) => v.add(toVec(p.lat, p.lon)), new THREE.Vector3()).normalize();
        const lat = 90 - Math.acos(mid.y) / DEG;
        const lon = Math.atan2(mid.z, -mid.x) / DEG - 180;
        const spread = Math.max(...places.map((p) => toVec(p.lat, p.lon).angleTo(mid)));
        animateTo({ ...aim(lat, lon), dist: Math.min(homeDist, 1.9 + spread * 3.2) }, 1500, easeInOut);
      }
      return;
    }
    if (stage === 'dive') {
      spinTarget = 0;
      const target = s.places[0];
      lastPlaces = s.places;
      if (!target || still) {
        setVisible(false);
        orbit.arrive();
        return;
      }
      const target_ = aim(target.lat, target.lon);
      // The plunge: straight down, accelerating, the view widening; the clouds close in over the last
      // stretch, then the canvas gives way to the place's own sky.
      const plunge = () =>
        animateTo({ ry: target_.ry + 0.12, rx: target_.rx, dist: 1.025, fov: 78 }, 2100, easeInDive, {
          onUpdate: (t) => {
            veil(smooth(0.66, 0.95, t), 1 + t * 0.6);
            dom.labels.style.opacity = String(1 - smooth(0.15, 0.5, t));
          },
          done: () => {
            setVisible(false, false);
            orbit.arrive();
            veil(0, 1.3, 'opacity 1.1s ease 0.1s, transform 1.5s ease');
          },
        });
      // Let the approach finish first.
      const wait = Math.max(0, approachEnds - orbitNow());
      later(() => {
        if (orbit.get().stage !== 'dive') return;
        // A comparison holds a moment on its lit arcs; the plunge then swoops onto the first place.
        if (s.places.length > 1) later(() => orbit.get().stage === 'dive' && plunge(), 900);
        else plunge();
      }, wait);
      return;
    }
    // sky
    tween = null;
    if (prev === 'dive') return;
    veil(0, 1, 'opacity 0.6s ease');
    setVisible(false, !s.instant);
  }
  const unsubscribe = orbit.subscribe(onStage);

  function onReady() {
    // Upload the textures and compile the shaders first, so the opening does not stutter on them.
    for (const t of [dayMap, nightMap, cloudMap]) renderer.initTexture(t);
    renderer.compile(scene, camera);
    requestAnimationFrame(() => requestAnimationFrame(begin));
  }
  function begin() {
    started = true;
    stage = orbit.get().stage;
    dom.host.dataset.stage = stage;
    if (stage === 'orbit') {
      // The opening: the planet arrives out of the dark and settles into its slow turn.
      if (!reducedMotion()) {
        pose.dist = homeDist * 2.6;
        pose.ry -= 1.1;
        pose.rx = HOME_TILT + 0.25;
        animateTo({ dist: homeDist, ry: pose.ry + 1.1, rx: HOME_TILT }, 2600, easeOut);
      }
      setVisible(true);
    } else setVisible(stage !== 'sky', false);
    wake();
  }
  canvas.style.opacity = '0';
  dom.labels.style.opacity = '0';

  // ── Frame loop (stops while hidden or in the sky) ──
  let raf = 0;
  let last = orbitNow();
  const tmp = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const sunTmp = new THREE.Vector3();

  function frame() {
    raf = 0;
    const now = orbitNow();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.duration);
      const k = tween.ease(t);
      for (const key of Object.keys(tween.to) as (keyof Pose)[]) {
        // Distance moves in log space, so a zoom feels even (and a dive keeps accelerating to the end).
        pose[key] =
          key === 'dist'
            ? Math.exp(Math.log(tween.from.dist) + (Math.log(tween.to.dist!) - Math.log(tween.from.dist)) * k)
            : tween.from[key] + (tween.to[key]! - tween.from[key]) * k;
      }
      tween.onUpdate?.(t);
      if (t >= 1) {
        const done = tween.done;
        tween = null;
        done?.();
      }
    } else {
      spinSpeed += (spinTarget - spinSpeed) * Math.min(1, dt * 1.5);
      pose.ry += spinSpeed * dt;
    }

    tilt.rotation.x = pose.rx;
    spin.rotation.y = pose.ry;
    clouds.rotation.y += dt * 0.006;
    camera.position.set(0, 0, pose.dist);
    camera.lookAt(0, 0, 0);
    if (Math.abs(camera.fov - pose.fov) > 0.01) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();

    // Sun: object space for the earth, the clouds' own rotation, world and view space for glint and rim.
    const ss = subsolarPoint();
    sunObj.copy(toVec(ss.lat, ss.lon));
    cloudSun.copy(sunObj).applyAxisAngle(new THREE.Vector3(0, 1, 0), -clouds.rotation.y);
    sunWorld.copy(sunObj).transformDirection(spin.matrixWorld);
    earthMat.uniforms.sunView.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);

    // Arcs draw themselves.
    for (const a of arcs) {
      const k = easeInOut(Math.min(1, (now - a.born) / 1100));
      a.mesh.geometry.setDrawRange(0, Math.floor((a.total * k) / 3) * 3);
    }

    // Labels: on the near side only, fading toward the limb; city names only where there is room.
    camDir.copy(camera.position).normalize();
    const placed: [number, number, number][] = [];
    const showCities = stage === 'orbit' || stage === 'search';
    const order = labels
      .map((l) => {
        tmp.copy(l.vec).applyMatrix4(spin.matrixWorld);
        const facing = tmp.clone().normalize().dot(sunTmp.copy(camera.position).sub(tmp).normalize());
        return { l, facing, p: tmp.clone() };
      })
      .sort((a, b) => (a.l.kind === b.l.kind ? b.facing - a.facing : a.l.kind === 'place' ? -1 : 1));
    for (const { l, facing, p } of order) {
      const shown = l.kind === 'place' ? stage === 'approach' || stage === 'dive' : showCities;
      const alpha = shown ? smooth(0.12, 0.42, facing) : 0;
      if (alpha <= 0.01) {
        l.el.style.opacity = '0';
        continue;
      }
      p.project(camera);
      const x = (p.x * 0.5 + 0.5) * width;
      const y = (-p.y * 0.5 + 0.5) * height;
      if (!l.width) l.width = l.el.offsetWidth || 80;
      const w = l.width;
      const fits = x + w < width - 8;
      const roomy = l.kind === 'place' || (facing > 0.5 && fits && !placed.some(([px, py, pw]) => Math.abs(px - x) < (pw + w) / 2 + 6 && Math.abs(py - y) < 18));
      if (roomy) placed.push([x + w / 2 - 6, y, w]);
      l.el.classList.toggle('named', roomy);
      l.el.style.opacity = String(alpha);
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }

    renderer.render(scene, camera);
    if (shouldRun()) raf = requestAnimationFrame(frame);
  }

  function shouldRun() {
    return started && !document.hidden && (visible || tween != null);
  }
  function wake() {
    if (!raf && shouldRun()) {
      last = orbitNow();
      raf = requestAnimationFrame(frame);
    }
  }
  const onVisibility = () => wake();
  document.addEventListener('visibilitychange', onVisibility);
  const onResize = () => {
    layout();
    if (stage === 'orbit' && !tween) pose.dist = homeDist;
    wake();
  };
  window.addEventListener('resize', onResize);
  onStage();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      clearArcs();
      for (const l of labels) l.el.remove();
      renderer.dispose();
      canvas.remove();
    },
  };
}
