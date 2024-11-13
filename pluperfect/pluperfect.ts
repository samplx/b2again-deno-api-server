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

import { parseArgs, ParseOptions } from 'jsr:@std/cli/parse-args';
import {
    ConsoleReporter,
    DISABLED_CONSOLE_REPORTER,
    DISABLED_JSON_REPORTER,
    ENABLED_CONSOLE_REPORTER,
    ENABLED_JSON_REPORTER,
    getISOtimestamp,
    JsonReporter,
} from '../lib/reporter.ts';
import { type CommandOptions, getParseOptions, printHelp } from './lib/options.ts';
import getStandardLocations from '../lib/b2again-locations.ts';
import {
    ArchiveGroupName,
    LiveUrlProviderResult,
    MigrationContext,
    StandardLocations,
    UrlProviderResult,
    VersionLocaleVersionUrlProvider,
} from '../lib/standards.ts';
import { createCoreRequestGroup, getCoreReleases, getListOfReleases } from './lib/core.ts';
import { getInterestingSlugs, getInUpdateOrder, getItemLists, saveItemLists } from './lib/item-lists.ts';
import { downloadFile } from './lib/downloads.ts';
import { ArchiveGroupStatus } from '../lib/archive-status.ts';
import * as path from 'jsr:@std/path';
import { createThemeRequestGroup } from './lib/themes.ts';
import { createPluginRequestGroup } from './lib/plugins.ts';
import { TranslationEntry, TranslationsResultV1_0 } from '../lib/api.ts';
import { compareVersions } from 'https://deno.land/x/compare_versions@0.4.0/compare-versions.ts';

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

    /**
     * were there any changes to the parent JSON file.
     */
    noChanges: boolean;
}

/**
 * We need to translate "legacy" translations into the modern version
 * which involves changing the `package` URL. But the migrate function
 * call only gets a single parameter? How do we inject the new URL?
 * To solve this problem, we turn to our good friend a curried function.
 * The "outer" function captures the
 * parameters, and returns a function that takes a single parameter, like
 * what we need, but also knows what it needs to know.
 * @param provider function to convert the package field
 * @param ctx bag of information to allow url conversion.
 * @param release which release is being migrated.
 * @returns a function, that we can use in the migrate call when we load the JSON.
 */
export function getTranslationMigration(
    provider: VersionLocaleVersionUrlProvider,
    ctx: MigrationContext,
    release: string,
): (original: Record<string, unknown>) => Record<string, unknown> {
    return function (o: Record<string, unknown>): Record<string, unknown> {
        if (o && (typeof o === 'object') && ('translations' in o) && Array.isArray(o.translations)) {
            const translations: Array<TranslationEntry> = [];
            for (const t of o.translations) {
                if (
                    t && (typeof t === 'object') &&
                    ('package' in t) && (typeof t.package === 'string')
                ) {
                    const translation = t as TranslationEntry;
                    const updated = { ...translation };
                    const pkg = provider(ctx, release, translation.version, translation.language);
                    updated.package = pkg.url.toString();
                    translations.push(updated);
                } else {
                    translations.push(t);
                }
            }
            return { translations } as unknown as Record<string, unknown>;
        }
        return {};
    };
}

/**
 * filter translations to only include the selected locales. Also, update
 * the on-disk files to only include those locales as well.
 * @param originals upstream translations
 * @param migrated local translations with updated urls.
 * @param locales list of locales to support, empty is all.
 * @param legacyJson pathname of the legacy JSON file.
 * @param migratedJson pathname of the updated JSON file.
 * @param spaces how to expand JSON spaces.
 * @returns filtered version of the original translations.
 */
export async function filterTranslations(
    originals: TranslationsResultV1_0,
    migrated: TranslationsResultV1_0,
    locales: ReadonlyArray<string>,
    legacyJson: string,
    migratedJson: string,
    spaces: string,
): Promise<TranslationsResultV1_0> {
    if (locales.length === 0) {
        return originals;
    }
    const filteredMigratedTranslations = migrated.translations.filter((id) => locales.includes(id.language));
    const filteredOriginalsTranslations = originals.translations.filter((id) => locales.includes(id.language));
    const filteredMigrated: TranslationsResultV1_0 = {
        translations: filteredMigratedTranslations,
    };
    const filteredOriginals: TranslationsResultV1_0 = {
        translations: filteredOriginalsTranslations,
    };
    const migratedText = JSON.stringify(filteredMigrated, null, spaces);
    await Deno.writeTextFile(migratedJson, migratedText);
    const originalsText = JSON.stringify(filteredOriginals, null, spaces);
    await Deno.writeTextFile(legacyJson, originalsText);
    return filteredOriginals;
}

/**
 * "migrate" the ratings structure.
 * @param ratings legacy ratings
 * @returns zeroed ratings structure.
 */
