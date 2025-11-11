const DEBUG_ENABLED = (typeof __DEV__ !== 'undefined' && __DEV__) && (process.env.EXPO_PUBLIC_DEBUG_LOGS === 'true');

export const logger = {
  log: (...args: any[]) => {
    if (DEBUG_ENABLED) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (DEBUG_ENABLED) console.warn(...args);
  },
  error: (...args: any[]) => {
    if (DEBUG_ENABLED) console.error(...args);
  },
};

export default logger;