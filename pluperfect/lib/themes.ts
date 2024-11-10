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

import { ThemeAuthor, ThemeDetails, ThemeParent, TranslationsResultV1_0 } from "../../lib/api.ts";
import { getLiveUrlFromProvider, getUrlFromProvider, migrateStructure, MigrationStructureProvider } from "../../lib/migration.ts";
import { ConsoleReporter, JsonReporter } from "../../lib/reporter.ts";
import { MigrationContext, StandardLocations  } from "../../lib/standards.ts";
import { migrateRatings, RequestGroup } from "../pluperfect.ts";
import { filterTranslations, getTranslationMigration } from "../pluperfect.ts";
import { downloadMetaLegacyJson, probeMetaLegacyJson } from "./downloads.ts";
import { CommandOptions } from "./options.ts";


/**
 * migrate theme author resources.
 * @param author upstream author field.
 * @returns modified author that includes `@wordpress.org` on upstream names.
 */
function migrateAuthor(author: unknown): string | ThemeAuthor {
    if (typeof author === 'string') {
        if (author.indexOf('@') < 0) {
            return `${author}@wordpress.org`;
        }
        return author;
    }
    if (author &&
        (typeof author === 'object') &&
        ('user_nicename' in author) &&
        (typeof author.user_nicename === 'string') &&
        (author.user_nicename.indexOf('@') < 0)) {
        const updated: ThemeAuthor = structuredClone(author) as ThemeAuthor;
        updated.user_nicename = `${author.user_nicename}@wordpress.org`;
        return updated;
    }
    return author as ThemeAuthor;
}

/**
 * migrate parent theme information (homepage).
 * @param locations how to find resources.
 * @param slug theme slug.
 * @param parent upstream information about the parent theme.
 * @returns migrated information about the parent theme.
 */
function migrateParent(locations: StandardLocations, slug: string, parent: ThemeParent): ThemeParent {
    const migrated = { ... parent };
    if (parent.homepage) {
        migrated.homepage = getUrlFromProvider(locations.ctx, locations.themeHomepage(locations.ctx, slug, parent.homepage));
    }
    return parent;
}

/**
 * migrate sections. remove reviews.
 * @param sections upstream sections.
 * @returns sections with reviews removed.
 */
function migrateSections(sections: Record<string, string>): Record<string, string> {
    const updated: Record<string, undefined | string> = { ... sections };
    updated.reviews = undefined;
    return updated as Record<string, string>;
}

/**
 * convert the versions map to downstream.
 * @param locations how to locate resources.
 * @param slug theme id.
 * @param versions upstream map of version/urls.
 * @returns map of version/url with local url resources.
 */
function migrateVersions(
    locations: StandardLocations,
    slug: string,
    versions: Record<string, string>
): Record<string, string> {
    const migrated: Record<string, string> = {};
    for (const version in versions) {
        const url = getUrlFromProvider(locations.ctx, locations.themeZip(locations.ctx, slug, version, versions[version]))
        migrated[version] = url;
    }
    return migrated;
}

/**
 * build a migrator provider for a theme id and version.
 * @param locations how to locate resources.
 * @param slug theme id.
 * @param version theme version id.
 * @returns a migration structure provider that will help migrate the structure.
 */
