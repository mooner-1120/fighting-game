declare const __BUILD_ID__: string;
/** 이 브라우저가 실행 중인 게임 빌드 ID */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
