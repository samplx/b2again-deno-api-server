#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env
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

import { parseArgs, ParseOptions } from "jsr:@std/cli/parse-args";
import { ConsoleReporter, ENABLED_CONSOLE_REPORTER, DISABLED_CONSOLE_REPORTER, JsonReporter, DISABLED_JSON_REPORTER, getISOtimestamp, ENABLED_JSON_REPORTER } from "../lib/reporter.ts";
import { getParseOptions, printHelp, type CommandOptions } from "./lib/options.ts";
import getStandardLocations from "../lib/b2again-locations.ts";
import { ArchiveGroupName, StandardLocations, UrlProviderResult } from "../lib/standards.ts";
import { getChecksums, getCoreReleases, getCoreTranslations, getCredits, getImporters, getListOfReleases } from "./lib/core.ts";
import { getInterestingSlugs, getItemLists, ItemType, saveItemLists } from "./lib/item-lists.ts";
import { downloadFile } from "./lib/downloads.ts";
import { ArchiveGroupStatus } from "../lib/archive-status.ts";
import * as path from "jsr:@std/path";

/** how the script describes itself. */
const PROGRAM_NAME: string = 'pluperfect';
/** current semver */
const VERSION: string = '0.7.0';

/**
 * How to report non-errors.
 */
let reporter: ConsoleReporter = ENABLED_CONSOLE_REPORTER;

/**
 * How to log structured JSON
 */
let jreporter: JsonReporter = DISABLED_JSON_REPORTER;

/**
 * Describe the command-line options, including default
 * values.
 */
const parseOptions: ParseOptions = getParseOptions();

interface RequestGroup {
    /**
     * which source is active.
     * name and meaning is installation specific.
     */
    sourceName: string;

    /**
     * what type of data is this about. core, plugin, theme
     */
    section: ArchiveGroupName;

    /**
     * group id.
     */
    slug: string;

    /**
     * where to save the results.
     */
    statusFilename: UrlProviderResult;

    /**
     * how to get the data and where to put it.
     */
    requests: Array<UrlProviderResult>;
}

/**
 * Verify process has permissions needed.
 * @param locations standard location of resources.
 * @returns 1 on failure, 0 if permissions exist.
 */
async function checkPermissions(locations: StandardLocations): Promise<number> {
    const envAccess = await Deno.permissions.request({ name: 'env' });
    if (envAccess.state !== 'granted') {
        console.error(`Error: process environment access is required to load parameters.`);
        return 1;
    }
    for (const host in locations.ctx.hosts) {
        if (locations.ctx.hosts[host].baseDirectory) {
            const writeAccess = await Deno.permissions.request({ name: 'write', path: locations.ctx.hosts[host].baseDirectory});
            if (writeAccess.state !== 'granted') {
                console.error(`Error: write access is required to pluginsDir ${locations.ctx.hosts[host].baseDirectory}`);
                return 1;
            }
            const readAccess = await Deno.permissions.request({ name: 'read', path: locations.ctx.hosts[host].baseDirectory});
            if (readAccess.state !== 'granted') {
                console.error(`Error: read access is required to pluginsDir ${locations.ctx.hosts[host].baseDirectory}`);
                return 1;
            }
        }
    }
    // check for permissions
    const apiAccess = await Deno.permissions.request({ name: 'net', host: locations.apiHost});
    if (apiAccess.state !== 'granted') {
        console.error(`Error: network access is required to api host ${locations.apiHost}`);
        return 1;
    }
    const downloadsAccess = await Deno.permissions.request({ name: 'net', host: locations.downloadsHost});
    if (downloadsAccess.state !== 'granted') {
        console.error(`Error: network access is required to downloads host ${locations.downloadsHost}`);
        return 1;
    }
    return 0;
}


/**
 * stage 2 - download meta data. translations, plugin and theme data.
 * determine list of remaining files to be downloaded.
 * @param options command-line options.
 * @param locations how to get local content.
 * @returns
 */
