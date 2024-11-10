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
import { ReleaseStatus, TranslationsResultV1_0 } from "../../lib/api.ts";
import { CommandOptions } from "./options.ts";
import { downloadMetaLegacyJson } from "./downloads.ts";
import { MigrationContext, StandardLocations, UrlProviderResult, VersionLocaleVersionUrlProvider } from "../../lib/standards.ts";
import { ConsoleReporter, JsonReporter } from "../../lib/reporter.ts";
import { TranslationEntry } from "../../lib/api.ts";
import { getInterestingSlugs } from "./item-lists.ts";

/**
 * migrated view of the 'releases' (stability-check) file.
 */
export interface CoreReleases {
    latest?: string;
    insecure: Array<string>;
    outdated: Array<string>;
}

/**
 * Convert release information from legacy format.
 * @param o thing to convert
 * @returns converted release object
 */
function translateRelease(o: Record<string, unknown>): Record<string, unknown> {
    const release: CoreReleases = {
        insecure: [],
        outdated: []
    };
    if (o && (typeof o === 'object')) {
        const releasesMap = o as Record<string, string>;
        for (const id in releasesMap) {
            const status = releasesMap[id];
            if (status === 'insecure') {
                release.insecure.push(id);
            } else if (status === 'outdated') {
                release.outdated.push(id);
            } else if (status === 'latest') {
                release.latest = id;
            }
        }
    }
    return release as unknown as Record<string, unknown>;
}

/**
 * get the list of releases from the API. Always download this.
 * @param options command-line options.
 * @param metaDir where to store the results.
 * @returns map of release id to its current status.
 */
export async function getCoreReleases(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    options: CommandOptions,
    locations: StandardLocations
): Promise<Record<string, ReleaseStatus>> {
    const apiUrl = new URL(`/core/stable-check/1.0/`, `https://${locations.apiHost}/`);
    const legacyJson = locations.legacyReleases(locations.ctx);
    const migratedJson = locations.releases(locations.ctx);
    if (!migratedJson.host || !legacyJson.pathname || !migratedJson.pathname) {
        throw new Deno.errors.NotSupported(`locations values for releases are not valid.`);
    }
    const [ releases, _migrated ] = await downloadMetaLegacyJson(reporter, jreporter, migratedJson.host,
        legacyJson.pathname, migratedJson.pathname, apiUrl,
            true, options.jsonSpaces, translateRelease);
    if (releases && typeof releases === 'object') {
        return releases as Record<string, ReleaseStatus>;
    }
    throw new Deno.errors.BadResource(`unable to read core stable-check data`);
}

/**
 * Determine what releases to download.
 * @param releasesMap map of release id to their current status
 * @param listName which set of releases do we want
 * @param interestingFilename a file we may load with release ids.
 * @returns list of release ids that should be downloaded.
 */
