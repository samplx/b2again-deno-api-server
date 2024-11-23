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

import { parseArgs, type ParseOptions } from 'jsr:@std/cli/parse-args';
import {
    type ConsoleReporter,
    DISABLED_CONSOLE_REPORTER,
    DISABLED_JSON_REPORTER,
    ENABLED_CONSOLE_REPORTER,
    ENABLED_JSON_REPORTER,
    getISOtimestamp,
    type JsonReporter,
} from '../lib/reporter.ts';
import { type CommandOptions, getParseOptions, printHelp } from './lib/options.ts';
import getStandardConventions from '../lib/b2again-conventions.ts';
import {
    type ArchiveGroupName,
    CommonUrlProvider,
    hasPathname,
    type LiveUrlProviderResult,
    type MigrationContext,
    type StandardConventions,
    toPathname,
    type UrlProviderResult,
    type VersionLocaleVersionUrlProvider,
} from '../lib/standards.ts';
import { createCoreRequestGroup, getCoreReleases, loadInterestingReleases, loadListOfReleases } from './lib/core.ts';
import { getInterestingSlugs, getInUpdateOrder, getItemLists, saveItemLists } from './lib/item-lists.ts';
import { downloadFile, downloadLiveFile } from './lib/downloads.ts';
import type { ArchiveGroupStatus } from '../lib/archive-status.ts';
import * as path from 'jsr:@std/path';
import { createThemeRequestGroup } from './lib/themes.ts';
import { createPluginRequestGroup } from './lib/plugins.ts';
import type { TranslationEntry, TranslationsResultV1_0 } from '../lib/api.ts';
import { compareVersions } from 'https://deno.land/x/compare_versions@0.4.0/compare-versions.ts';
import { s3Cleanup, s3Setup } from './lib/s3files.ts';
import { load } from 'jsr:@std/dotenv';
import { escape } from 'jsr:@std/regexp';

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

/**
 * a simple map of URL's that 404.
 */
interface MissingMap {
    [slug: string]: true;
}

export type LiveUrlGetValue<T extends Record<string, unknown>> = (original: T) => string;
export type LiveUrlUpdateValue<T extends Record<string, unknown>> = (original: T, url: string) => T;
export type LiveUrlRequest<T extends Record<string, unknown>> = [LiveUrlProviderResult, LiveUrlGetValue<T>, LiveUrlUpdateValue<T>];

/**
 * a collection of requests associated with a single upstream "item".
 * either a core release, or a pattern, a plugin or a theme.
 * includes all of the readOnly (zip), meta data, l10n, and live files.
 */
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
     * group item id.
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
    liveRequests: Array<LiveUrlRequest<Record<string, unknown>>>;

    /**
     * was there any error during processing
     */
    error?: string;

    /**
     * were there any changes to the parent JSON file.
     */
    noChanges: boolean;

    migratedJsonPathname?: string;
    legacyJsonPathname?: string;
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
 * migrate the URL text from old to new.
 * @param previous list of previous url values as strings
 * @param updated updated list of the same urls
 * @param input sections portion
 * @returns sections with any URL values updated.
 */
export function migrateSectionUrls(
    previous: Array<string>,
    updated: Array<string>,
    input: Record<string, string | undefined>,
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of Object.keys(input)) {
        let contents = input[key] ?? '';
        for (let n = 0; (n < previous.length) && (n < updated.length); n++) {
            const search = new RegExp(escape(previous[n]), 'g');
            const replacement = updated[n];
            contents = contents.replaceAll(search, replacement);
        }
        result[key] = contents;
    }
    return result;
}

/**
 * Verify process has permissions needed.
 * @param conventions standard location of resources.
 * @returns 1 on failure, 0 if permissions exist.
 */
