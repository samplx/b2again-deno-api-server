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

import { ParseOptions } from "jsr:@std/cli/parse-args";

/** default number of items without changes to be processed before stopping - 0 don't stop. */
export const DEFAULT_NO_CHANGE_COUNT: number = 0;

/**
 * Results of parsing the command-line.
 */
export interface CommandOptions {
    /** true to force download of all files. */
    force: boolean;

    /** true if user requested help. */
    help: boolean;

    /** true to enable JSON logging */
    json: boolean;

    /** spaces when rendering JSON. */
    jsonSpaces: string;

    /** where to load standard locations. */
    locations?: string;

    /** number of no change items processed before we stop. */
    noChangeCount: string;

    /** if true, only report errors. */
    quiet: boolean;

    /** flag indicating the message digest (hashes) should be recalculated. */
    rehash: boolean;

    /** true if failures should be retried. */
    retry: boolean;

    /** assume sync state (skip status checks when files don't change). */
    synced: boolean;

    /** flag indicating more verbose output is desired. */
    verbose: boolean;

    /** flag indicating a request to print the version. */
    version: boolean;

    /** rest of the arguments of the command-line. */
    _: Array<string>;
}

export function getParseOptions(): ParseOptions {
    return {
        default: {
            force: false,
            help: false,
            json: false,
            jsonSpaces: '',
            noChangeCount: `${DEFAULT_NO_CHANGE_COUNT}`,
            quiet: false,
            rehash: false,
            retry: false,
            synced: false,
            verbose: false,
            version: false,
        },
        boolean: [
            'force',
            'help',
            'json',
            'quiet',
            'rehash',
            'synced',
            'retry',
            'verbose',
            'version',
        ],
        string: [
            'jsonSpaces',
            'locations',
            'noChangeCount',
        ],
        unknown: (arg: string): unknown => {
            console.error(`Warning: unrecognized option ignored '${arg}'`);
            return false;
        }
    }
}

/**
 * Provide help to the user.
 */
export function printHelp(programName: string, parseOptions: ParseOptions): void {
    console.log(`${programName} [options]`);
    console.log();
    console.log(`Options include [default value]:`);
    console.log(`--force                    [${parseOptions.default?.force}]`);
    console.log(`    force download of files.`);
    console.log(`--help`);
    console.log(`    print this message and exit.`);
    console.log(`--json                     [${parseOptions.default?.json}]`);
    console.log(`    output JSON structured log.`);
    console.log(`--jsonSpaces=spaces        [${parseOptions.default?.jsonSpaces}]`);
    console.log(`    spaces used to delimit generated JSON files.`);
    console.log(`--locations=name`);
    console.log(`    file to import for getStandardLocations() function.`);
    console.log(`--noChangeCount=number     [${parseOptions.default?.noChangeCount}]`);
    console.log(`    number of items without changes before we stop.`);
    console.log(`--quiet                    [${parseOptions.default?.quiet}]`);
    console.log(`    be quiet. supress non-error messages.`);
    console.log(`--rehash                   [${parseOptions.default?.rehash}]`);
    console.log(`    recalculate message digests (hashes).`);
    console.log(`--retry                    [${parseOptions.default?.retry}]`);
    console.log(`    retry to download failed files.`);
    console.log(`--synced                   [${parseOptions.default?.synced}]`);
    console.log(`    assume repos start synced - limit checks for new files.`);
    console.log(`--verbose                  [${parseOptions.default?.verbose}]`);
    console.log(`    be verbose. include more informational messages.`);
    console.log(`--version`);
    console.log(`    print program version and exit.`);
}
