// ============================================================
// OpenClaw Memory System — Logger
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

const PREFIX = '[OpenClaw Memory]';

export const logger = {
    debug: (msg: string, ...args: unknown[]) => {
        if (shouldLog('debug')) console.debug(`${PREFIX} 🔍 ${msg}`, ...args);
    },
    info: (msg: string, ...args: unknown[]) => {
        if (shouldLog('info')) console.info(`${PREFIX} ℹ️  ${msg}`, ...args);
    },
    warn: (msg: string, ...args: unknown[]) => {
        if (shouldLog('warn')) console.warn(`${PREFIX} ⚠️  ${msg}`, ...args);
    },
    error: (msg: string, ...args: unknown[]) => {
        if (shouldLog('error')) console.error(`${PREFIX} ❌ ${msg}`, ...args);
    },
};
