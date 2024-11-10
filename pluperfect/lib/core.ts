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
import { downloadMetaLegacyJson, probeMetaLegacyJson } from "./downloads.ts";
import { LiveUrlProviderResult, StandardLocations, UrlProviderResult } from "../../lib/standards.ts";
import { ConsoleReporter, JsonReporter } from "../../lib/reporter.ts";
import { getInterestingSlugs } from "./item-lists.ts";
import { getTranslationMigration, filterTranslations, RequestGroup } from "../pluperfect.ts";
import { compareVersions } from "https://deno.land/x/compare_versions@0.4.0/compare-versions.ts";

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
): Promise<[ boolean, Record<string, ReleaseStatus> ]> {
    const apiUrl = new URL(`/core/stable-check/1.0/`, `https://${locations.apiHost}/`);
    const legacyJson = locations.legacyReleases(locations.ctx);
    const migratedJson = locations.releases(locations.ctx);
    if (!migratedJson.host || !legacyJson.pathname || !migratedJson.pathname) {
        throw new Deno.errors.NotSupported(`locations values for releases are not valid.`);
    }
    const [ changed, releases, _migrated ] = await probeMetaLegacyJson(reporter, jreporter, migratedJson.host,
        legacyJson.pathname, migratedJson.pathname, apiUrl, options.jsonSpaces, translateRelease);
    if (releases && typeof releases === 'object') {
        return [ changed, releases as Record<string, ReleaseStatus> ];
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


/**
 * determine which files need to be downloaded for a core release.
 * @param reporter how to report non-error text.
 * @param jreporter how to report structured JSON.
 * @param options command-line options.
 * @param locations how to access resources.
 * @param locales list of interesting locales.
 * @param release release id, e.g. '6.6.2'
 * @returns a request group to bring the repo into sync.
 */
export async function createCoreRequestGroup(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
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
        liveRequests,
        noChanges: false
    });

}
