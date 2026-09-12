import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Source code entry points — include CSS for Tailwind v4 @import tracking
  entry: ['src/**/*.{ts,tsx,mjs}', 'scripts/**/*.{mjs,js}', 'src/app/globals.css'],
  project: ['src/**/*.{ts,tsx,mjs,css}', 'scripts/**/*.{mjs,js}'],
  // Runtime dependencies that are not directly imported in TS (CLI tools)
  ignoreDependencies: [
    '@commitlint/cli',
    '@types/js-yaml',
  ],
  // Follow CSS @import statements (tailwindcss, tw-animate-css, shadcn/tailwind.css)
  compilers: {
    css: (text: string) => [...text.matchAll(/(?<=@)import[^;]+/gu)].join('\n'),
  },
  // Treat config hints as errors
  treatConfigHintsAsErrors: true,
};

export default config;