async function gatherRequestGroups(
    options: CommandOptions,
    locations: StandardLocations,
    releases: Array<string>,
    locales: Array<string>,
    pluginList: Array<ItemType>,
    themeList: Array<ItemType>
): Promise<Array<RequestGroup>> {
    const fromReleases = await gatherCoreRequestGroups(options, locations, releases, locales);

    const json = JSON.stringify(fromReleases, null, options.jsonSpaces);
    await Deno.writeTextFile('./debug-fromReleases.json', json);

    const fromPlugins = await gatherPluginRequestGroups(options, locations, pluginList, locales);
    const fromThemes = await gatherThemeRequestGroups(options, locations, themeList, locales);

    return [...fromReleases, ...fromPlugins, ...fromThemes];
}

async function gatherCoreRequestGroups(
    options: CommandOptions,
    locations: StandardLocations,
    releases: Array<string>,
    locales: Array<string>
): Promise<Array<RequestGroup>> {
    const outstanding: Array<RequestGroup> = [];
    for (const release of releases) {
        const requests: Array<UrlProviderResult> = [];
        const perRelease = await getCoreTranslations(reporter, jreporter, locations, options, release, false, locales);

        // 12 core archive files per release - 4 groups of 3
        // 2 groups are required .zip and .tar.gz
        // 2 groups are optional -no-content.zip, and -new-bundled.zip
        const archives = locations.coreZips.map((func) => func(locations.ctx, release));
        requests.push(...archives);

        if (perRelease.translations && (perRelease.translations.length > 0)) {
            // for each translation
            for (const translation of perRelease.translations) {
                requests.push(getChecksums(locations, release, translation.language));
                requests.push(getCredits(locations, release, translation.language));
                requests.push(getImporters(locations, release, translation.language));
                // zip file with l10n data
                // *locale*.zip
                // this is named after the locale version and should always exist
                requests.push(locations.coreL10nZip(locations.ctx, release, translation.version, translation.language));
                if (release === translation.version) {
                    // 6 archive files per locale per release
                    // .zip{,.md5,.sha1}, .tar.gz{,.md5,.sha1}
                    // these only exist if translation.version === release. i.e. they have been released.
                    const zips = locations.coreL10nZips.map((func) => func(locations.ctx, release, translation.version, translation.language));
                    requests.push(...zips);
                }
            }
        }
        outstanding.push({
            sourceName: locations.ctx.sourceName,
            section: 'core',
            slug: release,
            statusFilename: locations.coreStatusFilename(locations.ctx, release),
            requests
        });
    }

    return outstanding;
}


async function gatherPluginRequestGroups(
    options: CommandOptions,
    locations: StandardLocations,
    pluginList: Array<ItemType>,
    locales: Array<string>
): Promise<Array<RequestGroup>> {
    const outstanding: Array<RequestGroup> = [];

    return outstanding;
}


async function gatherThemeRequestGroups(
    options: CommandOptions,
    locations: StandardLocations,
    themeList: Array<ItemType>,
    locales: Array<string>
): Promise<Array<RequestGroup>> {
    const outstanding: Array<RequestGroup> = [];

    return outstanding;
}

/**
 * Attempt to download a group of files.
 * @param options command-line options.
 * @param group collection of files to be downloaded.
 * @returns true if they were all downloaded successfully.
 */
async function downloadRequestGroup(
    options: CommandOptions,
    group: RequestGroup
): Promise<boolean> {
    const results: ArchiveGroupStatus = {
        source_name: group.sourceName,
        section: group.section,
        slug: group.slug,
        is_outdated: false,
        is_complete: false,
        is_interesting: true,
        when: Date.now(),
        files: {}
    };

    let ok = true;
    for (const item of group.requests) {
        if (item.upstream && item.pathname && item.host) {
            const url = new URL(item.upstream);
            const status = await downloadFile(reporter, jreporter, item.host, url, item.pathname, options.force);
            const filename = url.pathname;
            results.files[filename] = status;
            if (status.status === 'unknown') {
                console.error(`Error: unknown status after download: ${filename}`);
            }
            ok = ok && (status.status === 'complete');
        }
    }
    results.is_complete = ok;
    if (group.statusFilename.pathname) {
        try {
            const json = JSON.stringify(results, null, options.jsonSpaces);
            const dirname = path.dirname(group.statusFilename.pathname);
            await Deno.mkdir(dirname, { recursive: true });
            await Deno.writeTextFile(group.statusFilename.pathname, json);
        } catch (e) {
            console.error(`Error: unable to save status: ${group.statusFilename.pathname} error: ${e}`);
            jreporter({ operation: 'downloadGroup', filename: group.statusFilename.pathname, error: e });
        }
        jreporter({ operation: 'downloadGroup', filename: group.statusFilename.pathname, is_complete: results.is_complete });
    }
    return results.is_complete;
}