function getThemeMigratorProvider(
    locations: StandardLocations,
    slug: string,
    version: string,
): MigrationStructureProvider<ThemeDetails> {
    const preview_url = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, locations.themePreview(ctx, slug, `${url}`));
    const screenshot_url = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, locations.themeScreenshot(ctx, slug, `${url}`));
    const author = (_ctx: MigrationContext, author: unknown) =>
        migrateAuthor(author);
    const ratings = (_ctx: MigrationContext, ratings: unknown) =>
        migrateRatings(ratings as Record<string, number>);
    const zero = (_ctx: MigrationContext, _zeroed: unknown) => 0;
    const parent = (_ctx: MigrationContext, parent: unknown) =>
        migrateParent(locations, slug, parent as ThemeParent);
    const download_link = (ctx: MigrationContext, download_link: unknown) =>
        getUrlFromProvider(ctx, locations.themeZip(ctx, slug, version, download_link as string));
    const homepage = (ctx: MigrationContext, homepage: unknown) =>
        getUrlFromProvider(ctx, locations.themeHomepage(ctx, slug, homepage as string));
    const versions = (_ctx: MigrationContext, versions: unknown) =>
        migrateVersions(locations, slug, versions as Record<string, string>);
    const sections = (_ctx: MigrationContext, sections: unknown) =>
        migrateSections(sections as Record<string, string>);
    const reviews_url = (ctx: MigrationContext, reviews_url: unknown) =>
        getUrlFromProvider(ctx, locations.themeReviews(ctx, slug, reviews_url as string));
    return {
        preview_url,
        author,
        screenshot_url,
        ratings,
        rating: zero,
        num_ratings: zero,
        downloaded: zero,
        active_installs: zero,
        parent,
        download_link,
        homepage,
        versions,
        sections,
        reviews_url,
    };
}

/**
 * create migration higher-order function.
 * @param locations host to locale resources.
 * @param slug theme id.
 * @returns a function that migrates an upstream theme to the downstream version.
 */
function getThemeMigrator(
    locations: StandardLocations,
    slug: string,
): (original: ThemeDetails) => ThemeDetails {
    return function (original: ThemeDetails): ThemeDetails {
        if (!original.version) {
            throw new Deno.errors.NotSupported(`theme.version is not defined`);
        }
        const provider = getThemeMigratorProvider(locations, slug, original.version);
        const migrated = migrateStructure(provider, locations.ctx, original);
        // FIXME: handle cross-field migration (urls in text fields)
        return migrated;
    }
}

/**
 * Handle the downloading and processing of a single theme.
 * @param reporter how to log non-error information.
 * @param jreporter JSON structured logger.
 * @param host host where the files live.
 * @param options command-line options.
 * @param locations how to access resources.
 * @param slug theme slug.
 * @returns
 */
