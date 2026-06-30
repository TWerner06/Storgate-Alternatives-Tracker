// components/HeronLogo.tsx
'use client'

interface Props {
  size?: number
  color?: string
}

export default function HeronLogo({ size = 28, color = '#8FB4D9' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Heron - elegant line art style matching brand mark */}
      <path
        d="M 28 72 
           C 28 60, 32 48, 40 40
           C 46 34, 52 30, 56 24
           C 58 21, 57 18, 54 17
           C 51 16, 48 18, 47 21"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Head */}
      <path
        d="M 47 21 
           C 45 17, 46 13, 50 11
           C 54 9, 58 11, 59 15
           C 60 18, 58 21, 55 22"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Beak */}
      <path
        d="M 59 15 L 68 12"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Eye */}
      <circle cx="53" cy="16" r="1.4" fill={color} />
      {/* Neck curve */}
      <path
        d="M 40 40
           C 36 44, 33 50, 32 56"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Body */}
      <path
        d="M 28 72
           C 30 66, 34 61, 40 58
           C 46 55, 52 56, 56 60
           C 60 64, 60 70, 56 74
           C 52 78, 45 79, 39 76"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Wing detail */}
      <path
        d="M 38 58
           C 42 60, 46 64, 47 69"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Legs */}
      <path
        d="M 30 70 L 26 84 M 26 84 L 22 84 M 26 84 L 30 84"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 38 76 L 36 86 M 36 86 L 32 86 M 36 86 L 40 86"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
