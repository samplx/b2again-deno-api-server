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

import type { ParseOptions } from 'jsr:@std/cli/parse-args';

/** default number of items without changes to be processed before stopping - 0 don't stop. */
export const DEFAULT_NO_CHANGE_COUNT: number = 0;

/**
 * Results of parsing the command-line.
 */
export interface CommandOptions {
    /**
     * enable download of core resources.
     */
    core: boolean;

    /**
     * true to force download of all files.
     */
    force: boolean;

    /**
     * true if user requested help.
     */
    help: boolean;

    /**
     * true to enable JSON logging. turns off regular logging.
     */
    json: boolean;

    /**
     * attempt to download l10n resources.
     */
    l10n: boolean;

    /**
     * attempt to download the list of slugs from upstream sources.
     */
    list: boolean;

    /**
     * attempt to download live resources.
     */
    live: boolean;

    /**
     * attempt to download meta data resources.
     */
    meta: boolean;

    /**
     * number of no change items processed before we stop.
     */
    noChangeCount: string;

    /**
     * enable download of pattern resources.
     */
    patterns: boolean;

    /**
     * enable download of plugin resources.
     */
    plugins: boolean;

    /**
     * if true, only report errors.
     */
    quiet: boolean;

    /**
     * attempt to download read-only (zip, tar.gz, et al.) files.
     */
    readOnly: boolean;

    /**
     * flag indicating the message digest (hashes) should be recalculated.
     */
    rehash: boolean;

    /**
     * generate summary resources.
     */
    summary: boolean;

    /**
     * assume sync state (skip status checks when files don't change).
     */
    synced: boolean;

    /**
     * enable download of theme resources.
     */
    themes: boolean;

    /**
     * flag indicating a request to print the version.
     */
    version: boolean;

    /**
     * rest of the arguments of the command-line.
     */
    _: Array<string>;
}

/**
 * @returns description of the command-line options to pass to the parser.
 */
export function getParseOptions(): ParseOptions {
    return {
        default: {
            core: false,
            force: false,
            help: false,
            json: false,
            l10n: false,
            list: false,
            live: false,
            meta: false,
            noChangeCount: `${DEFAULT_NO_CHANGE_COUNT}`,
            patterns: false,
            plugins: false,
            quiet: false,
            readOnly: false,
            rehash: false,
            summary: false,
            synced: false,
            themes: false,
            version: false,
        },
        boolean: [
            'core',
            'force',
            'help',
            'json',
            'l10n',
            'list',
            'live',
            'meta',
            'patterns',
            'plugins',
            'quiet',
            'readOnly',
            'rehash',
            'summary',
            'synced',
            'themes',
            'version',
        ],
        string: [
            'noChangeCount',
        ],
        unknown: (arg: string): unknown => {
            console.error(`Warning: unrecognized option ignored '${arg}'`);
            return false;
        },
    };
}

/**
 * Provide help to the user.
 */
export function printHelp(programName: string, parseOptions: ParseOptions): void {
    console.log(`${programName} [options]`);
    console.log();
    console.log(`Options include [default value]:`);
    console.log(`--core                     [${parseOptions.default?.core}]`);
    console.log(`    enable core resources download.`);
    console.log(`--force                    [${parseOptions.default?.force}]`);
    console.log(`    force download of files.`);
    console.log(`--help`);
    console.log(`    print this message and exit.`);
    console.log(`--json                     [${parseOptions.default?.json}]`);
    console.log(`    output JSON structured log.`);
    console.log(`--l10n                     [${parseOptions.default?.l10n}]`);
    console.log(`    query upstream for resource lists.`);
    console.log(`--list                     [${parseOptions.default?.list}]`);
    console.log(`    query upstream for resource lists.`);
    console.log(`--live                     [${parseOptions.default?.live}]`);
    console.log(`    download live resources.`);
    console.log(`--meta                     [${parseOptions.default?.meta}]`);
    console.log(`    download meta resources.`);
    console.log(`--noChangeCount=number     [${parseOptions.default?.noChangeCount}]`);
    console.log(`    number of items without changes before we stop the section.`);
    console.log(`--patterns                 [${parseOptions.default?.patterns}]`);
    console.log(`    enable pattern resources download.`);
    console.log(`--plugins                  [${parseOptions.default?.plugins}]`);
    console.log(`    enable plugin resources download.`);
    console.log(`--quiet                    [${parseOptions.default?.quiet}]`);
    console.log(`    be quiet. supress non-error messages.`);
    console.log(`--readOnly                 [${parseOptions.default?.readOnly}]`);
    console.log(`    download read-only (zip/tar.gz) resources.`);
    console.log(`--rehash                   [${parseOptions.default?.rehash}]`);
    console.log(`    recalculate message digests (hashes).`);
    console.log(`--summary                  [${parseOptions.default?.summary}]`);
    console.log(`    generate summary data files.`);
    console.log(`--synced                   [${parseOptions.default?.synced}]`);
    console.log(`    assume repos start synced - limit checks for new files.`);
    console.log(`--themes                   [${parseOptions.default?.themes}]`);
    console.log(`    enable theme resources download.`);
    console.log(`--version`);
    console.log(`    print program version and exit.`);
    console.log(`
If none of the groups: --core, --patterns, --plugins or --themes are selected,
then they are all are enabled. (not recommended -- takes too long).
If none of the steps: --list, --meta, --l10n, --readOnly, --live or --summary
are selected, then all the steps will be executed. (normal operation)
`);
}
