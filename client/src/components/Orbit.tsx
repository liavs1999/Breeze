import { useEffect, useRef } from 'react';
import { orbit } from '../lib/orbit';

/**
 * The globe layer above the sky: a WebGL canvas, the labels over it and the cloud veil the camera
 * dives through. The 3D code loads on its own (it is large); without WebGL the layer stays empty and
 * the living sky behind it is the whole background.
 */
export function Orbit() {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let engine: { dispose: () => void } | null = null;
    if (!webglAvailable()) {
      orbit.setGlobe(false);
      return;
    }
    orbit.setGlobe(true);
    import('./orbitEngine')
      .then(({ createOrbitEngine }) => {
        if (disposed) return;
        engine = createOrbitEngine({ host: host.current!, labels: labels.current!, veil: veil.current! });
      })
      .catch(() => orbit.setGlobe(false));
    return () => {
      disposed = true;
      engine?.dispose();
    };
  }, []);

  return (
    <>
      <div ref={host} className="orbit" aria-hidden>
        <div ref={labels} className="orbit-labels" />
      </div>
      <div ref={veil} className="orbit-veil" aria-hidden />
    </>
  );
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
