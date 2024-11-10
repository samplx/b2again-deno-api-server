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

import { BannersInfo, ContributorInfo, PluginDetails, ScreenshotInfo, TranslationsResultV1_0 } from "../../lib/api.ts";
import { getLiveUrlFromProvider, getUrlFromProvider, migrateStructure, MigrationStructureProvider } from "../../lib/migration.ts";
import { ConsoleReporter, JsonReporter } from "../../lib/reporter.ts";
import { MigrationContext, StandardLocations } from "../../lib/standards.ts";
import { migrateRatings, RequestGroup } from "../pluperfect.ts";
import { filterTranslations, getTranslationMigration } from "./core.ts";
import { downloadMetaLegacyJson, probeMetaLegacyJson } from "./downloads.ts";
import { CommandOptions } from "./options.ts";

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
    return url;
}

function migrateAuthor(author: unknown): undefined | string{
    if (typeof author === 'string') {
        if (author.indexOf('@') < 0) {
            return `${author}@wordpress.org`;
        }
    }
    return undefined;
}

function migrateContributors(legacy: Record<string, ContributorInfo>): Record<string, ContributorInfo> {
    return legacy;
}

function migrateScreenshots(_ctx: MigrationContext, legacy: Record<string, ScreenshotInfo>): Record<string, ScreenshotInfo> {
    return legacy;
}

function migrateVersions(
    locations: StandardLocations,
    slug: string,
    versions: Record<string, string>
): Record<string, string> {
    const migrated: Record<string, string> = {};
    for (const version in versions) {
        const url = getUrlFromProvider(locations.ctx, locations.pluginZip(locations.ctx, slug, version, versions[version]))
        migrated[version] = url;
    }
    return migrated;
}

function migrateBanners(
    locations: StandardLocations,
    slug: string,
    original: Array<unknown> | BannersInfo,
): Array<unknown> | BannersInfo {
    if (Array.isArray(original)) {
        return original;
    }
    let high;
    let low;
    if (typeof original.high === 'string') {
        high = getLiveUrlFromProvider(locations.ctx, locations.pluginBanner(locations.ctx, slug, original.high));
    }
    if (typeof original.low === 'string') {
        low = getLiveUrlFromProvider(locations.ctx, locations.pluginBanner(locations.ctx, slug, original.low));
    }
    return { high, low };
}


function migrateSections(sections: Record<string, string>): Record<string, string> {
    const updated: Record<string, undefined | string> = { ... sections };
    updated.reviews = undefined;
    return updated as Record<string, string>;
}


function getPluginMigratorProvider(
    locations: StandardLocations,
    slug: string,
    version: string,
): MigrationStructureProvider<PluginDetails> {
    const preview_link = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, locations.pluginPreview(ctx, slug, `${url}`));
    const screenshots = (ctx: MigrationContext, legacy: unknown) =>
        migrateScreenshots(ctx, legacy as Record<string, ScreenshotInfo>);
    const author = (_ctx: MigrationContext, author: unknown) =>
        migrateAuthor(author);
    const ratings = (_ctx: MigrationContext, ratings: unknown) =>
        migrateRatings(ratings as Record<string, number>);
    const contributors = (_ctx: MigrationContext, contributors: unknown) =>
        migrateContributors(contributors as Record<string, ContributorInfo>);
    const zero = (_ctx: MigrationContext, _zeroed: unknown) => 0;
    const download_link = (ctx: MigrationContext, download_link: unknown) =>
        getUrlFromProvider(ctx, locations.pluginZip(ctx, slug, version, download_link as string));
    const homepage = (ctx: MigrationContext, homepage: unknown) =>
        getUrlFromProvider(ctx, locations.pluginHomepage(ctx, slug, homepage as string));
    const versions = (_ctx: MigrationContext, versions: unknown) =>
        migrateVersions(locations, slug, versions as Record<string, string>);
    const sections = (_ctx: MigrationContext, sections: unknown) =>
        migrateSections(sections as Record<string, string>);
    const banners = (_ctx: MigrationContext, banners: unknown) =>
        migrateBanners(locations, slug, banners as Array<unknown> | BannersInfo);
    return {
        author,
        contributors,
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
    };
}

