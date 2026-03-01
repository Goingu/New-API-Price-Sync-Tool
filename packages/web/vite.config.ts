import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const modulePath = id.split('node_modules/')[1] ?? '';
          const segments = modulePath.split(/[\\/]/);
          const pkg =
            segments[0]?.startsWith('@')
              ? `${segments[0]}/${segments[1]}`
              : segments[0];

          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') {
            return 'react';
          }

          if (pkg === 'react-router' || pkg === 'react-router-dom' || pkg === '@remix-run/router') {
            return 'router';
          }

          if (pkg === 'axios') return 'axios';
          if (pkg === 'dayjs') return 'dayjs';

          if (pkg?.startsWith('@ant-design/')) return 'ant-design-utils';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
