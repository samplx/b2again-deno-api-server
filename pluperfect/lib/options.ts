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

/** default number of items processed between saves of the status file. */
export const DEFAULT_PACE: number = 1000;

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

    /** number of items processed between saves of the status file (as a string). */
    pace: string;

    /** if true, only report errors. */
    quiet: boolean;

    /** flag indicating the message digest (hashes) should be recalculated. */
    rehash: boolean;

    /** true if failures should be retried. */
    retry: boolean;

    /** stage to stop after (if any). */
    stop?: string;

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
            jsonSpaces: '    ',
            pace: `${DEFAULT_PACE}`,
            quiet: false,
            rehash: false,
            retry: false,
            verbose: false,
            version: false,
        },
        boolean: [
            'force',
            'help',
            'json',
            'quiet',
            'rehash',
            'retry',
            'verbose',
            'version',
        ],
        string: [
            'jsonSpaces',
            'locations',
            'pace',
            'stop'
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
    console.log(`--pace=number              [${parseOptions.default?.pace}]`);
    console.log(`    number of items processed between status file saves.`);
    console.log(`--quiet                    [${parseOptions.default?.quiet}]`);
    console.log(`    be quiet. supress non-error messages.`);
    console.log(`--rehash                   [${parseOptions.default?.rehash}]`);
    console.log(`    recalculate message digests (hashes).`);
    console.log(`--retry                    [${parseOptions.default?.retry}]`);
    console.log(`    retry to download failed files.`);
    console.log(`--stop=after`);
    console.log(`    stop after stage has completed.`);
    console.log(`--verbose                  [${parseOptions.default?.verbose}]`);
    console.log(`    be verbose. include more informational messages.`);
    console.log(`--version`);
    console.log(`    print program version and exit.`);
}
