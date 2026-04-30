/** @jsxImportSource @emotion/react */
import { css, keyframes } from '@emotion/react';
import { useEffect, type ReactNode } from 'react';
import { theme } from '@shared/theme';

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	width?: number;
}

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const popIn = keyframes({
	from: { opacity: 0, transform: 'translate(-50%, -48%) scale(0.96)' },
	to: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }
});

const overlayStyles = css({
	position: 'fixed',
	inset: 0,
	background: 'rgba(2, 0, 12, 0.72)',
	backdropFilter: 'blur(6px)',
	zIndex: 50,
	animation: `${fadeIn} ${theme.transition.base}`
});

const dialogStyles = (width: number) => css({
	position: 'fixed',
	top: '50%',
	left: '50%',
	transform: 'translate(-50%, -50%)',
	width: '92vw',
	maxWidth: width,
	maxHeight: '88vh',
	overflowY: 'auto',
	background: 'linear-gradient(180deg, rgba(30, 18, 65, 0.95), rgba(15, 8, 35, 0.98))',
	border: `1px solid ${theme.color.borderStrong}`,
	borderRadius: theme.radius.xl,
	padding: theme.space(7),
	zIndex: 51,
	boxShadow: theme.shadow.glowStrong,
	animation: `${popIn} ${theme.transition.slow}`
});

const headerStyles = css({
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'space-between',
	marginBottom: theme.space(5)
});

const titleStyles = css({
	fontSize: 20,
	fontWeight: 600,
	color: theme.color.text,
});

const closeStyles = css({
	background: 'transparent',
	border: 'none',
	color: theme.color.textMuted,
	fontSize: 22,
	cursor: 'pointer',
	lineHeight: 1,
	'&:hover': { color: theme.color.text }
});

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	if (!open) return null;
	return (
		<>
			<div css={overlayStyles} onClick={onClose} />
			<div css={dialogStyles(width)} role="dialog" aria-modal="true">
				<header css={headerStyles}>
					<h2 css={titleStyles}>{title}</h2>
					<button css={closeStyles} onClick={onClose} aria-label="Cerrar">
						✕
					</button>
				</header>
				{children}
			</div>
		</>
	);
}
