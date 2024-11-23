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

import type { ThemeAuthor, ThemeDetails, ThemeParent, TranslationsResultV1_0 } from '../../lib/api.ts';
import {
    getLiveUrlFromProvider,
    getUrlFromProvider,
    migrateStructure,
    type MigrationStructureProvider,
} from '../../lib/migration.ts';
import type { ConsoleReporter, JsonReporter } from '../../lib/reporter.ts';
import { type MigrationContext, type StandardConventions, toPathname } from '../../lib/standards.ts';
import {
    filterTranslations,
    getTranslationMigration,
    migrateRatings,
    migrateSectionUrls,
    recentVersions,
    type RequestGroup,
} from '../pluperfect.ts';
import { downloadMetaLegacyJson, probeMetaLegacyJson } from './downloads.ts';
import type { CommandOptions } from './options.ts';

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
    if (
        author &&
        (typeof author === 'object') &&
        ('user_nicename' in author) &&
        (typeof author.user_nicename === 'string') &&
        (author.user_nicename.indexOf('@') < 0)
    ) {
        const updated: ThemeAuthor = structuredClone(author) as ThemeAuthor;
        updated.user_nicename = `${author.user_nicename}@wordpress.org`;
        return updated;
    }
    return author as ThemeAuthor;
}

/**
 * migrate parent theme information (homepage).
 * @param conventions how to find resources.
 * @param slug theme slug.
 * @param parent upstream information about the parent theme.
 * @returns migrated information about the parent theme.
 */
function migrateParent(conventions: StandardConventions, slug: string, parent: ThemeParent): ThemeParent {
    const migrated = { ...parent };
    if (parent.homepage) {
        migrated.homepage = getUrlFromProvider(conventions.ctx, conventions.themeHomepage(conventions.ctx, slug, parent.homepage));
    }
    return parent;
}

/**
 * migrate sections. remove reviews.
 * @param sections upstream sections.
 * @returns sections with reviews removed.
 */
function migrateSections(sections: Record<string, string>): Record<string, string> {
    const updated: Record<string, undefined | string> = { ...sections };
    updated.reviews = undefined;
    return updated as Record<string, string>;
}

/**
 * convert the versions map to downstream.
 * @param conventions how to locate resources.
 * @param slug theme id.
 * @param versions upstream map of version/urls.
 * @returns map of version/url with local url resources.
 */
function migrateVersions(
    conventions: StandardConventions,
    slug: string,
    versions: Record<string, string>,
): Record<string, string> {
    const migrated: Record<string, string> = {};
    for (const version in versions) {
        const url = getUrlFromProvider(conventions.ctx, conventions.themeZip(conventions.ctx, slug, version, versions[version]));
        migrated[version] = url;
    }
    return migrated;
}

/**
 * build a migrator provider for a theme id and version.
 * @param conventions how to locate resources.
 * @param slug theme id.
 * @param version theme version id.
 * @returns a migration structure provider that will help migrate the structure.
 */
function getThemeMigratorProvider(
    conventions: StandardConventions,
    slug: string,
    version: string,
): MigrationStructureProvider<ThemeDetails> {
    const preview_url = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, conventions.themePreview(ctx, slug, `${url}`));
    const screenshot_url = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, conventions.themeScreenshot(ctx, slug, `${url}`));
    const author = (_ctx: MigrationContext, author: unknown) => migrateAuthor(author);
    const ratings = (_ctx: MigrationContext, ratings: unknown) => migrateRatings(ratings as Record<string, number>);
    const zero = (_ctx: MigrationContext, _zeroed: unknown) => 0;
    const parent = (_ctx: MigrationContext, parent: unknown) => migrateParent(conventions, slug, parent as ThemeParent);
    const download_link = (ctx: MigrationContext, download_link: unknown) =>
        getUrlFromProvider(ctx, conventions.themeZip(ctx, slug, version, download_link as string));
    const homepage = (ctx: MigrationContext, homepage: unknown) =>
        getUrlFromProvider(ctx, conventions.themeHomepage(ctx, slug, homepage as string));
    const versions = (_ctx: MigrationContext, versions: unknown) =>
        migrateVersions(conventions, slug, versions as Record<string, string>);
    const sections = (_ctx: MigrationContext, sections: unknown) => migrateSections(sections as Record<string, string>);
    const reviews_url = (ctx: MigrationContext, reviews_url: unknown) =>
        getUrlFromProvider(ctx, conventions.themeReviews(ctx, slug, reviews_url as string));
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
 * @param conventions host to locale resources.
 * @param slug theme id.
 * @returns a function that migrates an upstream theme to the downstream version.
 */
