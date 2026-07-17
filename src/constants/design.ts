export const brand = {
  name: "Dublancer",
  tagline: "The Commitment To Be The First",

  colors: {
    green: "#009A44",
    red: "#EF3340",
    navy: "#0F4C5C",
    black: "#000000",
    white: "#FFFFFF",
    background: "#F8FAFC",
    border: "#E5E7EB",
    text: "#1F2937",
    muted: "#6B7280",
  },

  typography: {
    heading: {
      h1: "clamp(3rem, 8vw, 7rem)",
      h2: "clamp(2rem, 4vw, 3.5rem)",
      h3: "1.75rem",
    },

    body: {
      lg: "1.125rem",
      md: "1rem",
      sm: "0.875rem",
    },

    fontFamily: {
      heading: "Poppins, Inter, system-ui, sans-serif",
      body: "Inter, system-ui, sans-serif",
    },

    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  radius: {
    sm: "8px",
    md: "12px",
    lg: "20px",
    xl: "28px",
  },

  shadow: {
    card: "0 10px 30px rgba(15, 76, 92, 0.08)",
    button: "0 6px 18px rgba(0, 154, 68, 0.18)",
  },

  spacing: {
    section: "96px",
    container: "1280px",
  },

  transition: {
    default: "all 200ms ease",
  },
} as const;