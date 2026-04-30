/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import type { ReactNode } from 'react';
import { theme } from '@shared/theme';

interface BrandMarkProps {
	title?: string;
	subtitle?: string;
	icon?: ReactNode;
}

const wrap = css({
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: theme.space(2),
	marginBottom: theme.space(8)
});

const planet = css({
	width: 72,
	height: 72,
	borderRadius: '50%',
	background: `radial-gradient(circle at 30% 30%, ${theme.color.accentGlow}, ${theme.color.accentStrong} 45%, ${theme.color.accentDeep} 80%)`,
	boxShadow: theme.shadow.glowStrong,
	position: 'relative',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	color: '#fff',
	fontSize: 28,
	'&::after': {
		content: '""',
		position: 'absolute',
		inset: -10,
		border: `1px solid ${theme.color.border}`,
		borderRadius: '50%',
		transform: 'rotate(-18deg) scaleY(.35)'
	}
});

const titleStyles = css({
	margin: 0,
	fontSize: 26,
	fontWeight: 600,
	color: theme.color.text,
	letterSpacing: '0.02em'
});

const subStyles = css({
	margin: 0,
	fontSize: 13,
	color: theme.color.textMuted,
	letterSpacing: '0.18em',
	textTransform: 'uppercase'
});

export function BrandMark({ title = 'USB Vault', subtitle = 'Cosmic Secure Storage', icon }: BrandMarkProps) {
	return (
		<header css={wrap}>
			<div css={planet}>{icon ?? '🪐'}</div>
			<h1 css={titleStyles}>{title}</h1>
			<p css={subStyles}>{subtitle}</p>
		</header>
	);
}