function getThemeMigrator(
    conventions: StandardConventions,
    slug: string,
): (original: ThemeDetails) => ThemeDetails {
    return function (original: ThemeDetails): ThemeDetails {
        if (!original.version) {
            throw new Deno.errors.NotSupported(`theme.version is not defined`);
        }
        const provider = getThemeMigratorProvider(conventions, slug, original.version);
        const migrated = migrateStructure(provider, conventions.ctx, original);
        if (migrated.sections) {
            const originals: Array<string> = [];
            const updated: Array<string> = [];
            if (original.screenshot_url && migrated.screenshot_url) {
                originals.push(original.screenshot_url);
                updated.push(migrated.screenshot_url);
            }
            migrated.sections = migrateSectionUrls(originals, updated, migrated.sections);
        }
        return migrated;
    };
}

/**
 * Handle the downloading and processing of a single theme.
 * @param reporter how to log non-error information.
 * @param jreporter JSON structured logger.
 * @param host host where the files live.
 * @param options command-line options.
 * @param conventions how to access resources.
 * @param slug theme slug.
 * @returns
 */
export async function createThemeRequestGroup(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    options: CommandOptions,
    conventions: StandardConventions,
    locales: ReadonlyArray<string>,
    slug: string,
): Promise<RequestGroup> {
    // the theme list query does not return a useful timestamp, so we have to
    // download the individual theme files just to see if anything has changed.

    const themeFilename = conventions.themeFilename(conventions.ctx, slug);
    const legacyThemeFilename = conventions.legacyThemeFilename(conventions.ctx, slug);
    const url = getThemeInfoUrl(conventions.apiHost, slug);
    if (!legacyThemeFilename.relative || !themeFilename.relative || !legacyThemeFilename.host) {
        throw new Deno.errors.NotSupported(`legacyThemeFilename and themeFilename must define pathnames`);
    }
    const legacyJsonPathname = toPathname(conventions.ctx, legacyThemeFilename);
    const migratedJsonPathname = toPathname(conventions.ctx, themeFilename);
    const [changed, themeInfo, _migratedTheme] = await probeMetaLegacyJson(
        reporter,
        jreporter,
        legacyThemeFilename.host,
        legacyJsonPathname,
        migratedJsonPathname,
        url,
        conventions.jsonSpaces,
        getThemeMigrator(conventions, slug),
    );

    const group: RequestGroup = {
        sourceName: conventions.ctx.sourceName,
        section: 'themes',
        slug: slug,
        statusFilename: conventions.themeStatusFilename(conventions.ctx, slug),
        requests: [],
        liveRequests: [],
        noChanges: !changed,
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
        const all: Array<string> = [];
        for (const version of Object.keys(themeInfo.versions)) {
            if ((version !== 'trunk') && themeInfo.versions[version]) {
                all.push(version);
            }
        }
        const recent = recentVersions(all, conventions.themeVersionLimit);
        for (const version of recent) {
            if (options.readOnly) {
                group.requests.push(conventions.themeZip(conventions.ctx, slug, version, themeInfo.versions[version]));
            }
            const translations = conventions.themeTranslationV1_0(conventions.ctx, slug, version);
            const legacyTranslations = conventions.legacyThemeTranslationV1_0(conventions.ctx, slug, version);
            if (!legacyTranslations.relative || !translations.relative) {
                throw new Deno.errors.NotSupported(`legacyThemeTranslationV1_0 and themeTranslationV1_0 must define pathnames`);
            }
            if (options.l10n) {
                if (options.meta) {
                    group.requests.push(translations, legacyTranslations);
                }
                // since themes timestamps are largely absent, we always reload the current version's translations
                // unless the theme.json file did not change at all.
                const outdated = changed && ((typeof themeInfo.version === 'string') && (themeInfo.version === version));
                const details = await getThemeTranslations(
                    reporter,
                    jreporter,
                    conventions,
                    options,
                    slug,
                    version,
                    outdated,
                    locales,
                );
                if (details && Array.isArray(details.translations) && (details.translations.length > 0)) {
                    for (const item of details.translations) {
                        if (options.readOnly && (item.version === version)) {
                            group.requests.push(conventions.themeL10nZip(conventions.ctx, slug, version, item.language));
                        }
                    }
                }
            }
        }
    } else if (themeInfo.version && themeInfo.download_link && options.readOnly) {
        group.requests.push(conventions.themeZip(conventions.ctx, slug, themeInfo.version, themeInfo.download_link));
    }
    if (themeInfo.preview_url && options.live) {
        group.liveRequests.push(conventions.themePreview(conventions.ctx, slug, themeInfo.preview_url));
    }
    if (themeInfo.screenshot_url && options.live) {
        // some ts.w.org URL's don't have a scheme?
        if (themeInfo.screenshot_url.startsWith('//')) {
            group.liveRequests.push(conventions.themeScreenshot(conventions.ctx, slug, `https:${themeInfo.screenshot_url}`));
        } else {
            group.liveRequests.push(conventions.themeScreenshot(conventions.ctx, slug, themeInfo.screenshot_url));
        }
    }

    return group;
}

