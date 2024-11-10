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
import { ArchiveGroupName, LiveUrlProviderResult, StandardLocations, UrlProviderResult } from "../lib/standards.ts";
import { getChecksums, getCoreReleases, getCoreTranslations, getCredits, getImporters, getListOfReleases } from "./lib/core.ts";
import { getInterestingSlugs, getInUpdateOrder, getItemLists, ItemType, saveItemLists } from "./lib/item-lists.ts";
import { downloadFile } from "./lib/downloads.ts";
import { ArchiveGroupStatus } from "../lib/archive-status.ts";
import * as path from "jsr:@std/path";
import { compareVersions } from "https://deno.land/x/compare_versions@0.4.0/mod.ts";
import { createThemeRequestGroup } from "./lib/themes.ts";

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

export interface RequestGroup {
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

    /**
     * how to get live files.
     */
    liveRequests: Array<LiveUrlProviderResult>;

    /**
     * was there any error during processing
     */
    error?: string;
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

async function createCoreRequestGroup(
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
    release: string
): Promise<RequestGroup> {
    const requests: Array<UrlProviderResult> = [];
    const liveRequests: Array<LiveUrlProviderResult> = [];
    const perRelease = await getCoreTranslations(reporter, jreporter, locations, options, release, false, locales);

    // 12 core archive files per release - 4 groups of 3
    // 2 groups are required .zip and .tar.gz
    // 2 groups are optional -no-content.zip, and -new-bundled.zip
    const archives = locations.coreZips.map((func) => func(locations.ctx, release));
    requests.push(...archives);

    if (perRelease.translations && (perRelease.translations.length > 0)) {
        // for each translation
        for (const translation of perRelease.translations) {
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
                requests.push(getChecksums(locations, release, translation.language));
                const zips = locations.coreL10nZips.map((func) => func(locations.ctx, release, translation.version, translation.language));
                requests.push(...zips);
            }
        }
    }

    // special case for en_US, since it is not a translation
    if (compareVersions.compare(release, '3.1.4', '>')) {
        requests.push(getCredits(locations, release, 'en_US'));
    }
    requests.push(getImporters(locations, release, 'en_US'));
    requests.push(getChecksums(locations, release, 'en_US'));

    return ({
        sourceName: locations.ctx.sourceName,
        section: 'core',
        slug: release,
        statusFilename: locations.coreStatusFilename(locations.ctx, release),
        requests,
        liveRequests
    });

}

/**
 * based upon the existing meta data determine what files are left to download.
 * @param options command-line options.
 * @param locations how to access resources.
 * @param releases list of releases.
 * @param locales list of locales.
 * @returns
 */
async function gatherCoreRequestGroups(
    options: CommandOptions,
    locations: StandardLocations,
    releases: Array<string>,
    locales: Array<string>
): Promise<Array<RequestGroup>> {
    const outstanding: Array<RequestGroup> = [];
    for (const release of releases) {
        const requests: Array<UrlProviderResult> = [];
        const liveRequests: Array<LiveUrlProviderResult> = [];
        const perRelease = await getCoreTranslations(reporter, jreporter, locations, options, release, false, locales);

        // 12 core archive files per release - 4 groups of 3
        // 2 groups are required .zip and .tar.gz
        // 2 groups are optional -no-content.zip, and -new-bundled.zip
        const archives = locations.coreZips.map((func) => func(locations.ctx, release));
        requests.push(...archives);

        if (perRelease.translations && (perRelease.translations.length > 0)) {
            // for each translation
            for (const translation of perRelease.translations) {
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
                    requests.push(getChecksums(locations, release, translation.language));
                    const zips = locations.coreL10nZips.map((func) => func(locations.ctx, release, translation.version, translation.language));
                    requests.push(...zips);
                }
            }
        }

        // special case for en_US, since it is not a translation
        if (compareVersions.compare(release, '3.1.4', '>')) {
            requests.push(getCredits(locations, release, 'en_US'));
        }
        requests.push(getImporters(locations, release, 'en_US'));
        requests.push(getChecksums(locations, release, 'en_US'));

        outstanding.push({
            sourceName: locations.ctx.sourceName,
            section: 'core',
            slug: release,
            statusFilename: locations.coreStatusFilename(locations.ctx, release),
            requests,
            liveRequests
        });
    }

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
    const groupStatus: ArchiveGroupStatus = await loadGroupStatus(group);
    if (downloadIsComplete(options, group, groupStatus)) {
        jreporter({ operation: 'downloadRequestGroup', section: group.section, slug: group.slug, filename: group.statusFilename.pathname, is_complete: true, skipped: true });
        return true;
    }

    let ok = true;
    const filtered = group.requests.filter((item) => item.upstream && item.pathname && item.host &&
                        (options.force || options.rehash || (groupStatus.files[item.pathname]?.status !== 'complete')));

    jreporter({ operation: 'downloadRequestGroup', section: group.section, slug: group.slug, action: 'filtered', size: filtered.length });
    for (const item of filtered) {
        if (item.upstream && item.pathname && item.host) {
            // we need this one
            const needHash = options.rehash ||
                !groupStatus.files[item.pathname] ||
                !groupStatus.files[item.pathname].md5 ||
                !groupStatus.files[item.pathname].sha1 ||
                !groupStatus.files[item.pathname].sha256;

            const fileStatus = await downloadFile(reporter, jreporter, item, options.force, needHash);
            if (groupStatus.files[item.pathname]) {
                groupStatus.files[item.pathname].status = fileStatus.status;
                groupStatus.files[item.pathname].when = fileStatus.when;
                groupStatus.files[item.pathname].is_readonly = fileStatus.is_readonly;
                if (options.rehash) {
                    groupStatus.files[item.pathname].md5 = fileStatus.md5;
                    groupStatus.files[item.pathname].sha1 = fileStatus.sha1;
                    groupStatus.files[item.pathname].sha256 = fileStatus.sha256;
                }
            } else {
                groupStatus.files[item.pathname] = fileStatus;
            }
            if (fileStatus.status === 'unknown') {
                throw new Deno.errors.BadResource(`unknown status after downloadFile`);
            }
            if (fileStatus.status !== 'complete') {
                ok = false;
            } else if (!fileStatus.md5 || !fileStatus.sha1 || !fileStatus.sha256) {
                throw new Deno.errors.BadResource(`message digests are required for complete status`);
            }
        }
    }
    groupStatus.is_complete = ok;

    jreporter({ operation: 'downloadRequestGroup', section: group.section, slug: group.slug, filename: group.statusFilename.pathname, is_complete: ok, skipped: false });
    await saveGroupStatus(group, groupStatus, options.jsonSpaces);

    return groupStatus.is_complete;
}

