import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // The site root by default. GitHub Pages serves a project site from /<repo-name>/, so the deploy
  // workflow sets BASE_PATH (see .github/workflows/deploy.yml).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
