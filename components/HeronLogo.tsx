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
      height={size * 1.1}
      viewBox="0 0 90 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Heron — single continuous line tracing head, looped neck, body, legs,
          matching the brand mark: head/beak top-left, neck loops down into
          a rounded body, two simple legs at the base */}
      <path
        d="
          M 22 14
          C 18 10, 12 10, 8 14
          C 5 17, 5 21, 8 24
          C 11 27, 15 26, 17 23

          M 17 23
          C 22 28, 26 35, 27 44
          C 28 53, 25 60, 19 64
          C 13 68, 14 74, 20 76
          C 27 78, 35 75, 38 68
          C 41 61, 38 54, 31 51
          C 26 49, 23 44, 24 38

          M 24 38
          C 27 33, 33 30, 39 31

          M 20 76
          L 17 92

          M 31 70
          L 30 90
        "
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Eye */}
      <circle cx="12" cy="16" r="1.3" fill={color} />
    </svg>
  )
}
