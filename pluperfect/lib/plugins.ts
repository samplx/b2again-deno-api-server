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

import type { BannersInfo, PluginDetails, ScreenshotInfo, TranslationsResultV1_0 } from '../../lib/api.ts';
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
 * Determine the URL to use to request plugin information.
 * @param apiHost where the API is.
 * @param name slug used to access the plugin.
 * @returns
 */
function getPluginInfoUrl(apiHost: string, name: string): URL {
    const url = new URL('/plugins/info/1.2/', `https://${apiHost}`);
    url.searchParams.append('action', 'plugin_information');
    url.searchParams.append('slug', name);
    url.searchParams.append('fields[]', 'short_description');
    url.searchParams.append('fields[]', 'icons');
    return url;
}

/**
 * migrate the src portion of the screenshots.
 * @param conventions how to find resources.
 * @param ctx bag of information to convert urls.
 * @param slug plugin id.
 * @param legacy upstream version of the data.
 * @returns migrated version with URL for local resources.
 */
function migrateScreenshots(
    conventions: StandardConventions,
    ctx: MigrationContext,
    slug: string,
    legacy: Record<string, ScreenshotInfo>,
): Record<string, ScreenshotInfo> {
    const updated = structuredClone(legacy);
    for (const key of Object.keys(legacy)) {
        if (updated[key] && (typeof updated[key].src === 'string')) {
            updated[key].src = getLiveUrlFromProvider(ctx, conventions.pluginScreenshot(ctx, slug, updated[key].src));
        }
    }
    return updated;
}

/**
 * migrate the map of version urls.
 * @param conventions how to find resources.
 * @param slug plugin id.
 * @param versions upstream map of resources.
 * @returns migrated map of version/url pairs.
 */
function migrateVersions(
    conventions: StandardConventions,
    slug: string,
    versions: Record<string, string>,
): Record<string, string> {
    const migrated: Record<string, undefined | string> = {};
    for (const version in versions) {
        if (version === 'trunk') {
            migrated[version] = undefined;
        } else {
            const url = getUrlFromProvider(
                conventions.ctx,
                conventions.pluginZip(conventions.ctx, slug, version, versions[version]),
            );
            migrated[version] = url;
        }
    }
    return migrated as Record<string, string>;
}

/**
 * migrate the "optional" banner field. Since it comes from a
 * PHP JSON serialization process, an "empty" field is not null,
 * but an empty array. if it is empty, we leave it alone, otherwise
 * we convert the high and low fields if they exist.
 * @param conventions how to find resources.
 * @param slug plugin id.
 * @param original upstream banner resources.
 * @returns migrated banner resources.
 */
function migrateBanners(
    conventions: StandardConventions,
    slug: string,
    original: Array<unknown> | BannersInfo,
): Array<unknown> | BannersInfo {
    if (Array.isArray(original)) {
        return original;
    }
    let high;
    let low;
    if (typeof original.high === 'string') {
        high = getLiveUrlFromProvider(conventions.ctx, conventions.pluginBanner(conventions.ctx, slug, original.high));
    }
    if (typeof original.low === 'string') {
        low = getLiveUrlFromProvider(conventions.ctx, conventions.pluginBanner(conventions.ctx, slug, original.low));
    }
    return { high, low };
}

/**
 * migrate the sections field. remove the reviews, since they are
 * not part of the GPL sources.
 * @param sections upstream sections field.
 * @returns a copy with the reviews removed.
 */
function migrateSections(sections: Record<string, string>): Record<string, string> {
    const updated: Record<string, undefined | string> = structuredClone(sections);
    updated.reviews = undefined;
    return updated as Record<string, string>;
}

/**
 * build the thing to do the migration. this builds the migrator, the actual
 * migration is done later.
 * @param conventions how to access resources.
 * @param slug plugin id.
 * @param version plugin version id.
 * @returns a migration structure provider that is used to migrate the plugin.
 */
