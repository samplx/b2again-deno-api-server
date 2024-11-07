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

import * as path from "jsr:@std/path";

import {
    CommonUrlProvider,
    ContentHostType,
    ArchiveGroupName,
    MigrationContext,
    SlugLocaleUrlProvider,
    SlugUrlProvider,
    SlugVersionOriginalUrlProvider,
    splitDirname,
    StandardLocations,
    UrlProviderResult,
    SlugOriginalUrlProvider,
    SlugOriginalLiveUrlProvider,
    LiveUrlProviderResult,
    VersionLocaleVersionUrlProvider
} from "./standards.ts";


function getFilenameSlugProvider(
    host: ContentHostType,
    sourceName: string,
    section: ArchiveGroupName,
    filename: string,
    groupName: string = 'meta'
): SlugUrlProvider {
    return function (ctx: MigrationContext, slug: string): UrlProviderResult {
        const split = splitDirname(ctx, section, slug);
        return bindHost(ctx, host, `/${groupName}/${sourceName}/${section}/${split}/${filename}`);
    }
}

function getFilenameLocaleSlugProvider(
    host: ContentHostType,
    sourceName: string,
    section: ArchiveGroupName,
    filename: string,
    groupName: string = 'meta'
): SlugLocaleUrlProvider {
    return function (ctx: MigrationContext, slug: string, locale: string): UrlProviderResult {
        const split = splitDirname(ctx, section, slug);
        return bindHost(ctx, host, `/${groupName}/${sourceName}/${section}/${split}/l10n/${locale}/${filename}`);
    }
}

function bindHost(
    ctx: MigrationContext,
    host: ContentHostType,
    relative: string,
    upstream?: string
): UrlProviderResult {
    const url = new URL(relative, ctx.hosts[host].baseUrl);
    let pathname;
    if (ctx.hosts[host].baseDirectory) {
        pathname = path.join(ctx.hosts[host].baseDirectory, relative);
    }
    return {
        host,
        url,
        pathname,
        upstream
    };
}

function getCommonProvider(host: ContentHostType, sourceName: string, filename: string, groupName: string = 'meta'): CommonUrlProvider {
    return function (ctx: MigrationContext): UrlProviderResult {
        const relative = `/${groupName}/${sourceName}/${filename}`;
        return bindHost(ctx, host, relative);
    }
}

function getSlugVersionOriginalUrlProvider(host: ContentHostType, section: ArchiveGroupName, sourceName: string, postSplit: string = '', groupName: string= 'read-only'): SlugVersionOriginalUrlProvider {
    return function (ctx: MigrationContext, slug: string, version: string, original: string): UrlProviderResult {
        const filename = path.basename(original);
        const split = splitDirname(ctx, section, slug);
        const relative = `/${groupName}/${section}/${sourceName}/${split}${postSplit}/${version}/${filename}`;
        return bindHost(ctx, host, relative);
    }
}

function getSlugUrlProvider(host: ContentHostType, section: ArchiveGroupName, sourceName: string, groupName: string): SlugOriginalUrlProvider {
    return function (ctx: MigrationContext, slug: string, _original: string): UrlProviderResult {
        const relative = `/${groupName}/${section}/${sourceName}/${slug}/`;
        return bindHost(ctx, host, relative);
    }
}

function getSlugOriginalLiveUrlProvider(host: ContentHostType, section: ArchiveGroupName, sourceName: string, fileType: string): SlugOriginalLiveUrlProvider {
    return function (ctx: MigrationContext, slug: string, original: string): LiveUrlProviderResult {
        const filename = path.basename(original);
        const split = splitDirname(ctx, section, slug);
        const dirname = `/live/${section}/${sourceName}/${split}/${fileType}/`;
        const lastDot = filename.lastIndexOf('.');
        const front = (lastDot < 0) ? filename : filename.substring(0, lastDot);
        const extension = (lastDot < 0) ? '' : filename.substring(lastDot).toLowerCase();
        return {
            host,
            dirname,
            front,
            extension
        }
    }
}

function getSlugLiveIndexUrlProvider(host: ContentHostType, section: ArchiveGroupName, sourceName: string, fileType: string): SlugOriginalLiveUrlProvider {
    return function (ctx: MigrationContext, slug: string, _original: string): LiveUrlProviderResult {
        const filename = 'index.html';
        const split = splitDirname(ctx, section, slug);
        const dirname = `/live/${section}/${sourceName}/${split}/${fileType}/`;
        const lastDot = filename.lastIndexOf('.');
        const front = (lastDot < 0) ? filename : filename.substring(0, lastDot);
        const extension = (lastDot < 0) ? '' : filename.substring(lastDot).toLowerCase();
        return {
            host,
            dirname,
            front,
            extension
        }
    }
}

