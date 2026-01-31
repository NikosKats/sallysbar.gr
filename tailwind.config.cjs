/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      fontFamily: {
      heading: ['"Playfair Display"', 'serif'],
      body: ['Inter', 'system-ui', 'sans-serif'],
    },
    },
  },
  plugins: [],
};