function getPluginMigratorProvider(
    conventions: StandardConventions,
    slug: string,
    version: string,
): MigrationStructureProvider<PluginDetails> {
    const preview_link = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, conventions.pluginPreview(ctx, slug, `${url}`));
    const screenshots = (ctx: MigrationContext, legacy: unknown) =>
        migrateScreenshots(conventions, ctx, slug, legacy as Record<string, ScreenshotInfo>);
    const ratings = (_ctx: MigrationContext, ratings: unknown) => migrateRatings(ratings as Record<string, number>);
    const zero = (_ctx: MigrationContext, _zeroed: unknown) => 0;
    const download_link = (ctx: MigrationContext, download_link: unknown) =>
        getUrlFromProvider(ctx, conventions.pluginZip(ctx, slug, version, download_link as string));
    const homepage = (ctx: MigrationContext, homepage: unknown) =>
        getUrlFromProvider(ctx, conventions.pluginHomepage(ctx, slug, homepage as string));
    const support_url = (ctx: MigrationContext, support_url: unknown) =>
        getUrlFromProvider(ctx, conventions.pluginSupport(ctx, slug, support_url as string));
    const versions = (_ctx: MigrationContext, versions: unknown) =>
        migrateVersions(conventions, slug, versions as Record<string, string>);
    const sections = (_ctx: MigrationContext, sections: unknown) => migrateSections(sections as Record<string, string>);
    const banners = (_ctx: MigrationContext, banners: unknown) =>
        migrateBanners(conventions, slug, banners as Array<unknown> | BannersInfo);
    return {
        ratings,
        rating: zero,
        num_ratings: zero,
        support_threads: zero,
        support_threads_resolved: zero,
        active_installs: zero,
        homepage,
        sections,
        download_link,
        screenshots,
        versions,
        banners,
        preview_link,
        support_url,
    };
}

/**
 * build a migrator function to handle migrating a plugin. most of the migration
 * is done field by field using the MigrationStructureProvider and migrateStructue.
 * there is also cross-field migration to update upstream URL's embedded in text
 * inside of the sections fields.
 * @param conventions host to access resources.
 * @param slug plugin id.
 * @returns a migrator object that describes how to migrate the structure.
 */
function getPluginMigrator(
    conventions: StandardConventions,
    slug: string,
): (original: PluginDetails) => PluginDetails {
    return function (original: PluginDetails): PluginDetails {
        if (!original.version) {
            throw new Deno.errors.NotSupported(`plugin.version is not defined`);
        }
        const provider = getPluginMigratorProvider(conventions, slug, original.version);
        const migrated = migrateStructure(provider, conventions.ctx, original);
        if (migrated.sections && migrated.screenshots && original.screenshots) {
            const originals: Array<string> = [];
            const updated: Array<string> = [];
            for (const key of Object.keys(original.screenshots)) {
                if (original.screenshots[key].src && migrated.screenshots[key].src) {
                    originals.push(original.screenshots[key].src);
                    updated.push(migrated.screenshots[key].src);
                }
            }
            migrated.sections = migrateSectionUrls(originals, updated, migrated.sections);
        }
        return migrated;
    };
}

/**
 * Handle the downloading and processing of a single plugin.
 * @param reporter how to log non-error information.
 * @param jreporter JSON structured logger.
 * @param host host where the files live.
 * @param options command-line options.
 * @param conventions how to access resources.
 * @param slug plugin slug.
 * @returns
 */