/**
 * determine if all of the requested files have already been downloaded successfully.
 * @param group collection of files we need to download.
 * @param groupStatus current status of the downloads.
 */
function downloadIsComplete(
    options: CommandOptions,
    group: RequestGroup,
    groupStatus: ArchiveGroupStatus
): boolean {
    if (options.force || options.rehash || !groupStatus.is_complete) {
        return false;
    }
    for (const r of group.requests) {
        if (r.pathname && !groupStatus.files[r.pathname]) {
            return false;
        }
    }
    return true;
}

/**
 * save the group download status file.
 * @param group collection of files to be downloaded.
 * @param groupStatus results of the download effort.
 * @param jsonSpaces how to expand json. pretty or not?
 */
async function saveGroupStatus(group: RequestGroup, groupStatus: ArchiveGroupStatus, jsonSpaces: string): Promise<void> {
    if (!group.statusFilename.pathname) {
        throw new Deno.errors.BadResource(`group.statusFilename.pathname must be defined`);
    }
    try {
        const json = JSON.stringify(groupStatus, null, jsonSpaces);
        const dirname = path.dirname(group.statusFilename.pathname);
        await Deno.mkdir(dirname, { recursive: true });
        await Deno.writeTextFile(group.statusFilename.pathname, json);
    } catch (e) {
        console.error(`Error: unable to save status: ${group.statusFilename.pathname} error: ${e}`);
        jreporter({ operation: 'downloadGroup', filename: group.statusFilename.pathname, error: e });
    }
    jreporter({ operation: 'downloadGroup', filename: group.statusFilename.pathname, is_complete: groupStatus.is_complete });
}

/**
 * attempt to read the status file, or initialize a new one.
 * @param group collection of files to be downloaded.
 * @returns previous group status, or an empty new one.
 */
async function loadGroupStatus(group: RequestGroup): Promise<ArchiveGroupStatus> {
    const results: ArchiveGroupStatus = {
        source_name: group.sourceName,
        section: group.section,
        slug: group.slug,
        is_complete: false,
        when: Date.now(),
        files: {}
    };
    if (group.statusFilename.pathname) {
        try {
            const contents = await Deno.readTextFile(group.statusFilename.pathname);
            const parsed = JSON.parse(contents);
            if (parsed &&
                (typeof parsed === 'object') &&
                ('files' in parsed) &&
                (typeof parsed.files === 'object')
            ) {
                return parsed as ArchiveGroupStatus;
            }
        } catch (_) {
            // return empty results
        }
    }
    return results;
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

async function coreSection(
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
): Promise<void> {
    const releasesMap = await getCoreReleases(reporter, jreporter, options, locations);
    const releases = await getListOfReleases(reporter, jreporter, locations, releasesMap);
    let total = 0;
    let successful = 0;
    let failures = 0;
    for (const release of releases) {
        const group = await createCoreRequestGroup(options, locations, locales, release);
        const ok = await downloadRequestGroup(options, group);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        total += 1;
    }
    jreporter({ operation: 'coreSection', action: 'complete', total, successful, failures });
}


async function pluginsSection(
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
): Promise<void> {
    const releasesMap = await getCoreReleases(reporter, jreporter, options, locations);
    const slugs = await getListOfReleases(reporter, jreporter, locations, releasesMap);
    let total = 0;
    let successful = 0;
    let failures = 0;
    for (const slug of slugs) {
        const group = await createCoreRequestGroup(options, locations, locales, slug);
        const ok = await downloadRequestGroup(options, group);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        total += 1;
    }
    jreporter({ operation: 'pluginsSection', action: 'complete', total, successful, failures });
}

async function themesSection(
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
): Promise<void> {
    const themeLists = await getItemLists(reporter, jreporter, locations, 'theme');
    await saveItemLists(reporter, jreporter, locations, options, 'theme', themeLists);

    let total = 0;
    let successful = 0;
    let failures = 0;
    const slugs = getInUpdateOrder(themeLists);
    for (const slug of slugs) {
        const group = await createThemeRequestGroup(reporter, jreporter, options, locations, locales, slug);
        const ok = await downloadRequestGroup(options, group);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        total += 1;
    }
    jreporter({ operation: 'themesSection', action: 'complete', total, successful, failures });
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

//    const stopAfter = parseInt(options.stop ?? '99');
    if (await checkPermissions(locations)) {
        return 1;
    }
    const locales = await getListOfLocales(reporter, jreporter, locations);
    await themesSection(options, locations, locales);
    await coreSection(options, locations, locales);
    // await pluginsSection(options, locations, locales);
    jreporter({operation: 'main', program: PROGRAM_NAME, version: VERSION, started: timestamp });
    reporter(`finished:   ${getISOtimestamp()}`);
    return 0;
}

const exitCode: number = await main(Deno.args);
Deno.exit(exitCode);

