import packageJson from '../../package.json';

export const APP_VERSION = `v${packageJson.version}`;
export const CONTENT_VERSION = import.meta.env.VITE_CONTENT_VERSION?.trim() || APP_VERSION;
