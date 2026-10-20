'use client';

import {useEffect, useRef} from 'react';

type Capsule = {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  angle: number;
  length: number;
  width: number;
  phase: number;
  light: number;
  color: string;
};

const colors = ['#bf4441', '#926d68', '#715e59'];
const frameInterval = 1000 / 24;

function smoothstep(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export default function CursorRingField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', {alpha: true});
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(any-pointer: fine)');
    let capsules: Capsule[] = [];
    let width = 1, height = 1, frame = 0, lastDraw = 0;
    let pointerX = 0, pointerY = 0, centerX = 0, centerY = 0;
    let active = false, strength = 0;

    function enabled() {
      return !document.hidden && !reducedMotion.matches && finePointer.matches;
    }

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastDraw = 0;
    }

    function start() {
      if (enabled() && !frame) frame = requestAnimationFrame(animate);
    }

    function draw(time: number, step: number) {
      if (!context) return false;
      context.clearRect(0, 0, width, height);
      context.lineCap = 'round';
      const seconds = time / 1000;
      const radius = Math.min(190, Math.max(125, Math.min(width, height) * .22));
      const memory = Math.pow(.8, step);
      for (const capsule of capsules) {
        const homeX = capsule.x * width + Math.sin(seconds * .12 + capsule.phase) * 12;
        const homeY = capsule.y * height + Math.cos(seconds * .09 + capsule.phase) * 9;
        const dx = homeX - centerX, dy = homeY - centerY;
        const distance = Math.hypot(dx, dy);
        // Measure from the home position so the ring stays circular as points move.
        const band = (1 - smoothstep(12, 52, Math.abs(distance - radius))) * strength;
        const push = band * (19 + 5 * Math.sin(seconds * .65 + capsule.phase));
        const directionX = distance > .001 ? dx / distance : 0;
        const directionY = distance > .001 ? dy / distance : 0;
        capsule.offsetX = capsule.offsetX * memory + directionX * push * (1 - memory);
        capsule.offsetY = capsule.offsetY * memory + directionY * push * (1 - memory);
        capsule.light = capsule.light * memory + band * (1 - memory);

        const towardRing = Math.atan2(dy, dx) + Math.sin(capsule.phase) * .4;
        const angleDifference = Math.atan2(Math.sin(towardRing - capsule.angle), Math.cos(towardRing - capsule.angle));
        const angle = capsule.angle + angleDifference * capsule.light;
        const halfLength = capsule.length * (.25 + capsule.light * .85) / 2;
        const x = homeX + capsule.offsetX, y = homeY + capsule.offsetY;
        const alongX = Math.cos(angle) * halfLength, alongY = Math.sin(angle) * halfLength;

        context.strokeStyle = capsule.color;
        context.globalAlpha = .1 + .025 * Math.sin(seconds * .3 + capsule.phase) + capsule.light * .7;
        context.lineWidth = capsule.width + capsule.light * .8;
        context.beginPath();
        context.moveTo(x - alongX, y - alongY);
        context.lineTo(x + alongX, y + alongY);
        context.stroke();
      }
      context.globalAlpha = 1;
    }

    function animate(time: number) {
      if (!enabled()) {stop(); return;}
      if (lastDraw && time - lastDraw < frameInterval) {
        frame = requestAnimationFrame(animate);
        return;
      }
      const step = Math.min(3, (lastDraw ? time - lastDraw : frameInterval) / (1000 / 60));
      lastDraw = time;
      const follow = 1 - Math.pow(.88, step);
      centerX += (pointerX - centerX) * follow;
      centerY += (pointerY - centerY) * follow;
      strength += ((active ? 1 : 0) - strength) * (1 - Math.pow(.9, step));
      draw(time, step);
      // The field keeps drifting between pointer movements, while hidden tabs pause.
      frame = requestAnimationFrame(animate);
    }

    function resize() {
      if (!canvas || !context || !enabled()) return;
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      // Keep the decorative layer inexpensive alongside the stream and fishing scene.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_000_000 / (width * height)));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      let seed = 27419;
      function random() {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      }
      const count = Math.min(650, Math.max(140, Math.round(width * height / 2400)));
      capsules = Array.from({length: count}, () => ({
        x: random(), y: random(), offsetX: 0, offsetY: 0,
        angle: random() * Math.PI * 2,
        length: 5 + random() * 8, width: .9 + random() * .7,
        phase: random() * Math.PI * 2, light: 0,
        color: colors[Math.floor(random() * colors.length)],
      }));
      pointerX = Math.max(0, Math.min(width, pointerX));
      pointerY = Math.max(0, Math.min(height, pointerY));
      if (enabled()) {draw(performance.now(), 1); start();}
    }

    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !enabled()) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!active && strength < .002) {centerX = pointerX; centerY = pointerY;}
      active = true;
      start();
    }

    function leave(event: PointerEvent) {
      if (!event.relatedTarget) {active = false; start();}
    }

    function blur() {active = false; start();}

    function updateAvailability() {
      if (backgroundRef.current) backgroundRef.current.dataset.paused = String(document.hidden);
      if (enabled()) {resize(); start();}
      else {
        stop();
        active = false;
        strength = 0;
        for (const capsule of capsules) {capsule.offsetX = 0; capsule.offsetY = 0; capsule.light = 0;}
        context?.clearRect(0, 0, width, height);
      }
    }

    updateAvailability();
    window.addEventListener('resize', resize, {passive: true});
    window.addEventListener('pointermove', move, {passive: true});
    window.addEventListener('pointerout', leave, {passive: true});
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', updateAvailability);
    reducedMotion.addEventListener('change', updateAvailability);
    finePointer.addEventListener('change', updateAvailability);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', updateAvailability);
      reducedMotion.removeEventListener('change', updateAvailability);
      finePointer.removeEventListener('change', updateAvailability);
    };
  }, []);

  return <><div ref={backgroundRef} className="ambient-background" aria-hidden="true"><span className="ambient-light ambient-light-one"/><span className="ambient-light ambient-light-two"/><span className="ambient-light ambient-light-three"/></div><canvas ref={canvasRef} className="cursor-ring-field" aria-hidden="true"/></>;
}
