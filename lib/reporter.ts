/*
 *  Copyright 2024 James Burlingame
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * a general JSON format logger.
 */
export type JsonReporter = (j: string | Record<string, unknown>) => void | Promise<void>;

/**
 * the standard human readable logger.
 */
export type ConsoleReporter = (s: string) => void;

/**
 * an enabled console reporter.
 * @param s what to be reported.
 */
export function ENABLED_CONSOLE_REPORTER(s: string): void {
    console.log(s);
}

/**
 * a disabled reporter.
 * @param _ ignored message parameter.
 */
export function DISABLED_CONSOLE_REPORTER(_: string): void {}

/**
 * @returns a fixed length ISO timestamp
 */
export function getISOtimestamp(now: Date = new Date()): string {
    const year = now.getUTCFullYear();
    const month = (now.getUTCMonth()+1).toString().padStart(2, '0');
    const day = now.getUTCDay().toString().padStart(2, '0');
    const hh = now.getUTCHours().toString().padStart(2, '0');
    const mm = now.getUTCMinutes().toString().padStart(2, '0');
    const ss = now.getUTCSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hh}:${mm}:${ss}Z`;
}

/**
 * DI of a log writer for JSON.
 */
export type JsonLogWriter = (s: string) => Promise<void>;

/**
 * inject writer into JsonReporter handler.
 * @param w writer used to handle JSON output
 * @returns curried function of a JsonReporter.
 */
export function getJsonReporter(w: JsonLogWriter): JsonReporter {
    return function (j: string | Record<string, unknown>): void {
        if (!j) {
            throw new TypeError(`j parameter must be a string or an object.`);
        }
        if (typeof j === 'object') {
            const x = structuredClone(j);
            x['timestamp'] = getISOtimestamp();
            const text = JSON.stringify(x, null, '');
            w(text);
        } else {
            const x = {
                timestamp: getISOtimestamp(),
                message: j
            };
            const text = JSON.stringify(x, null, '');
            w(text);
        }
    }
}

/**
 * async proxy for console.log
 * @param s string to be printed to the console.
 */
async function consoleLog(s: string): Promise<void> {
    await console.log(s);
}

/**
 * a JSON reporter that sends output to standard output.
 */
export const ENABLED_JSON_REPORTER: JsonReporter = getJsonReporter(consoleLog);

/**
 * a disabled reporter that does nothing.
 * @param _ignored parameter is ignored
 */
export function DISABLED_JSON_REPORTER(_ignored: string | Record<string, unknown>): void {}

