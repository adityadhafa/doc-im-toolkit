import { defineConfig } from 'vite';

// PENTING: ganti '/toolkit-dokumen-gambar/' sesuai nama repo GitHub Anda.
// Jika repo bernama "username.github.io" (repo user/organisasi), base harus '/'.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/toolkit-dokumen-gambar/',
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-lib': ['pdf-lib'],
          'pdfjs-dist': ['pdfjs-dist'],
          jszip: ['jszip'],
          heic2any: ['heic2any'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