function getCoreArchiveUrlProvider(
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    suffix: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): SlugUrlProvider {
    return function (ctx: MigrationContext, release: string): UrlProviderResult {
        const split = splitDirname(ctx, section, release);
        const relative = `/${groupName}/${section}/${sourceName}/${split}/${filename}-${release}${suffix}`;
        const upstream = `https://${downloadsHost}/release/${filename}-${release}${suffix}`;
        return bindHost(ctx, host, relative, upstream);
    }
}

function getCoreArchiveListUrlProvider(
    suffixes: Array<string>,
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): Array<SlugUrlProvider> {
    const list: Array<SlugUrlProvider> = [];
    suffixes.forEach((suffix) => {
        const provider = getCoreArchiveUrlProvider(downloadsHost, host, section, sourceName, suffix, filename, groupName);
        list.push(provider);
    });
    return list;
}


function getCoreL10nArchiveUrlProvider(
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    groupName: string = 'read-only'
): VersionLocaleVersionUrlProvider {
    return function (ctx: MigrationContext, release: string, localeVersion: string, locale: string): UrlProviderResult {
        const split = splitDirname(ctx, section, release);
        const relative = `/${groupName}/${section}/${sourceName}/${split}/l10n/${localeVersion}/${locale}.zip`;
        // translation/core/5.8-beta/af.zip
        const upstream = `https://${downloadsHost}/translation/core/${localeVersion}/${locale}.zip`;
        return bindHost(ctx, host, relative, upstream);
    }
}


function getCoreL10nArchiveItemUrlProvider(
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    suffix: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): VersionLocaleVersionUrlProvider {
    return function (ctx: MigrationContext, release: string, localeVersion: string, locale: string): UrlProviderResult {
        const split = splitDirname(ctx, section, release);
        const relative = `/${groupName}/${section}/${sourceName}/${split}/l10n/${localeVersion}/${filename}-${release}${suffix}`;
        const upstream = `https://${downloadsHost}/release/${locale}/${filename}-${release}${suffix}`;
        return bindHost(ctx, host, relative, upstream);
    }
}

function getCoreL10nArchiveListUrlProvider(
    suffixes: Array<string>,
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): Array<VersionLocaleVersionUrlProvider> {
    const list: Array<VersionLocaleVersionUrlProvider> = [];
    suffixes.forEach((suffix) => {
        const provider = getCoreL10nArchiveItemUrlProvider(downloadsHost, host, section, sourceName, suffix, filename, groupName);
        list.push(provider);
    });
    return list;
}


const DEFAULT_DOWNLOADS_BASE_DIRECTORY = './build';
const DOWNLOADS_BASE_DIRECTORY = Deno.env.get('B2P_DOWNLOADS_BASE_DIRECTORY') ?? DEFAULT_DOWNLOADS_BASE_DIRECTORY;
const DOWNLOADS_HOST = 'downloads.wordpress.org';