/**
 * stage 3 - download remaining files.
 * @param options command-line options.
 * @param locations how to get local content.
 * @returns
 */
async function stage3(
    options: CommandOptions,
    remaining: Array<RequestGroup>
): Promise<number> {
    let total = 0;
    remaining.forEach((group) => {
        total += group.requests.length;
    });
    reporter(`downloading ${remaining.length} groups with a total of ${total} files`);
    jreporter({ operation: 'stage3', action: 'summary', size: remaining.length, total });
    let counter = 0;
    let successful = 0;
    let failures = 0;
    for (const group of remaining) {
        const ok = await downloadRequestGroup(options, group);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        counter += 1;
    }
    jreporter({ operation: 'stage3', action: 'complete', counter, successful, failures });
    return 0;
}

/**
 * summary report.
 * @param options command-line options.
 * @param locations how to get local content.
 * @returns
 */
async function summary(options: CommandOptions, locations: StandardLocations, status: number): Promise<void> {
}


/**
 * save everything.
 * @param options command-line options.
 * @param locations how to get local content.
 * @returns
 */
async function save(options: CommandOptions, locations: StandardLocations): Promise<void> {
}

async function getListOfLocales(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations
): Promise<Array<string>> {
    if (locations.interestingLocales) {
        const { pathname } = locations.interestingLocales(locations.ctx);
        if (pathname) {
            return await getInterestingSlugs(reporter, jreporter, pathname);
        }
    }
    return [];
}

/**
 *
 * @param argv arguments passed after the `deno run -N pluperfect.ts`
 * @returns 0 if ok, 1 on error, 2 on usage errors.
 */
async function main(argv: Array<string>): Promise<number> {
    const options: CommandOptions = parseArgs(argv, parseOptions);

    if (options.version) {
        console.log(`${PROGRAM_NAME} version ${VERSION}`);
        return 0;
    }
    if (options.help) {
        printHelp(PROGRAM_NAME, parseOptions);
        return 0;
    }
    if (options.json) {
        reporter = DISABLED_CONSOLE_REPORTER;
        jreporter = ENABLED_JSON_REPORTER;
    } else if (options.quiet) {
        reporter = DISABLED_CONSOLE_REPORTER;
    }
    reporter(`${PROGRAM_NAME} v${VERSION}`);
    const timestamp = getISOtimestamp();
    reporter(`started:   ${timestamp}`);
    const locations = getStandardLocations();

    const stopAfter = parseInt(options.stop ?? '99');
    let status = await checkPermissions(locations);
    if (status === 0) {
        const releasesMap = await getCoreReleases(reporter, jreporter, options, locations);
        const releases = await getListOfReleases(reporter, jreporter, locations, releasesMap);
        reporter(`stage1: total number of releases: ${releases.length}`);
        const locales = await getListOfLocales(reporter, jreporter, locations);
        const pluginLists = await getItemLists(reporter, jreporter, locations, 'plugin');
        await saveItemLists(reporter, jreporter, locations, options, 'plugin', pluginLists);

        const themeLists = await getItemLists(reporter, jreporter, locations, 'theme');
        await saveItemLists(reporter, jreporter, locations, options, 'theme', themeLists);

        if ((status === 0) && (stopAfter > 1)) {
            const remaining = await gatherRequestGroups(options, locations, releases, locales, pluginLists.effective, themeLists.effective);
            if ((status === 0) && (stopAfter > 2)) {
                status = await stage3(options, remaining);
            }
        }
        await summary(options, locations, status);
    }
    if (status === 0) {
        await save(options, locations);
    }
    jreporter({operation: 'main', program: PROGRAM_NAME, version: VERSION, started: timestamp, status});
    reporter(`finished:   ${getISOtimestamp()}`);
    return status;
}

const exitCode: number = await main(Deno.args);
Deno.exit(exitCode);