async function checkPermissions(conventions: StandardConventions): Promise<number> {
    const envAccess = await Deno.permissions.request({ name: 'env' });
    if (envAccess.state !== 'granted') {
        console.error(`Error: process environment access is required to load parameters.`);
        return 1;
    }
    for (const host in conventions.ctx.hosts) {
        if (conventions.ctx.hosts[host].baseDirectory) {
            const writeAccess = await Deno.permissions.request({ name: 'write', path: conventions.ctx.hosts[host].baseDirectory });
            if (writeAccess.state !== 'granted') {
                console.error(`Error: write access is required to pluginsDir ${conventions.ctx.hosts[host].baseDirectory}`);
                return 1;
            }
            const readAccess = await Deno.permissions.request({ name: 'read', path: conventions.ctx.hosts[host].baseDirectory });
            if (readAccess.state !== 'granted') {
                console.error(`Error: read access is required to pluginsDir ${conventions.ctx.hosts[host].baseDirectory}`);
                return 1;
            }
        }
    }
    // check for permissions
    const apiAccess = await Deno.permissions.request({ name: 'net', host: conventions.apiHost });
    if (apiAccess.state !== 'granted') {
        console.error(`Error: network access is required to api host ${conventions.apiHost}`);
        return 1;
    }
    const downloadsAccess = await Deno.permissions.request({ name: 'net', host: conventions.downloadsHost });
    if (downloadsAccess.state !== 'granted') {
        console.error(`Error: network access is required to downloads host ${conventions.downloadsHost}`);
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
    return filtered;
}

async function downloadStandard(
    options: CommandOptions,
    conventions: StandardConventions,
    group: RequestGroup,
    missing: MissingMap,
    groupStatus: ArchiveGroupStatus,
): Promise<boolean> {
    let ok = true;
    const filtered = group.requests.filter((item) =>
        item.upstream && item.relative && item.host &&
        (options.force || options.rehash || (groupStatus.files[getFilesKey(item.host, item.relative)]?.status !== 'complete') &&
                !missing[item.upstream])
    );

    jreporter({
        operation: 'downloadStandard',
        section: group.section,
        slug: group.slug,
        action: 'filtered',
        size: filtered.length,
        original_size: group.requests.length,
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

            const fileStatus = await downloadFile(reporter, jreporter, conventions.ctx, item, options.force, needHash);
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
    return ok;
}

async function downloadLive(
    options: CommandOptions,
    conventions: StandardConventions,
    group: RequestGroup,
    missing: MissingMap,
    groupStatus: ArchiveGroupStatus,
): Promise<boolean> {
    if (!options.live || (group.liveRequests.length === 0)) {
        return true;
    }
    if (!groupStatus.next_generation) {
        groupStatus.next_generation = 1;
    }
    if (!groupStatus.live) {
        groupStatus.live = {};
    }
    let ok = true;
    const filtered = group.liveRequests.filter((item) => {
        const [liveUrl, _f, _f2] = item;
        return !missing[liveUrl.upstream];
    });

    jreporter({
        operation: 'downloadLive',
        section: group.section,
        slug: group.slug,
        action: 'filtered',
        size: filtered.length,
        original_size: group.liveRequests.length,
    });
    if (group.migratedJsonPathname) {
        const json = await Deno.readTextFile(group.migratedJsonPathname);
        const raw = JSON.parse(json);
        const originals: Array<string> = [];
        const updated: Array<string> = [];
        if (raw && (typeof raw === 'object')) {
            let info = raw as Record<string, unknown>;
            for (const item of filtered) {
                const [liveUrl, getF, updateF] = item;
                const original = getF(info);
                originals.push(original);
                const status = await downloadLiveFile(jreporter, conventions, liveUrl.host, liveUrl, groupStatus.next_generation);
                const name = status.key.substring(status.key.indexOf(':') + 1);
                const url = new URL(name, conventions.ctx.hosts[liveUrl.host].baseUrl);
                info = updateF(info, url.toString());
                updated.push(getF(info));
                groupStatus.live[status.key] = status;
                if (status.generation === groupStatus.next_generation) {
                    groupStatus.next_generation += 1;
                }
            }
            if (info.sections && (typeof info.sections === 'object')) {
                info.sections = migrateSectionUrls(originals, updated, info.sections as Record<string, string | undefined>);
            }
            const text = JSON.stringify(info, null, conventions.jsonSpaces);
            await Deno.writeTextFile(group.migratedJsonPathname, text);
        } else {
            throw new Deno.errors.BadResource(`contents of ${group.migratedJsonPathname} is not as expected`);
        }
    }
    return ok;
}

/**
 * Attempt to download a group of files.
 * @param options command-line options.
 * @param group collection of files to be downloaded.
 * @returns true if they were all downloaded successfully.
 */
async function downloadRequestGroup(
    options: CommandOptions,
    conventions: StandardConventions,
    group: RequestGroup,
    missing: MissingMap,
): Promise<boolean> {
    const groupStatus: ArchiveGroupStatus = await loadGroupStatus(conventions, group);
    if (group.error) {
        jreporter({
            operation: 'downloadRequestGroup',
            section: group.section,
            slug: group.slug,
            filename: group.statusFilename.relative,
            is_complete: false,
            skipped: false,
            error: group.error,
        });
        return false;
    }
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

    let ok = await downloadStandard(options, conventions, group, missing, groupStatus);

    ok = ok && await downloadLive(options, conventions, group, missing, groupStatus);

    groupStatus.is_complete = ok;

    jreporter({
        operation: 'downloadRequestGroup',
        section: group.section,
        slug: group.slug,
        filename: group.statusFilename.relative,
        is_complete: ok,
        skipped: false,
    });
    await saveGroupStatus(conventions, group, groupStatus);

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
    if (options.force || options.rehash || options.live || !groupStatus.is_complete) {
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
    conventions: StandardConventions,
    group: RequestGroup,
    groupStatus: ArchiveGroupStatus,
): Promise<void> {
    if (!group.statusFilename.relative || !group.statusFilename.host) {
        throw new Deno.errors.BadResource(`group.statusFilename.relative and group.statusFilename.host must be defined`);
    }
    const baseDirectory = conventions.ctx.hosts[group.statusFilename.host].baseDirectory;
    if (!baseDirectory) {
        throw new Deno.errors.BadResource(`group.statusFilename.host=${group.statusFilename.host} is not configured`);
    }
    const pathname = path.join(baseDirectory, group.statusFilename.relative);
    try {
        const json = JSON.stringify(groupStatus, null, conventions.jsonSpaces);
        const dirname = path.dirname(pathname);
        await Deno.mkdir(dirname, { recursive: true });
        await Deno.writeTextFile(pathname, json);
    } catch (e) {
        console.error(`Error: unable to save status: ${pathname} error: ${e}`);
        jreporter({ operation: 'downloadGroup', filename: pathname, error: e });
    }
    jreporter({ operation: 'downloadGroup', filename: pathname, is_complete: groupStatus.is_complete });
}

/**
 * attempt to read the status file, or initialize a new one.
 * @param group collection of files to be downloaded.
 * @returns previous group status, or an empty new one.
 */
async function loadGroupStatus(
    conventions: StandardConventions,
    group: RequestGroup,
): Promise<ArchiveGroupStatus> {
    const results: ArchiveGroupStatus = {
        source_name: group.sourceName,
        section: group.section,
        slug: group.slug,
        is_complete: false,
        when: Date.now(),
        files: {},
    };
    if (hasPathname(conventions.ctx, group.statusFilename)) {
        const pathname = toPathname(conventions.ctx, group.statusFilename);
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
 * @param conventions how to get resources.
 * @returns the list of interesting locales, or an empty list to indicate all.
 */
async function getListOfLocales(
    conventions: StandardConventions,
): Promise<Array<string>> {
    if (conventions.interestingLocales) {
        const locales = conventions.interestingLocales(conventions.ctx);
        if (hasPathname(conventions.ctx, locales)) {
            const pathname = toPathname(conventions.ctx, locales);
            return await getInterestingSlugs(reporter, jreporter, pathname);
        }
    }
    return [];
}

/**
 * determine which core releases should be processed.
 * @param options command-line options.
 * @param conventions where to find resources.
 * @returns list of core releases to be processed. may be empty.
 */
async function getListOfReleases(
    options: CommandOptions,
    conventions: StandardConventions,
): Promise<ReadonlyArray<string>> {
    if (options.list) {
        const [changed, releasesMap] = await getCoreReleases(reporter, jreporter, conventions);
        if (!changed && options.synced) {
            jreporter({ operation: 'coreSection', action: 'no-changes' });
            return [];
        }
        const releases = await loadListOfReleases(reporter, jreporter, conventions, releasesMap);
        return releases;
    }
    return await loadInterestingReleases(reporter, jreporter, conventions);
}

/**
 * create a map of missing URL's.
 * @param conventions where to find resources.
 * @param provider how to get the missing slugs filename.
 * @returns map of URL's that will 404 to `true`.
 */
async function getMissingMap(
    conventions: StandardConventions,
    provider: undefined | CommonUrlProvider,
): Promise<MissingMap> {
    let missingList: Array<string> = [];
    if (provider && hasPathname(conventions.ctx, provider(conventions.ctx))) {
        missingList = await getInterestingSlugs(reporter, jreporter, toPathname(conventions.ctx, provider(conventions.ctx)));
    }
    const missingMap: MissingMap = {};
    for (const item of missingList) {
        missingMap[item] = true;
    }
    return missingMap;
}

/**
 * handle the core section. the core release files and the associated
 * l10n files and archives.
 * @param options command-line options.
 * @param conventions how to get resources.
 * @param locales list of locales we care about.
 */
async function coreSection(
    options: CommandOptions,
    conventions: StandardConventions,
    locales: ReadonlyArray<string>,
): Promise<void> {
    const releases = await getListOfReleases(options, conventions);
    if (releases.length > 0) {
        let total = 0;
        let successful = 0;
        let failures = 0;
        const missingMap: MissingMap = await getMissingMap(conventions, conventions.missingCore);
        for (const release of releases) {
            const group = await createCoreRequestGroup(reporter, jreporter, options, conventions, locales, release);
            const ok = await downloadRequestGroup(options, conventions, group, missingMap);
            if (ok) {
                successful += 1;
            } else {
                failures += 1;
            }
            total += 1;
        }
        jreporter({ operation: 'coreSection', action: 'complete', total, successful, failures });
    }
}

/**
 * handle the download of the editor patterns and associated files.
 * @param options command-line options.
 * @param conventions how to get resources.
 * @param locales  list of locales we care about.
 */
// async function patternsSection(
//     options: CommandOptions,
//     conventions: StandardConventions,
//     locales: ReadonlyArray<string>,
// ): Promise<void> {

//     let total = 0;
//     let successful = 0;
//     let failures = 0;
//     jreporter({ operation: 'patternsSection', action: 'complete', total, successful, failures });
// }

/**
 * handle the download of plugins and the associated files.
 * @param options command-line options.
 * @param conventions how to get resources.
 * @param locales  list of locales we care about.
 */
async function pluginsSection(
    options: CommandOptions,
    conventions: StandardConventions,
    locales: ReadonlyArray<string>,
): Promise<void> {
    let slugs: Array<string> = [];
    if (options.list) {
        const pluginLists = await getItemLists(reporter, jreporter, conventions, 'plugin');
        await saveItemLists(reporter, jreporter, conventions, 'plugin', pluginLists);
        slugs = getInUpdateOrder(pluginLists);
    } else {
        const effective = conventions.pluginSlugs.effective;
        if (effective) {
            const pathname = toPathname(conventions.ctx, effective(conventions.ctx));
            slugs = await getInterestingSlugs(reporter, jreporter, pathname);
        }
    }

    let total = 0;
    let successful = 0;
    let failures = 0;
    let unchanged = 0;
    let action = 'complete';
    const noChangeCount = parseInt(options.noChangeCount);
    const missingMap: MissingMap = await getMissingMap(conventions, conventions.pluginSlugs.missing);
    for (const slug of slugs) {
        const group = await createPluginRequestGroup(reporter, jreporter, options, conventions, locales, slug);
        if (group.noChanges) {
            unchanged += 1;
            if ((unchanged > noChangeCount) && (noChangeCount !== 0)) {
                action = 'no-change-count';
                break;
            }
        }
        const ok = await downloadRequestGroup(options, conventions, group, missingMap);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        total += 1;
    }
    jreporter({ operation: 'pluginsSection', action, total, successful, failures, unchanged });
}

/**
 * handle the download of the themes and associated files.
 * @param options command-line options.
 * @param conventions how to get resources.
 * @param locales  list of locales we care about.
 */
async function themesSection(
    options: CommandOptions,
    conventions: StandardConventions,
    locales: ReadonlyArray<string>,
): Promise<void> {
    let slugs: Array<string> = [];
    if (options.list) {
        const themeLists = await getItemLists(reporter, jreporter, conventions, 'theme');
        await saveItemLists(reporter, jreporter, conventions, 'theme', themeLists);
        slugs = getInUpdateOrder(themeLists);
    } else {
        const effective = conventions.themeSlugs.effective;
        if (effective) {
            const pathname = toPathname(conventions.ctx, effective(conventions.ctx));
            slugs = await getInterestingSlugs(reporter, jreporter, pathname);
        }
    }

    let total = 0;
    let successful = 0;
    let failures = 0;
    let unchanged = 0;
    let action = 'complete';
    const noChangeCount = parseInt(options.noChangeCount);
    const missingMap: MissingMap = await getMissingMap(conventions, conventions.themeSlugs.missing);
    for (const slug of slugs) {
        const group = await createThemeRequestGroup(reporter, jreporter, options, conventions, locales, slug);
        if (group.noChanges) {
            unchanged += 1;
            if ((unchanged > noChangeCount) && (noChangeCount !== 0)) {
                action = 'no-change-count';
                break;
            }
        }
        const ok = await downloadRequestGroup(options, conventions, group, missingMap);
        if (ok) {
            successful += 1;
        } else {
            failures += 1;
        }
        total += 1;
    }
    jreporter({ operation: 'themesSection', action, total, successful, failures, unchanged });
}

/**
 * setup any S3 sinks. Each has an associated S3 Client and a temporary
 * directory where in-transit files can live.
 * @param conventions where to find things.
 */
async function setupS3Hosts(conventions: StandardConventions): Promise<void> {
    for (const host of Object.keys(conventions.ctx.hosts)) {
        const s3sink = conventions.ctx.hosts[host]?.s3sink;
        if (s3sink) {
            await s3Setup(s3sink);
        }
    }
}

/**
 * the `pluperfect` download tool main program.
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

    // to make my life easier, we update settings to make defaults
    // a little nicer.

    // we will execute all sections if none are explicitly selected.
    if (!options.core && !options.patterns && !options.plugins && !options.themes) {
        options.core = true;
        options.patterns = true;
        options.plugins = true;
        options.themes = true;
    }

    // we will perform all steps if none are explicitly selected.
    if (!options.l10n && !options.list && !options.meta && !options.readOnly && !options.summary && !options.live) {
        options.l10n = true;
        options.list = true;
        options.meta = true;
        options.readOnly = true;
        options.summary = true;
        options.live = true;
    }

    reporter(`${PROGRAM_NAME} v${VERSION}`);
    const timestamp = getISOtimestamp();
    reporter(`started:   ${timestamp}`);

    const conventions = getStandardConventions();

    if (await checkPermissions(conventions)) {
        return 1;
    }
    // load .env file if it exists
    await load({
        export: true,
    });
    // with the environment setup, we have creds for S3/R2
    await setupS3Hosts(conventions);

    // determine if we want a subset of locales or not.
    const locales = await getListOfLocales(conventions);

    // if (options.patterns) {
    //     await patternsSection(options, conventions, locales);
    // }
    if (options.plugins) {
        await pluginsSection(options, conventions, locales);
    }
    if (options.themes) {
        await themesSection(options, conventions, locales);
    }
    if (options.core) {
        await coreSection(options, conventions, locales);
    }
    await s3Cleanup();
    jreporter({ operation: 'main', program: PROGRAM_NAME, version: VERSION, started: timestamp });
    reporter(`finished:   ${getISOtimestamp()}`);
    return 0;
}

const exitCode: number = await pluperfect(Deno.args);
Deno.exit(exitCode);