export function migrateRatings(ratings: Record<string, number>): Record<string, number> {
    const updated = ratings;
    for (const n in ratings) {
        updated[n] = 0;
    }
    return updated;
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
            const writeAccess = await Deno.permissions.request({ name: 'write', path: locations.ctx.hosts[host].baseDirectory });
            if (writeAccess.state !== 'granted') {
                console.error(`Error: write access is required to pluginsDir ${locations.ctx.hosts[host].baseDirectory}`);
                return 1;
            }
            const readAccess = await Deno.permissions.request({ name: 'read', path: locations.ctx.hosts[host].baseDirectory });
            if (readAccess.state !== 'granted') {
                console.error(`Error: read access is required to pluginsDir ${locations.ctx.hosts[host].baseDirectory}`);
                return 1;
            }
        }
    }
    // check for permissions
    const apiAccess = await Deno.permissions.request({ name: 'net', host: locations.apiHost });
    if (apiAccess.state !== 'granted') {
        console.error(`Error: network access is required to api host ${locations.apiHost}`);
        return 1;
    }
    const downloadsAccess = await Deno.permissions.request({ name: 'net', host: locations.downloadsHost });
    if (downloadsAccess.state !== 'granted') {
        console.error(`Error: network access is required to downloads host ${locations.downloadsHost}`);
        return 1;
    }
    return 0;
}

/**
 * create a single 'key' value for file resource that could live on any host.
 * @param host logical host name. e.g. 'downloads'
 * @param relative relative pathname
 * @returns key used for files[] hash
 */
export function getFilesKey(host: string, relative: string): string {
    return `${host}:${relative}`;
}

/**
 * potentially filter to the most recent versions.
 * @param list full list of all of the versions.
 * @param maxLength maximum number of items to include (0 == all)
 * @returns list of recent versions.
 */
export function recentVersions(list: Array<string>, maxLength: number): Array<string> {
    // some versions are not "valid" semver, so filter them out silently
    const filtered = list.filter((v) => compareVersions.validate(v));
    const sorted = filtered.sort(compareVersions).reverse();
    if (maxLength > 0) {
        return sorted.slice(0, maxLength);
    }
    // return the full list so we will eventually get the non semver ones.
    return list;
}

/**
 * Attempt to download a group of files.
 * @param options command-line options.
 * @param group collection of files to be downloaded.
 * @returns true if they were all downloaded successfully.
 */
