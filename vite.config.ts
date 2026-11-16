import { defineConfig } from 'vite';

// 빌드마다 고유 ID — 서버와 브라우저의 게임 버전이 다르면 대전 결과가 어긋나므로 입장 시 비교한다
const BUILD_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: { host: true },
  plugins: [
    {
      name: 'build-id',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
      },
    },
  ],
});
