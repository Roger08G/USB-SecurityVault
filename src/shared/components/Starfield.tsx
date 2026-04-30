/** @jsxImportSource @emotion/react */
import { css, keyframes } from '@emotion/react';
import { useEffect, useRef } from 'react';
import { theme } from '@shared/theme';

/**
 * Cosmic background: animated gradient nebula + canvas starfield with parallax twinkle.
 * Pure visuals, no state leakage. Mounted once near the app root.
 */

const driftA = keyframes({
	'0%': { transform: 'translate3d(-10%, -8%, 0) scale(1)' },
	'50%': { transform: 'translate3d(8%, 6%, 0) scale(1.08)' },
	'100%': { transform: 'translate3d(-10%, -8%, 0) scale(1)' }
});
const driftB = keyframes({
	'0%': { transform: 'translate3d(12%, 10%, 0) scale(1.05)' },
	'50%': { transform: 'translate3d(-6%, -4%, 0) scale(1)' },
	'100%': { transform: 'translate3d(12%, 10%, 0) scale(1.05)' }
});

const wrapStyles = css({
	position: 'fixed',
	inset: 0,
	overflow: 'hidden',
	background: theme.color.bgDeep,
	zIndex: 0
});

const nebulaA = css({
	position: 'absolute',
	width: '70vmax',
	height: '70vmax',
	top: '-20%',
	left: '-15%',
	borderRadius: '50%',
	background: 'radial-gradient(circle at center, rgba(139,92,246,0.55), rgba(109,40,217,0) 65%)',
	filter: 'blur(40px)',
	animation: `${driftA} 28s ease-in-out infinite`
});
const nebulaB = css({
	position: 'absolute',
	width: '60vmax',
	height: '60vmax',
	bottom: '-25%',
	right: '-10%',
	borderRadius: '50%',
	background: 'radial-gradient(circle at center, rgba(244,114,182,0.35), rgba(103,232,249,0.15) 55%, rgba(0,0,0,0) 75%)',
	filter: 'blur(50px)',
	animation: `${driftB} 36s ease-in-out infinite`
});

const canvasStyles = css({
	position: 'absolute',
	inset: 0,
	width: '100%',
	height: '100%'
});

interface Star { x: number; y: number; r: number; phase: number; speed: number; }

export function Starfield() {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let raf = 0;
		let stars: Star[] = [];

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = window.innerWidth * dpr;
			canvas.height = window.innerHeight * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			const count = Math.floor((window.innerWidth * window.innerHeight) / 6500);
			stars = Array.from({ length: count }, () => ({
				x: Math.random() * window.innerWidth,
				y: Math.random() * window.innerHeight,
				r: Math.random() * 1.2 + 0.2,
				phase: Math.random() * Math.PI * 2,
				speed: 0.6 + Math.random() * 1.4,
			}));
		};

		const tick = (t: number) => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			for (const s of stars) {
				const a = 0.35 + 0.5 * Math.sin(t * 0.001 * s.speed + s.phase);
				ctx.globalAlpha = Math.max(0, Math.min(1, a));
				ctx.fillStyle = '#e9defe';
				ctx.beginPath();
				ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
			raf = requestAnimationFrame(tick);
		};

		resize();
		raf = requestAnimationFrame(tick);
		window.addEventListener('resize', resize);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
		};
	}, []);

	return (
		<div css={wrapStyles} aria-hidden>
			<div css={nebulaA} />
			<div css={nebulaB} />
			<canvas ref={ref} css={canvasStyles} />
		</div>
	);
}
