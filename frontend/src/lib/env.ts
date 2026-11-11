/** URL de la UI legacy, para ofrecer un fallback mientras dura la migración. */
export const LEGACY_APP_URL = import.meta.env.DEV ? 'http://localhost:3333/' : '/';

export const IS_DEV = import.meta.env.DEV;
