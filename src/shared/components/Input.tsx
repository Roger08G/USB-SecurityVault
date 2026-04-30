/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { theme } from '@shared/theme';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
	leftIcon?: ReactNode;
	rightSlot?: ReactNode;
	error?: string | null;
	monospace?: boolean;
}

const wrapperStyles = css({
	display: 'flex',
	flexDirection: 'column',
	gap: theme.space(1.5),
	width: '100%'
});

const labelStyles = css({
	fontSize: 12,
	color: theme.color.textMuted,
	textTransform: 'uppercase',
	letterSpacing: '0.08em'
});

const fieldStyles = css({
	position: 'relative',
	display: 'flex',
	alignItems: 'center',
	background: theme.color.bgElevated,
	border: `1px solid ${theme.color.border}`,
	borderRadius: theme.radius.md,
	transition: `border-color ${theme.transition.base}, box-shadow ${theme.transition.base}`,
	'&:focus-within': {
		borderColor: theme.color.borderStrong,
		boxShadow: `0 0 0 3px rgba(167, 139, 250, 0.15)`
	}
});

const iconStyles = css({
	display: 'flex',
	alignItems: 'center',
	paddingLeft: 14,
	color: theme.color.accent
});

const inputStyles = (mono: boolean) =>
	css({
		flex: 1,
		background: 'transparent',
		border: 'none',
		outline: 'none',
		padding: '12px 14px',
		color: theme.color.text,
		fontFamily: mono ? theme.font.mono : theme.font.sans,
		fontSize: 14,
		'&::placeholder': { color: theme.color.textDim }
	});

const errorStyles = css({ color: theme.color.danger, fontSize: 12 });

export function Input({ label, leftIcon, rightSlot, error, monospace = false, ...rest }: InputProps) {
	return (
		<label css={wrapperStyles}>
			{label && <span css={labelStyles}>{label}</span>}
			<div css={fieldStyles}>
				{leftIcon && <span css={iconStyles}>{leftIcon}</span>}
				<input {...rest} css={inputStyles(monospace)} />
				{rightSlot}
			</div>
			{error && <span css={errorStyles}>{error}</span>}
		</label>
	);
}