async function downloadRequestGroup(
    options: CommandOptions,
    locations: StandardLocations,
    group: RequestGroup,
): Promise<boolean> {
    const groupStatus: ArchiveGroupStatus = await loadGroupStatus(locations, group);
    if (downloadIsComplete(options, group, groupStatus)) {
        jreporter({
            operation: 'downloadRequestGroup',
            section: group.section,
            slug: group.slug,
            filename: group.statusFilename.relative,
            is_complete: true,
            skipped: true,
        });
        return true;
    }

    let ok = true;
    const filtered = group.requests.filter((item) =>
        item.upstream && item.relative && item.host &&
        (options.force || options.rehash || (groupStatus.files[getFilesKey(item.host, item.relative)]?.status !== 'complete'))
    );

    jreporter({
        operation: 'downloadRequestGroup',
        section: group.section,
        slug: group.slug,
        action: 'filtered',
        size: filtered.length,
    });
    for (const item of filtered) {
        if (item.upstream && item.relative && item.host) {
            const key = getFilesKey(item.host, item.relative);
            // we need this one
            const needHash = options.rehash ||
                !groupStatus.files[key] ||
                !groupStatus.files[key].md5 ||
                !groupStatus.files[key].sha1 ||
                !groupStatus.files[key].sha256;

            const fileStatus = await downloadFile(reporter, jreporter, locations.ctx, item, options.force, needHash);
            if (groupStatus.files[key]) {
                groupStatus.files[key].status = fileStatus.status;
                groupStatus.files[key].when = fileStatus.when;
                groupStatus.files[key].is_readonly = fileStatus.is_readonly;
                if (options.rehash) {
                    groupStatus.files[key].md5 = fileStatus.md5;
                    groupStatus.files[key].sha1 = fileStatus.sha1;
                    groupStatus.files[key].sha256 = fileStatus.sha256;
                }
            } else {
                groupStatus.files[key] = fileStatus;
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

    jreporter({
        operation: 'downloadRequestGroup',
        section: group.section,
        slug: group.slug,
        filename: group.statusFilename.relative,
        is_complete: ok,
        skipped: false,
    });
    await saveGroupStatus(locations, group, groupStatus, options.jsonSpaces);

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
    groupStatus: ArchiveGroupStatus,
): boolean {
    if (options.synced && group.noChanges) {
        return true;
    }
    if (options.force || options.rehash || !groupStatus.is_complete) {
        return false;
    }
    for (const r of group.requests) {
        if (r.host && r.relative && !groupStatus.files[getFilesKey(r.host, r.relative)]) {
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
async function saveGroupStatus(
    locations: StandardLocations,
    group: RequestGroup,
    groupStatus: ArchiveGroupStatus,
    jsonSpaces: string
): Promise<void> {
    if (!group.statusFilename.relative || !group.statusFilename.host) {
        throw new Deno.errors.BadResource(`group.statusFilename.relative and group.statusFilename.host must be defined`);
    }
    const baseDirectory = locations.ctx.hosts[group.statusFilename.host].baseDirectory;
    if (!baseDirectory) {
        throw new Deno.errors.BadResource(`group.statusFilename.host=${group.statusFilename.host} is not configured`);
    }
    const pathname = path.join(baseDirectory, group.statusFilename.relative);
    try {
        const json = JSON.stringify(groupStatus, null, jsonSpaces);
        const dirname = path.dirname(pathname);
        await Deno.mkdir(dirname, { recursive: true });
        await Deno.writeTextFile(pathname, json);
    } catch (e) {
        console.error(`Error: unable to save status: ${pathname} error: ${e}`);
        jreporter({ operation: 'downloadGroup', filename: pathname, error: e });
    }
    jreporter({ operation: 'downloadGroup', filename: pathname, is_complete: groupStatus.is_complete });
}

function getLocationPathname(
    locations: StandardLocations,
    host: string,
    relative: string
): string {
    const baseDirectory = locations.ctx.hosts[host].baseDirectory;
    if (!baseDirectory) {
        throw new Deno.errors.BadResource(`host=${host} is not configured`);
    }
    return path.join(baseDirectory, relative);
}

/**
 * attempt to read the status file, or initialize a new one.
 * @param group collection of files to be downloaded.
 * @returns previous group status, or an empty new one.
 */
async function loadGroupStatus(
    locations: StandardLocations,
    group: RequestGroup
): Promise<ArchiveGroupStatus> {
    const results: ArchiveGroupStatus = {
        source_name: group.sourceName,
        section: group.section,
        slug: group.slug,
        is_complete: false,
        when: Date.now(),
        files: {},
    };
    if (group.statusFilename.relative && group.statusFilename.host) {
        const pathname = getLocationPathname(locations, group.statusFilename.host, group.statusFilename.relative);
        try {
            const contents = await Deno.readTextFile(pathname);
            const parsed = JSON.parse(contents);
            if (
                parsed &&
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

/**
 * determine which locales should be kept.
 * @param locations how to get resources.
 * @returns the list of interesting locales, or an empty list to indicate all.
 */
async function getListOfLocales(
    locations: StandardLocations,
): Promise<Array<string>> {
    if (locations.interestingLocales) {
        const { host, relative } = locations.interestingLocales(locations.ctx);
        if (host && relative) {
            const pathname = getLocationPathname(locations, host, relative);
            return await getInterestingSlugs(reporter, jreporter, pathname);
        }
    }
    return [];
}

/**
 * handle the core section. the core release files and the associated
 * l10n files and archives.
 * @param options command-line options.
 * @param locations how to get resources.
 * @param locales list of locales we care about.
 */
async function coreSection(
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
): Promise<void> {
    const [changed, releasesMap] = await getCoreReleases(reporter, jreporter, options, locations);
    if (!changed && options.synced) {
        jreporter({ operation: 'coreSection', action: 'no-changes' });
        return;
    }
    const releases = await getListOfReleases(reporter, jreporter, locations, releasesMap);
    let total = 0;
    let successful = 0;
    let failures = 0;
    for (const release of releases) {
        const group = await createCoreRequestGroup(reporter, jreporter, options, locations, locales, release);
        const ok = await downloadRequestGroup(options, locations, group);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        total += 1;
    }
    jreporter({ operation: 'coreSection', action: 'complete', total, successful, failures });
}

/**
 * handle the download of plugins and the associated files.
 * @param options command-line options.
 * @param locations how to get resources.
 * @param locales  list of locales we care about.
 */
async function pluginsSection(
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
): Promise<void> {
    const pluginLists = await getItemLists(reporter, jreporter, locations, 'plugin');
    await saveItemLists(reporter, jreporter, locations, options, 'plugin', pluginLists);

    let total = 0;
    let successful = 0;
    let failures = 0;
    const slugs = getInUpdateOrder(pluginLists);
    for (const slug of slugs) {
        const group = await createPluginRequestGroup(reporter, jreporter, options, locations, locales, slug);
        const ok = await downloadRequestGroup(options, locations, group);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        total += 1;
    }
    jreporter({ operation: 'pluginsSection', action: 'complete', total, successful, failures });
}

/**
 * handle the download of the themes and associated files.
 * @param options command-line options.
 * @param locations how to get resources.
 * @param locales  list of locales we care about.
 */
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
        const ok = await downloadRequestGroup(options, locations, group);
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
 * @param argv arguments passed after the `deno run -N pluperfect.ts`
 * @returns 0 if ok, 1 on error, 2 on usage errors.
 */
export async function pluperfect(argv: Array<string>): Promise<number> {
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

    if (await checkPermissions(locations)) {
        return 1;
    }
    const locales = await getListOfLocales(locations);
    await pluginsSection(options, locations, locales);
    await themesSection(options, locations, locales);
    await coreSection(options, locations, locales);
    jreporter({ operation: 'main', program: PROGRAM_NAME, version: VERSION, started: timestamp });
    reporter(`finished:   ${getISOtimestamp()}`);
    return 0;
}

const exitCode: number = await pluperfect(Deno.args);
Deno.exit(exitCode);