export async function createThemeRequestGroup(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
    slug: string,
): Promise<RequestGroup> {

    // the theme list query does not return a useful timestamp, so we have to
    // download the individual theme files just to see if anything has changed.

    const themeFilename = locations.themeFilename(locations.ctx, slug);
    const legacyThemeFilename = locations.legacyThemeFilename(locations.ctx, slug);
    const url = getThemeInfoUrl(locations.apiHost, slug);
    if (!legacyThemeFilename.pathname || !themeFilename.pathname || !legacyThemeFilename.host) {
        throw new Deno.errors.NotSupported(`legacyThemeFilename and themeFilename must define pathnames`);
    }
    const [ changed, themeInfo, _migratedTheme ] = await probeMetaLegacyJson(reporter, jreporter, legacyThemeFilename.host,
        legacyThemeFilename.pathname, themeFilename.pathname, url, options.jsonSpaces,
        getThemeMigrator(locations, slug));

    const group: RequestGroup = {
        sourceName: locations.ctx.sourceName,
        section: 'themes',
        slug: slug,
        statusFilename: locations.themeStatusFilename(locations.ctx, slug),
        requests: [],
        liveRequests: [],
        noChanges: !changed
    };
    if (typeof themeInfo.error === 'string') {
        group.error = themeInfo.error;
        return group;
    }
    if ((typeof themeInfo.slug !== 'string') || (themeInfo.slug !== slug)) {
        group.error = `theme file slug:${themeInfo.slug} does not match slug ${slug}`;
        return group;
    }
    if ((typeof themeInfo.download_link !== 'string') || (themeInfo.download_link === '')) {
        group.error = `theme file ${slug} does not have a valid download_link`;
        return group;
    }

    if (themeInfo.versions) {
        for (const version in themeInfo.versions) {
            if (version === 'trunk') {
                continue;
            }
            group.requests.push(locations.themeZip(locations.ctx, slug, version, themeInfo.versions[version]));
            const translations = locations.themeTranslationV1_0(locations.ctx, slug, version);
            const legacyTranslations = locations.legacyThemeTranslationV1_0(locations.ctx, slug, version);
            if (!legacyTranslations.pathname || !translations.pathname) {
                throw new Deno.errors.NotSupported(`legacyThemeTranslationV1_0 and themeTranslationV1_0 must define pathnames`);
            }
            group.requests.push(translations, legacyTranslations);
            // since themes timestamps are largely absent, we always reload the current version's translations
            // unless the theme.json file did not change at all.
            const outdated = changed && ((typeof themeInfo.version === 'string') && (themeInfo.version === version));
            const details = await getThemeTranslations(reporter, jreporter, locations, options, slug, version, outdated, locales);
            if (details && Array.isArray(details.translations) && (details.translations.length > 0)) {
                for (const item of details.translations) {
                    if (item.version === version) {
                        group.requests.push(locations.themeL10nZip(locations.ctx, slug, version, item.language));
                    }
                }
            }
        }
    } else if (themeInfo.version && themeInfo.download_link) {
        group.requests.push(locations.themeZip(locations.ctx, slug, themeInfo.version, themeInfo.download_link));
    }
    if (themeInfo.preview_url) {
        group.liveRequests.push(locations.themePreview(locations.ctx, slug, themeInfo.preview_url));
    }
    if (themeInfo.screenshot_url) {
        // some ts.w.org URL's don't have a scheme?
        if (themeInfo.screenshot_url.startsWith('//')) {
            group.liveRequests.push(locations.themeScreenshot(locations.ctx, slug, `https:${themeInfo.screenshot_url}`));
        } else {
            group.liveRequests.push(locations.themeScreenshot(locations.ctx, slug, themeInfo.screenshot_url));
        }
    }

    return group;
}

/**
 * handle loading the themes translations.
 * @param reporter how to report non-error text.
 * @param jreporter how to report structured JSON.
 * @param locations how to locale resources.
 * @param options command-line options.
 * @param slug theme id.
 * @param version theme version id.
 * @param outdated should files be considered stale.
 * @param locales list of interesting locales.
 * @returns filtered list of original translations.
 */
async function getThemeTranslations(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    options: CommandOptions,
    slug: string,
    version: string,
    outdated: boolean,
    locales: ReadonlyArray<string>
): Promise<TranslationsResultV1_0> {
    const apiUrl = new URL(`/translations/themes/1.0/`, `https://${locations.apiHost}/`);
    apiUrl.searchParams.append('slug', slug);
    apiUrl.searchParams.append('version', version);

    const migratedJson = locations.themeTranslationV1_0(locations.ctx, slug, version);
    const legacyJson = locations.legacyThemeTranslationV1_0(locations.ctx, slug, version);
    if (!migratedJson.host || !migratedJson.pathname || !legacyJson.pathname) {
        throw new Deno.errors.NotSupported(`themeTranslationV1_0 location and legacyThemeTranslationV1_0 are misconfigured.`);
    }
    const migrator = getTranslationMigration(locations.themeL10nZip, locations.ctx, slug);
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
 * Determine the URL to use to request theme information.
 * @param apiHost where the API is.
 * @param name slug used to access the theme.
 * @returns
 */
function getThemeInfoUrl(apiHost: string, name: string): URL {
    const url = new URL('/themes/info/1.2/', `https://${apiHost}`);
    url.searchParams.append('action', 'theme_information');
    url.searchParams.append('slug', name);
    url.searchParams.append('fields[]','description');
    url.searchParams.append('fields[]','versions');
    url.searchParams.append('fields[]','ratings');
    url.searchParams.append('fields[]','active_installs');
    url.searchParams.append('fields[]','sections');
    url.searchParams.append('fields[]','parent');
    url.searchParams.append('fields[]','template');
    return url;
}