function getPluginMigrator(
    locations: StandardLocations,
    slug: string,
): (original: PluginDetails) => PluginDetails {
    return function (original: PluginDetails): PluginDetails {
        if (!original.version) {
            throw new Deno.errors.NotSupported(`theme.version is not defined`);
        }
        const provider = getPluginMigratorProvider(locations, slug, original.version);
        const migrated = migrateStructure(provider, locations.ctx, original);
        // FIXME: handle cross-field migration (urls in text fields)
        return migrated;
    }
}

/**
 * Handle the downloading and processing of a single plugin.
 * @param reporter how to log non-error information.
 * @param jreporter JSON structured logger.
 * @param host host where the files live.
 * @param options command-line options.
 * @param locations how to access resources.
 * @param slug plugin slug.
 * @returns
 */
export async function createPluginRequestGroup(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
    slug: string,
): Promise<RequestGroup> {

    const pluginFilename = locations.pluginFilename(locations.ctx, slug);
    const legacyPluginFilename = locations.legacyPluginFilename(locations.ctx, slug);
    const url = getPluginInfoUrl(locations.apiHost, slug);
    if (!legacyPluginFilename.pathname || !pluginFilename.pathname || !legacyPluginFilename.host) {
        throw new Deno.errors.NotSupported(`legacyPluginFilename and pluginFilename must define pathnames`);
    }
    const [ changed, pluginInfo, _migratedPlugin ] = await probeMetaLegacyJson(reporter, jreporter, legacyPluginFilename.host,
        legacyPluginFilename.pathname, pluginFilename.pathname, url, options.jsonSpaces,
        getPluginMigrator(locations, slug));

    const group: RequestGroup = {
        sourceName: locations.ctx.sourceName,
        section: 'plugins',
        slug: slug,
        statusFilename: locations.pluginStatusFilename(locations.ctx, slug),
        requests: [],
        liveRequests: [],
        noChanges: !changed
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
        for (const version in pluginInfo.versions) {
            if (pluginInfo.versions[version]) {
                group.requests.push(locations.pluginZip(locations.ctx, slug, version, pluginInfo.versions[version]));
                const translations = locations.pluginTranslationV1_0(locations.ctx, slug, version);
                const legacyTranslations = locations.legacyPluginTranslationV1_0(locations.ctx, slug, version);
                if (!legacyTranslations.pathname || !translations.pathname) {
                    throw new Deno.errors.NotSupported(`legacyPluginTranslationV1_0 and pluginTranslationV1_0 must define pathnames`);
                }
                group.requests.push(translations, legacyTranslations);
                // since plugins timestamps are largely absent, we always reload the current version's translations
                const outdated = ((typeof pluginInfo.version === 'string') && (pluginInfo.version === version));
                const details = await getPluginTranslations(reporter, jreporter, locations, options, slug, version, outdated, locales);
                if (details && Array.isArray(details.translations) && (details.translations.length > 0)) {
                    for (const item of details.translations) {
                        if (item.version === version) {
                            group.requests.push(locations.pluginL10nZip(locations.ctx, slug, version, item.language));
                        }
                    }
                }
            }
        }
    } else if (pluginInfo.version && pluginInfo.download_link) {
        group.requests.push(locations.pluginZip(locations.ctx, slug, pluginInfo.version, pluginInfo.download_link));
    }
    if (pluginInfo.preview_link) {
        group.liveRequests.push(locations.pluginPreview(locations.ctx, slug, pluginInfo.preview_link));
    }
    if (Array.isArray(pluginInfo.screenshots)) {
        for (const n in pluginInfo.screenshots) {
            if (pluginInfo.screenshots[n].src) {
                group.liveRequests.push(locations.pluginScreenshot(locations.ctx, slug, pluginInfo.screenshots[n].src));
            }
        }
    }
    if (pluginInfo.banners && !Array.isArray(pluginInfo.banners)) {
        if (typeof pluginInfo.banners.high === 'string') {
            group.liveRequests.push(locations.pluginBanner(locations.ctx, slug, pluginInfo.banners.high));
        }
        if (typeof pluginInfo.banners.low === 'string') {
            group.liveRequests.push(locations.pluginBanner(locations.ctx, slug, pluginInfo.banners.low));
        }
    }

    return group;
}


async function getPluginTranslations(
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