export default function getStandardLocations(sourceName: string = 'legacy'): StandardLocations {
    return {
        apiHost: 'api.wordpress.org',
        downloadsHost: DOWNLOADS_HOST,
        ctx: {
            sourceName,
            hosts: {
                api: {
                    baseUrl: 'https://api.b2again.org/'
                },
                downloads: {
                    baseUrl: 'https://downloads.b2again.org/',
                    baseDirectory: DOWNLOADS_BASE_DIRECTORY
                },
                support: {
                    baseUrl: 'https://support.b2again.org/'
                },
                www: {
                    baseUrl: 'https://www.b2again.org/'
                }
            },
            prefixLengths: {
                core: 0,
                plugins: 2,
                themes: 2
            },
            nonAsciiPrefixSuffix: '+',
            liveMiddleLength: 20
        },
        releases: getCommonProvider('downloads', sourceName, 'releases.json'),
        legacyReleases: getCommonProvider('downloads', sourceName, `${sourceName}-releases.json`),
        // interestingReleases -- default to all releases
        // interestingLocales -- default to all locales
        pluginSlugs: {
            defaults: getCommonProvider('downloads', sourceName, `plugins/defaults-list.json`),
            effective: getCommonProvider('downloads', sourceName, `plugins/effective-list.json`),
            featured: getCommonProvider('downloads', sourceName, `plugins/featured-list.json`),
            interesting: undefined,
            new: getCommonProvider('downloads', sourceName, `plugins/new-list.json`),
            popular: getCommonProvider('downloads', sourceName, `plugins/popular-list.json`),
            rejected: undefined,
            updated: getCommonProvider('downloads', sourceName, `plugins/updated-list.json`)
        },
        themeSlugs: {
            defaults: getCommonProvider('downloads', sourceName, `themes/defaults-list.json`),
            effective: getCommonProvider('downloads', sourceName, `themes/effective-list.json`),
            featured: getCommonProvider('downloads', sourceName, `themes/featured-list.json`),
            interesting: undefined,
            new: getCommonProvider('downloads', sourceName, `themes/new-list.json`),
            popular: getCommonProvider('downloads', sourceName, `themes/popular-list.json`),
            rejected: undefined,
            updated: getCommonProvider('downloads', sourceName, `themes/updated-list.json`)
        },

        coreTranslationV1_0: getFilenameSlugProvider('downloads', sourceName, 'core', 'translations-1.0.json'),
        legacyCoreTranslationV1_0: getFilenameSlugProvider('downloads', sourceName, 'core', `${sourceName}-translations-1.0.json`),

        coreChecksumsV1_0: getFilenameLocaleSlugProvider('downloads', sourceName, 'core', 'checksums-1.0.json'),
        coreCreditsV1_1: getFilenameLocaleSlugProvider('downloads', sourceName, 'core', 'credits-1.1.json'),
        coreImportersV1_1: getFilenameLocaleSlugProvider('downloads', sourceName, 'core', 'importers-1.1.json'),

        coreL10nZip: getCoreL10nArchiveUrlProvider(DOWNLOADS_HOST, 'downloads', 'core', sourceName),
        coreL10nZips: getCoreL10nArchiveListUrlProvider(
            [
                '.zip',
                '.zip.md5',
                '.zip.sha1',
                '.tar.gz',
                '.tar.gz.md5',
                '.tar.gz.sha1',
            ],
            DOWNLOADS_HOST, 'downloads', 'core', sourceName
        ),
        coreZips: getCoreArchiveListUrlProvider(
            [
                '.zip',
                '.zip.md5',
                '.zip.sha1',
                '.tar.gz',
                '.tar.gz.md5',
                '.tar.gz.sha1',
                '-no-content.zip',
                '-no-content.zip.md5',
                '-no-content.zip.sha1',
                '-new-bundled.zip',
                '-new-bundled.zip.md5',
                '-new-bundled.zip.sha1',
            ], DOWNLOADS_HOST, 'downloads', 'core', sourceName),

        coreStatusFilename: getFilenameSlugProvider('downloads', sourceName, 'core', 'release-status.json'),

        pluginSummary: getCommonProvider('downloads', sourceName, `plugins/summary.json`),
        pluginFilename: getFilenameSlugProvider('downloads', sourceName, 'plugins', 'plugin.json'),
        legacyPluginFilename: getFilenameSlugProvider('downloads', sourceName, 'plugins', `${sourceName}-plugin.json`),
        pluginStatusFilename: getFilenameSlugProvider('downloads', sourceName, 'plugins', 'plugin-status.json'),
        pluginTranslationV1_0: getFilenameSlugProvider('downloads', sourceName, 'plugins', 'translations-1.0.json'),
        legacyPluginTranslationV1_0: getFilenameSlugProvider('downloads', sourceName, 'plugins', `${sourceName}-translations-1.0.json`),
        pluginZip: getSlugVersionOriginalUrlProvider('downloads', 'plugins', sourceName),
        pluginL10nZip: getSlugVersionOriginalUrlProvider('downloads', 'plugins', sourceName, '/l10n'),
        pluginSupport: getSlugUrlProvider('support', 'plugins', sourceName, 'support'),
        pluginHomepage: getSlugUrlProvider('support', 'plugins', sourceName, 'homepages'),
        pluginScreenshot: getSlugOriginalLiveUrlProvider('downloads', 'plugins', sourceName, 'screenshots'),
        pluginBanner: getSlugOriginalLiveUrlProvider('downloads', 'plugins', sourceName, 'banners'),
        pluginPreview: getSlugLiveIndexUrlProvider('downloads', 'plugins', sourceName, 'preview'),

        themeSummary: getCommonProvider('downloads', sourceName, `themes/summary.json`),
        themeFilename: getFilenameSlugProvider('downloads', sourceName, 'themes', 'theme.json'),
        legacyThemeFilename: getFilenameSlugProvider('downloads', sourceName, 'themes', `${sourceName}-theme.json`),
        themeStatusFilename: getFilenameSlugProvider('downloads', sourceName, 'themes', 'theme-status.json'),
        themeTranslationV1_0: getFilenameSlugProvider('downloads', sourceName, 'themes', 'translations-1.0.json'),
        legacyThemeTranslationV1_0: getFilenameSlugProvider('downloads', sourceName, 'themes', `${sourceName}-translations-1.0.json`),
        themeZip: getSlugVersionOriginalUrlProvider('downloads', 'themes', sourceName),
        themeL10nZip: getSlugVersionOriginalUrlProvider('downloads', 'themes', sourceName, '/l10n'),
        themeHomepage: getSlugUrlProvider('support', 'themes', sourceName, 'homepages'),
        themeScreenshot: getSlugOriginalLiveUrlProvider('downloads', 'themes', sourceName, 'screenshots'),
        themePreview: getSlugLiveIndexUrlProvider('downloads', 'themes', sourceName, 'preview'),
        themeReviews: getSlugUrlProvider('support', 'themes', sourceName, 'reviews'),
    }
}