/**
 * handle loading the themes translations.
 * @param reporter how to report non-error text.
 * @param jreporter how to report structured JSON.
 * @param conventions how to locale resources.
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
    conventions: StandardConventions,
    options: CommandOptions,
    slug: string,
    version: string,
    outdated: boolean,
    locales: ReadonlyArray<string>,
): Promise<TranslationsResultV1_0> {
    const apiUrl = new URL(`/translations/themes/1.0/`, `https://${conventions.apiHost}/`);
    apiUrl.searchParams.append('slug', slug);
    apiUrl.searchParams.append('version', version);

    const migratedJson = conventions.themeTranslationV1_0(conventions.ctx, slug, version);
    const legacyJson = conventions.legacyThemeTranslationV1_0(conventions.ctx, slug, version);
    if (!migratedJson.host || !migratedJson.relative || !legacyJson.relative) {
        throw new Deno.errors.NotSupported(`themeTranslationV1_0 location and legacyThemeTranslationV1_0 are misconfigured.`);
    }
    const legacyJsonPathname = toPathname(conventions.ctx, legacyJson);
    const migratedJsonPathname = toPathname(conventions.ctx, migratedJson);
    const migrator = getTranslationMigration(conventions.themeL10nZip, conventions.ctx, slug);
    const [originalTranslations, migratedTranslations] = await downloadMetaLegacyJson(
        reporter,
        jreporter,
        migratedJson.host,
        legacyJsonPathname,
        migratedJsonPathname,
        apiUrl,
        options.force || outdated,
        conventions.jsonSpaces,
        migrator,
    );
    const originals = originalTranslations as unknown as TranslationsResultV1_0;
    const migrated = migratedTranslations as unknown as TranslationsResultV1_0;
    if (locales.length > 0) {
        // we need to filter the locales to the ones that are "interesting"
        return await filterTranslations(
            originals,
            migrated,
            locales,
            legacyJsonPathname,
            migratedJsonPathname,
            conventions.jsonSpaces,
        );
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
    url.searchParams.append('fields[]', 'description');
    url.searchParams.append('fields[]', 'versions');
    // url.searchParams.append('fields[]', 'ratings');
    // url.searchParams.append('fields[]', 'active_installs');
    url.searchParams.append('fields[]', 'sections');
    url.searchParams.append('fields[]', 'parent');
    url.searchParams.append('fields[]', 'template');
    url.searchParams.append('fields[]', 'icons');
    url.searchParams.append('fields[]', 'short_description');
    return url;
}