export async function createPluginRequestGroup(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    options: CommandOptions,
    conventions: StandardConventions,
    locales: ReadonlyArray<string>,
    slug: string,
): Promise<RequestGroup> {
    const pluginFilename = conventions.pluginFilename(conventions.ctx, slug);
    const legacyPluginFilename = conventions.legacyPluginFilename(conventions.ctx, slug);
    const url = getPluginInfoUrl(conventions.apiHost, slug);
    if (!legacyPluginFilename.relative || !pluginFilename.relative || !legacyPluginFilename.host) {
        throw new Deno.errors.NotSupported(`legacyPluginFilename and pluginFilename must define pathnames`);
    }

    const legacyJsonPathname = toPathname(conventions.ctx, legacyPluginFilename);
    const migratedJsonPathname = toPathname(conventions.ctx, pluginFilename);
    const [changed, pluginInfo, _migratedPlugin] = await probeMetaLegacyJson(
        reporter,
        jreporter,
        legacyPluginFilename.host,
        legacyJsonPathname,
        migratedJsonPathname,
        url,
        conventions.jsonSpaces,
        getPluginMigrator(conventions, slug),
    );

    const group: RequestGroup = {
        sourceName: conventions.ctx.sourceName,
        section: 'plugins',
        slug: slug,
        statusFilename: conventions.pluginStatusFilename(conventions.ctx, slug),
        requests: [],
        liveRequests: [],
        noChanges: !changed,
    };
    if (typeof pluginInfo.error === 'string') {
        group.error = pluginInfo.error;
        return group;
    }
    if ((typeof pluginInfo.slug !== 'string') || (pluginInfo.slug !== slug)) {
        group.error = `plugin file slug:${pluginInfo.slug} does not match slug ${slug}`;
        return group;
    }
    if ((typeof pluginInfo.download_link !== 'string') || (pluginInfo.download_link === '')) {
        group.error = `plugin file ${slug} does not have a valid download_link`;
        return group;
    }

    if (pluginInfo.versions) {
        const all: Array<string> = [];
        for (const version of Object.keys(pluginInfo.versions)) {
            if ((version !== 'trunk') && pluginInfo.versions[version]) {
                all.push(version);
            }
        }
        const recent = recentVersions(all, conventions.pluginVersionLimit);
        for (const version of recent) {
            if (pluginInfo.versions[version] && options.readOnly) {
                group.requests.push(conventions.pluginZip(conventions.ctx, slug, version, pluginInfo.versions[version]));
            }
            const translations = conventions.pluginTranslationV1_0(conventions.ctx, slug, version);
            const legacyTranslations = conventions.legacyPluginTranslationV1_0(conventions.ctx, slug, version);
            if (!legacyTranslations.relative || !translations.relative) {
                throw new Deno.errors.NotSupported(
                    `legacyPluginTranslationV1_0 and pluginTranslationV1_0 must define pathnames`,
                );
            }
            if (options.l10n) {
                if (options.meta) {
                    group.requests.push(translations, legacyTranslations);
                }
                if (options.readOnly) {
                    const outdated = changed && ((typeof pluginInfo.version === 'string') && (pluginInfo.version === version));
                    const details = await getPluginTranslations(
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
                            if (item.version === version) {
                                group.requests.push(conventions.pluginL10nZip(conventions.ctx, slug, version, item.language));
                            }
                        }
                    }
                }
            }
        }
    } else if (pluginInfo.version && pluginInfo.download_link) {
        group.requests.push(conventions.pluginZip(conventions.ctx, slug, pluginInfo.version, pluginInfo.download_link));
    }
    if (pluginInfo.preview_link) {
        group.liveRequests.push(conventions.pluginPreview(conventions.ctx, slug, pluginInfo.preview_link));
    }
    if (Array.isArray(pluginInfo.screenshots)) {
        for (const n in pluginInfo.screenshots) {
            if (pluginInfo.screenshots[n].src) {
                group.liveRequests.push(conventions.pluginScreenshot(conventions.ctx, slug, pluginInfo.screenshots[n].src));
            }
        }
    }
    if (pluginInfo.banners && !Array.isArray(pluginInfo.banners)) {
        if (typeof pluginInfo.banners.high === 'string') {
            group.liveRequests.push(conventions.pluginBanner(conventions.ctx, slug, pluginInfo.banners.high));
        }
        if (typeof pluginInfo.banners.low === 'string') {
            group.liveRequests.push(conventions.pluginBanner(conventions.ctx, slug, pluginInfo.banners.low));
        }
    }

    return group;
}

/**
 * determine which translations are available for a plugin version.
 * @param reporter how to report non-error text.
 * @param jreporter how to report structured JSON.
 * @param conventions how to find resources.
 * @param options command-line options.
 * @param slug plugin id.
 * @param version plugin version id.
 * @param outdated true if we need to download the resource again
 * @param locales list of interesting locales
 * @returns list of all of the translations for the plugin version.
 */
async function getPluginTranslations(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    conventions: StandardConventions,
    options: CommandOptions,
    slug: string,
    version: string,
    outdated: boolean,
    locales: ReadonlyArray<string>,
): Promise<TranslationsResultV1_0> {
    const apiUrl = new URL(`/translations/plugins/1.0/`, `https://${conventions.apiHost}/`);
    apiUrl.searchParams.append('slug', slug);
    apiUrl.searchParams.append('version', version);

    const migratedJson = conventions.pluginTranslationV1_0(conventions.ctx, slug, version);
    const legacyJson = conventions.legacyPluginTranslationV1_0(conventions.ctx, slug, version);
    if (!migratedJson.host || !migratedJson.relative || !legacyJson.relative) {
        throw new Deno.errors.NotSupported(`pluginTranslationV1_0 location and legacyPluginTranslationV1_0 are misconfigured.`);
    }
    const legacyJsonPathname = toPathname(conventions.ctx, legacyJson);
    const migratedJsonPathname = toPathname(conventions.ctx, migratedJson);

    const migrator = getTranslationMigration(conventions.pluginL10nZip, conventions.ctx, slug);
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