export async function getListOfReleases(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    releasesMap: Record<string, ReleaseStatus>
): Promise<Array<string>> {
    if (locations.interestingReleases) {
        const { host, pathname } = locations.interestingReleases(locations.ctx);
        if (host && pathname) {
            const slugs = await getInterestingSlugs(reporter, jreporter, pathname);
            return slugs;
        }
    }
    const releases = translateRelease(releasesMap) as unknown as CoreReleases;
    const list: Array<string> = [];
    if (releases.latest) {
        list.push(releases.latest, ...releases.outdated, ...releases.insecure);
    }
    return list;
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
    release: string
): (original: Record<string, unknown>) => Record<string, unknown> {
    return function (o: Record<string, unknown>): Record<string, unknown> {
        if (o && (typeof o === 'object') && ('translations' in o) && Array.isArray(o.translations)) {
            const translations: Array<TranslationEntry> = [];
            for (const t of o.translations) {
                if (t && (typeof t === 'object') &&
                    ('package' in t) && (typeof t.package === 'string')) {
                    const translation = t as TranslationEntry;
                    const updated = { ... translation };
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
    }
}

export async function filterTranslations(
    originals: TranslationsResultV1_0,
    migrated: TranslationsResultV1_0,
    locales: ReadonlyArray<string>,
    legacyJson: string,
    migratedJson: string,
    spaces: string
): Promise<TranslationsResultV1_0> {
    const filteredMigratedTranslations = migrated.translations.filter((id) => locales.includes(id.language));
    const filteredOriginalsTranslations = originals.translations.filter((id) => locales.includes(id.language));
    const filteredMigrated: TranslationsResultV1_0 =  {
        translations: filteredMigratedTranslations
    };
    const filteredOriginals: TranslationsResultV1_0 = {
        translations: filteredOriginalsTranslations
    }
    const migratedText = JSON.stringify(filteredMigrated, null, spaces);
    await Deno.writeTextFile(migratedJson, migratedText);
    const originalsText = JSON.stringify(filteredOriginals, null, spaces);
    await Deno.writeTextFile(legacyJson, originalsText);
    return filteredOriginals;
}

/**
 * Read a releases translation object from the upstream API. In order to
 * support limiting the size of the archive, the list locales to be downloaded
 * may be limited. The default is to download all locales, but the
 * `--localesFilename` option, and the `locales=name` option can be used
 * to limit the locales downloaded.
 * @param options command-line options.
 * @param metaDir where to store the result.
 * @param release id string for the release. e.g. '6.2.2'
 * @param outdated true if latest transition is in progress.
 * @returns translations object.
 */
export async function getCoreTranslations(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    options: CommandOptions,
    release: string,
    outdated: boolean,
    locales: ReadonlyArray<string>
): Promise<TranslationsResultV1_0> {
    const apiUrl = new URL(`/translations/core/1.0/`, `https://${locations.apiHost}/`);
    apiUrl.searchParams.append('version', release);
    const migratedJson = locations.coreTranslationV1_0(locations.ctx, release);
    const legacyJson = locations.legacyCoreTranslationV1_0(locations.ctx, release);
    if (!migratedJson.host || !migratedJson.pathname || !legacyJson.pathname) {
        throw new Deno.errors.NotSupported(`coreTranslationV1_0 location and legacyCoreTranslationV1_0 are misconfigured.`);
    }
    const migrator = getTranslationMigration(locations.coreL10nZip, locations.ctx, release);
    const [ originalTranslations, migratedTranslations ] = await downloadMetaLegacyJson(reporter, jreporter, migratedJson.host,
        legacyJson.pathname, migratedJson.pathname, apiUrl, options.force || outdated,
        options.jsonSpaces, migrator);
    const originals = originalTranslations as unknown as TranslationsResultV1_0;
    const migrated = migratedTranslations as unknown as TranslationsResultV1_0;
    if (locales.length > 0) {
        // we need to filter the locales to the ones that are "interesting"
        return await filterTranslations(originals, migrated, locales,
            legacyJson.pathname, migratedJson.pathname, options.jsonSpaces);
    }
    return originals;
}

/**
 * Read a release and locale specific set of checksums from the upstream API.
 * @param locations how to access references.
 * @param release id string for the release. e.g. '6.2.2'
 * @param locale specific locale. e.g. 'de_DE'
 */
export function getChecksums(
    locations: StandardLocations,
    release: string,
    locale: string
): UrlProviderResult {
    const apiUrl = new URL(`/core/checksums/1.0/`, `https://${locations.apiHost}/`);
    apiUrl.searchParams.append('version', release);
    apiUrl.searchParams.append('locale', locale);
    return locations.coreChecksumsV1_0(locations.ctx, release, locale, apiUrl.toString());
}

/**
 * Read a release and locale specific set of credits from the upstream API.
 * This is a simple copy, which is bad for the non-core developers, since the
 * list provided is a random subset, rather than matt's list, which **always** has
 * matt's name in it.
 * [FIXME?] Figure out how to load the entire set of contributors using a random
 * source.
 * @param reporter how to report non-error text.
 * @param jreporter how to report structured JSON.
 * @param locations how to access references.
 * @param options command-line options.
 * @param release id string for the release. e.g. '6.2.2'
 * @param locale specific locale. e.g. 'de_DE'
 * @param outdated true if latest transition is in progress.
 */
export function getCredits(
    locations: StandardLocations,
    release: string,
    locale: string
): UrlProviderResult {
    const apiUrl = new URL(`/core/credits/1.1/`, `https://${locations.apiHost}/`);
    apiUrl.searchParams.append('version', release);
    apiUrl.searchParams.append('locale', locale);
    return locations.coreCreditsV1_1(locations.ctx, release, locale, apiUrl.toString());
}


/**
 * Read a release and locale specific set of importers from the upstream API.
 * @param locations how to access references.
 * @param release id string for the release. e.g. '6.2.2'
 * @param locale specific locale. e.g. 'de_DE'
 */
export function getImporters(
    locations: StandardLocations,
    release: string,
    locale: string
): UrlProviderResult {
    const apiUrl = new URL(`/core/importers/1.1/`, `https://${locations.apiHost}/`);
    apiUrl.searchParams.append('version', release);
    apiUrl.searchParams.append('locale', locale);
    return locations.coreImportersV1_1(locations.ctx, release, locale, apiUrl.toString());
}


// /**
//  * Attempt to download the four groups of archive files (and associated message digests)
//  * that are normally associated with a release. The "main" ZIP is always downloaded
//  * for a release. If the `--zips` or `--full` options are given, we will attempt
//  * to download the other three groups. There is a tar.gz format version, and two
//  * optional format zip files: 'no-content' and 'new-bundled'.
//  * @param options command-line options.
//  * @param readOnlyDir where to store the result.
//  * @param release id string for the release. e.g. '6.2.2'
//  * @returns list of downloaded file statuses
//  */
// async function downloadReleaseFiles(options: CommandOptions, readOnlyDir: string, release: string): Promise<Array<ArchiveFileSummary>> {
//     const primaryZipUrl = `https://${options.downloadsHost}/release/wordpress-${release}.zip`;
//     const primaryZip = await downloadThree(options, readOnlyDir, primaryZipUrl);
//     if (!options.full && !options.zips) {
//         return [ ...primaryZip ];
//     }
//     const primaryTarGZUrl = `https://${options.downloadsHost}/release/wordpress-${release}.tar.gz`;
//     const primaryTarGZ = await downloadThree(options, readOnlyDir, primaryTarGZUrl);
//     const noContentZipUrl = `https://${options.downloadsHost}/release/wordpress-${release}-no-content.zip`;
//     const noContentZip = await downloadThree(options, readOnlyDir, noContentZipUrl);
//     const newBundledZipUrl = `https://${options.downloadsHost}/release/wordpress-${release}-new-bundled.zip`;
//     const newBundledZip = await downloadThree(options, readOnlyDir, newBundledZipUrl);

//     return [ ...primaryZip, ...primaryTarGZ, ...noContentZip, ...newBundledZip ];
// }

// /**
//  * Download files associated with a core release.
//  * @param options command-line options.
//  * @param coreMetaDir top of the meta data tree.
//  * @param release id string for the release. e.g. '6.2.2'
//  * @returns
//  */
// async function processRelease(
//     reporter: ConsoleReporter,
//     jreporter: JsonReporter,
//     locations: StandardLocations,
//     options: CommandOptions,
//     release: string,
//     outdated: boolean
// ): Promise<ArchiveGroupStatus> {
//     const group: ArchiveGroupStatus = {
//         source_name: '',
//         section: 'core',
//         slug: release,
//         is_outdated: false,
//         is_complete: false,
//         is_interesting: true,
//         when: Date.now(),
//         files: {}
//     };

//     const releaseFiles = await downloadReleaseFiles(options, readOnlyDir, release);

//     const t = await getCoreTranslations(reporter, jreporter, locations, options, release, outdated);
//     for (const translation of t.translations) {
//         if ((typeof translation.english_name === 'string') &&
//             (typeof translation.language === 'string') &&
//             (typeof translation.package === 'string') &&
//             (typeof translation.version === 'string')) {
//             await getChecksums(reporter, jreporter, locations, options, release, translation.language, outdated);
//             await getCredits(options, localeMetaDir, release, translation.language, outdated);
//             await getImporters(options, localeMetaDir, release, translation.language, outdated);

//             if (options.zips || options.full) {
//                 const localeReadOnlyDir = path.join(l10nDir, translation.language);
//                 vreporter(`> mkdir -p ${localeReadOnlyDir}`);
//                 await Deno.mkdir(localeReadOnlyDir, { recursive: true });
//                 const localeZip = await downloadZip(reporter, translation.package, localeReadOnlyDir,
//                         options.force, options.rehash);
//                 releaseFiles.push(localeZip);
//                 const wordpressZipUrl = `https://${options.downloadsHost}/release/${translation.language}/wordpress-${release}.zip`;
//                 const wordpressZipInfo = await downloadThree(options, localeReadOnlyDir, wordpressZipUrl);
//                 releaseFiles.push(...wordpressZipInfo);
//             }
//         }
//     }

//     // need to special case en_US, since it is not a translation
//     const localeMetaDir = path.join(metaDir, 'l10n', 'en_US');
//     vreporter(`> mkdir -p ${localeMetaDir}`);
//     await Deno.mkdir(localeMetaDir, { recursive: true });
//     await getChecksums(options, localeMetaDir, release, 'en_US', outdated);
//     await getCredits(options, localeMetaDir, release, 'en_US', outdated);
//     await getImporters(options, localeMetaDir, release, 'en_US', outdated);

//     let ok = true;
//     for (const item of releaseFiles) {
//         group.files[item.filename] = item;
//         if (item.status === 'failed') {
//             ok = false;
//         }
//     }
//     group.status = ok ? (options.full ? 'full' : 'partial') : 'failed';
//     return group;
// }

// /**
//  * Read the releases.json file to determine what the `latest` release
//  * value was before it gets overwritten by the next download. So,
//  * "previous" is logical, there is only one value in the file.
//  * @param coreMetaDir where the data is located
//  * @returns `latest` field value from JSON file, or undefined if none if found.
//  */
// async function getPreviousLatest(coreMetaDir: string): Promise<undefined | string> {
//     const releaseJson = path.join(coreMetaDir, 'releases.json');
//     let previous;
//     try {
//         const json = await Deno.readTextFile(releaseJson);
//         const o = JSON.parse(json);
//         if (o && (typeof o === 'object')) {
//             if ('latest' in o) {
//                 return o.latest;
//             }
//         }
//     } catch (_) {
//         console.error(`Warning: unable to read or parse releases.json`, _);
//         // previous won't be set
//     }
//     return previous;
// }


// /**
//  * Read a version-check data from the upstream API.
//  * @param options command-line options.
//  * @param coreMetaDir where to store the result.
//  * @param outdated true if latest transition is in progress.
//  */
// async function getVersionCheck(options: CommandOptions, coreMetaDir: string, outdated: boolean): Promise<void> {
//     const apiUrl = new URL(`/core/version-check/1.7/`, `https://${options.apiHost}/`);
//     await downloadMetaJson(reporter, coreMetaDir, 'version-check-1.7.json', apiUrl,
//             options.force || outdated, options.jsonSpaces);
// }

// async function processGlobalData(
//     options: CommandOptions,
//     coreMetaDir: string,
//     outdated: boolean,
//     _info: GroupDownloadStatusInfo
// ): Promise<void> {
//     await getVersionCheck(options, coreMetaDir, outdated);
// }

// /**
//  * Handle the process of downloading a set of releases.
//  * @param options command-line options
//  * @returns exit code
//  */
// async function downloadCore(
//     options: CommandOptions
// ): Promise<number> {
//     const info: GroupDownloadStatusInfo = {
//         when: 0,
//         map: {}
//     };

//     const coreMetaDir = path.join(options.documentRoot, 'core', 'meta', 'legacy');
//     vreporter(`> mkdir -p ${coreMetaDir}`);
//     await Deno.mkdir(coreMetaDir, { recursive: true });
//     vreporter(`first we need to read the previous latest`);
//     const previous = await getPreviousLatest(coreMetaDir);
//     if (!previous) {
//         console.error(`Warning: no previous latest version`);
//     }
//     vreporter(`next we need a list of releases`);
//     const releasesMap = await getCoreReleases(options, coreMetaDir);
//     const releases = translateRelease(releasesMap) as CoreReleases;
//     if (!releases.latest) {
//         console.error(`Error: no latest release.`);
//         return 1;
//     }

//     const list = await getListOfReleases(releasesMap,  options.list, options.interestingFilename, previous);

//     let transitioning = false;
//     if (releases.latest !== previous) {
//         reporter(`previous latest release:   ${previous}`);
//         transitioning = true;
//     } else {
//         vreporter(`previous latest release:   ${previous}`);
//     }
//     reporter(`latest release:            ${releases.latest}`);
//     const numberOfReleases = 1 + releases.insecure.length + releases.outdated.length;
//     reporter(`number of releases:        ${numberOfReleases}`);
//     reporter(`list:                      ${options.list}`);
//     reporter(`number in list:            ${list.length}`);

//     for (let n=0; n < list.length; n++) {
//         const release = list[n];
//         const group = await processRelease(options, coreMetaDir, release,
//                 (transitioning && (previous === release))
//         );
//         info.map[release] = group;
//     }
//     await processGlobalData(options, coreMetaDir, transitioning, info);

//     const statusFilename = path.join(coreMetaDir, options.statusFilename);
//     const saved = await saveDownloadStatus(statusFilename, info);
//     if (!saved) {
//         return 1;
//     }

//     return 0;
// }

// /**
//  * Determine if the provided list type name is valid.
//  * @param name list requested
//  * @returns true if it is valid
//  */
// function isValidListType(name: string): boolean {
//     return (LIST_TYPE_VALUES as ReadonlyArray<string>).includes(name);
// }

// const LIST_TYPE_VALUES = [ 'all', 'latest', 'current', 'outdated', 'insecure', 'interesting', 'previous' ] as const;

// type ListTypeValue = typeof LIST_TYPE_VALUES[number];

