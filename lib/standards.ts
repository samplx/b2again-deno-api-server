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

import * as path from 'jsr:@std/path';

/**
 * The collection of arbitrary settings that define the
 * "standards" of an installation.
 *
 * This includes the functions that migrate data from upstream
 * into the downstream format. The assignment of host names,
 * and the mapping of URL's and the associated directory layout
 * of the files that must match.
 */

/**
 * Each of these is potentially a unique host. Each could
 * generate files to a different directory structure.
 */
export type ContentHostType = string;

/**
 * name of a component groups that we are archiving.
 * `core` relates to the main CMS code.
 * `plugins` relates to plugins and `themes` are themes.
 */
export const ARCHIVE_GROUP_NAMES = ['core', 'plugins', 'themes'] as const;

/**
 * the group names as a type.
 */
export type ArchiveGroupName = typeof ARCHIVE_GROUP_NAMES[number];

/**
 * determine if the meta data group name is valid.
 * @param name meta data group name
 * @returns true if it is a valid name
 */
export function isValidArchiveGroupName(name: string): boolean {
    return (ARCHIVE_GROUP_NAMES as ReadonlyArray<string>).includes(name);
}

/**
 * names of different source repositories.
 */
export const ARCHIVE_SOURCE_NAMES = ['legacy'] as const;

/**
 * the source names as a type.
 */
export type ArchiveSourceName = typeof ARCHIVE_SOURCE_NAMES[number];

/**
 * determine if the meta data group name is valid.
 * @param name meta data group name
 * @returns true if it is a valid name
 */
export function isValidArchiveSourceName(name: string): boolean {
    return (ARCHIVE_SOURCE_NAMES as ReadonlyArray<string>).includes(name);
}

/**
 * named list of items.
 * plugins and themes have associated lists. these are the names of the lists.
 * some of the list correspond with browse types, others are logical types.
 */
export const META_LIST_SLUG_VALUES = [
    'defaults',
    'effective',
    'featured',
    'interesting',
    'missing',
    'new',
    'popular',
    'rejected',
    'updated',
] as const;

/**
 * meta data list slugs
 */
export type MetaListSlug = typeof META_LIST_SLUG_VALUES[number];

/**
 * determine if the meta data list slug is valid.
 * @param name possible meta data list slug.
 * @returns true if it is valid.
 */
export function isValidMetaListSlug(name: string): boolean {
    return (META_LIST_SLUG_VALUES as ReadonlyArray<string>).includes(name);
}

const META_LIST_ITEM_TYPE_NAMES = [
    'plugin',
    'theme',
] as const;

export type MetaListItemType = typeof META_LIST_ITEM_TYPE_NAMES[number];

export function isValidMetaListItemType(name: string): boolean {
    return (META_LIST_ITEM_TYPE_NAMES as ReadonlyArray<string>).includes(name);
}

/**
 * information to configure a host type.
 */
export interface ArchiveHostAccess {
    /**
     * optional base directory, only needed if files are kept. if not
     * defined, URL's are defined, but no archives.
     */
    readonly baseDirectory?: string;

    /**
     * base URL to be used for the resource.
     */
    readonly baseUrl: string;

    /**
     * optional s3 sink where files are mirrored.
     */
    readonly s3sink?: string;
}

/**
 * A bag of information needed in order to convert the URLs correctly.
 */
export interface MigrationContext {
    /**
     * which source is active.
     * name and meaning is installation specific.
     */
    sourceName: ArchiveSourceName;

    /**
     * map of hosts and host specific settings.
     */
    hosts: Record<ContentHostType, ArchiveHostAccess>;

    /**
     * how many characters in any slug splitting prefix directory.
     * if zero, no prefix directory will be created.
     */
    prefixLengths: Record<ArchiveGroupName, number>;

    /**
     * how many characters from the message digest to add to live filenames.
     * if zero, live files names will not be changed/mapped.
     */
    liveMiddleLength: number;

    /**
     * string to add to the bunch of z's that define the non-ASCII prefix directory.
     */
    nonAsciiPrefixSuffix: string;
}

/**
 * result of mapping an upstream url into the downstream equivalent.
 * if there is an actual file, the pathname is the path to
 * the resource on the local system.
 */
export interface UrlProviderResult {
    /**
     * which host contains the result, undefined source URL is unchanged.
     */
    readonly host: ContentHostType;

    /**
     * if an actual file, the relative path to it from the base directory.
     */
    readonly relative: string;

    /**
     * downstream version of the resource. always defined.
     */
    readonly url: URL;

    /**
     * upstream version of the resource.
     */
    readonly upstream?: string;

    /**
     * should the file be read-only on the file system.
     */
    readonly is_readonly?: boolean;
}

/**
 * result of mapping an upstream url into the downstream
 * for a live file.
 * if there is an actual file, the pathname is the path to
 * the resource on the local system.
 */
export interface LiveUrlProviderResult {
    /**
     * which host contains the result.
     */
    readonly host: ContentHostType;

    /**
     * directory part of the URL.
     */
    readonly dirname: string;

    /**
     * main part of the filename (before the last dot).
     */
    readonly front: string;

    /**
     * file name extension (without the dot)
     */
    readonly extension: string;
}

/**
 * how to generate a common resource reference.
 */
export type CommonUrlProvider = (ctx: MigrationContext) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a single `slug` parameter.
 */
export type SlugUrlProvider = (ctx: MigrationContext, slug: string) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a `slug` and a `locale` parameter.
 */
export type SlugLocaleUrlProvider = (ctx: MigrationContext, slug: string, locale: string) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a slug, locale and version.
 */
export type SlugLocaleVersionUrlProvider = (
    ctx: MigrationContext,
    slug: string,
    locale: string,
    version: string,
) => UrlProviderResult;

/**
 * how to generate a reference the depends upon a slug and a version.
 */
export type SlugVersionUrlProvider = (ctx: MigrationContext, slug: string, version: string) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a version, slug and locale.
 */
export type VersionSlugLocaleUrlProvider = (
    ctx: MigrationContext,
    version: string,
    slug: string,
    locale: string,
) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a version, slug and locale version and locale.
 */
export type VersionSlugLocaleVersionUrlProvider = (
    ctx: MigrationContext,
    version: string,
    slug: string,
    localeVersion: string,
    locale: string,
) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a release, locale version and locale.
 */
export type VersionLocaleVersionUrlProvider = (
    ctx: MigrationContext,
    version: string,
    localeVersion: string,
    locale: string,
) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a slug, and the original URL.
 */
export type SlugOriginalUrlProvider = (ctx: MigrationContext, slug: string, original: string) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a slug, and the original URL.
 */
export type SlugLocaleOriginalUrlProvider = (
    ctx: MigrationContext,
    slug: string,
    locale: string,
    original: string,
) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a slug, a version and the original URL.
 */
export type SlugVersionOriginalUrlProvider = (
    ctx: MigrationContext,
    slug: string,
    version: string,
    original: string,
) => UrlProviderResult;

/**
 * how to generate a reference that depends upon a slug, and the original URL.
 */
export type SlugOriginalLiveUrlProvider = (ctx: MigrationContext, slug: string, original: string) => LiveUrlProviderResult;

/**
 * how to generate a configuration filename.
 */
export type CommonFilenameProvider = (ctx: MigrationContext) => string;

/**
 * information used to describe how the data is layed out for the
 * installation. this allows for customization of where data lives.
 * Resources live in "three worlds". They exist as URL's,
 * which include a host name. They exist as relative pathnames,
 * which are useful since they match part of the URL.
 * And they exist as fully qualified pathnames, which is what is
 * needed to actually save data.
 * We support more than one host, so each host has a "document-root".
 * An installation is configured by providing functions that are called
 * in order to get the actual values.
 * All of the functions must be pure.
 */
export interface StandardConventions {
    /**
     * upstream api server. normally 'api.wordpress.org'
     */
    apiHost: string;

    /**
     * upstream downloads server. normally 'downloads.wordpress.org'
     */
    downloadsHost: string;

    /**
     * basic configuration information passed to each conversion function.
     */
    ctx: MigrationContext;

    /**
     * limit on the number of versions of a plugin to retain. 0 = no limit.
     */
    pluginVersionLimit: number;

    /**
     * limit on the number of version of a theme to retain. 0 = no limit.
     */
    themeVersionLimit: number;

    /**
     * controls how JSON is expanded.
     */
    jsonSpaces: string;

    /**
     * JSON file containing core release lists: latest, outdated, insecure.
     */
    releases: CommonUrlProvider;

    /**
     * JSON file containing release information in upstream format.
     */
    legacyReleases: CommonUrlProvider;

    /**
     * optional slugs filename containing core releases to keep.
     */
    interestingReleases?: CommonUrlProvider;

    /**
     * optional slugs filename containing the locales to keep.
     */
    interestingLocales?: CommonUrlProvider;

    /**
     * optional slugs filename containing core file URL's that will 404
     */
    missingCore?: CommonUrlProvider;

    /**
     * plugin slug list filenames. either `interesting` or
     * `updated` must be defined. all others are optional,
     * but the replication of upstream behavior suffers when
     * they are not available.
     */
    pluginSlugs: {
        [Property in MetaListSlug]?: CommonUrlProvider;
    };

    /**
     * plugin slug list filenames. either `interesting` or
     * `updated` must be defined. all others are optional,
     * but the replication of upstream behavior suffers when
     * they are not available.
     */
    themeSlugs: {
        [Property in MetaListSlug]?: CommonUrlProvider;
    };

    /**
     * JSON filename for core release download status information.
     * slug=release id.
     */
    coreStatusFilename: SlugUrlProvider;

    /**
     * JSON file containing translation data. slug=release id.
     */
    coreTranslationV1_0: SlugUrlProvider;
    /**
     * JSON file containing translation data in upstream format. slug=release id.
     */
    legacyCoreTranslationV1_0: SlugUrlProvider;

    /**
     * JSON file containing data about file checksums. slug=release id,
     */
    coreChecksumsV1_0: SlugLocaleOriginalUrlProvider;
    /**
     * JSON file containing data about contributors. slug=release id.
     */
    coreCreditsV1_1: SlugLocaleOriginalUrlProvider;
    /**
     * JSON file containing data about importers. slug=release id.
     */
    coreImportersV1_1: SlugLocaleOriginalUrlProvider;

    /**
     * ZIP file with localization data.
     */
    coreL10nZip: VersionLocaleVersionUrlProvider;

    /**
      6 files per locale per release.
     * locale.zip, .zip{,.md5,.sha1}, .tar.gz{,.md5,.sha1}
     */
    coreL10nZips: Array<VersionLocaleVersionUrlProvider>;

    /**
     * ZIP file with core. 12 files per release.
     * .zip{,.md5,.sha1} .tar.gz{,.md5,.sha1}
     * -no-content.zip{,.md5,.sha1} -new-bundled.zip{,.md5,.sha1}
     */
    coreZips: Array<SlugUrlProvider>;

    /** */

    /**
     * JSON file containing summary data about plugin status.
     */
    pluginSummary: CommonUrlProvider;

    /**
     * JSON filename for plugin information in downstream format.
     * slug=plugin id.
     */
    pluginFilename: SlugUrlProvider;
    /**
     * JSON filename for plugin information in upstream format.
     * slug=plugin id.
     */
    legacyPluginFilename: SlugUrlProvider;

    /**
     * JSON filename for plugin download status information.
     * slug=plugin id.
     */
    pluginStatusFilename: SlugUrlProvider;

    /**
     * JSON file containing translation data. slug=plugin id.
     */
    pluginTranslationV1_0: SlugVersionUrlProvider;
    /**
     * JSON file containing translation data in upstream format. slug=plugin id.
     */
    legacyPluginTranslationV1_0: SlugVersionUrlProvider;

    /**
     * ZIP file containing a specific version of a plugin.
     * slug=plugin id. version=plugin version. original url from `download_link` field,
     * or from the `version` object values.
     */
    pluginZip: SlugVersionOriginalUrlProvider;

    /**
     * ZIP file containing l10n resources of a specific version for a plugin.
     * slug=plugin id. version=locale version. original url from `package` field.
     */
    pluginL10nZip: SlugVersionOriginalUrlProvider;

    /**
     * support page for a plugin. may be commercial, so only change if needed.
     */
    pluginSupport: SlugOriginalUrlProvider;

    /**
     * homepage associated with the plugin. should only change wp.org url's.
     */
    pluginHomepage: SlugOriginalUrlProvider;

    /**
     * screenshot files.
     */
    pluginScreenshot: SlugOriginalLiveUrlProvider;

    /**
     * icon files.
     */
    pluginIcon: SlugOriginalLiveUrlProvider;

    /**
     * banner files.
     */
    pluginBanner: SlugOriginalLiveUrlProvider;

    /**
     * preview of the plugin page.
     */
    pluginPreview: SlugOriginalLiveUrlProvider;

    /**
     * JSON file containing summary data about theme status.
     */
    themeSummary: CommonUrlProvider;

    /**
     * JSON filename for theme information in downstream format.
     * slug=theme id.
     */
    themeFilename: SlugUrlProvider;
    /**
     * JSON filename for theme information in upstream format.
     * slug=theme id.
     */
    legacyThemeFilename: SlugUrlProvider;

    /**
     * JSON filename for theme download status information.
     * slug=theme id.
     */
    themeStatusFilename: SlugUrlProvider;

    /**
     * JSON file containing translation data. slug=theme id.
     */
    themeTranslationV1_0: SlugVersionUrlProvider;
    /**
     * JSON file containing translation data in upstream format. slug=theme id.
     */
    legacyThemeTranslationV1_0: SlugVersionUrlProvider;

    /**
     * ZIP file containing a specific version of a theme.
     * slug=theme id. version=theme version. original url from `download_link` field,
     * or from the `version` object values.
     */
    themeZip: SlugVersionOriginalUrlProvider;

    /**
     * ZIP file containing l10n resources of a specific version for a theme.
     * slug=theme id. version=locale version. original url from `package` field.
     */
    themeL10nZip: SlugVersionOriginalUrlProvider;

    /**
     * reviews page for a theme.
     */
    themeReviews: SlugOriginalUrlProvider;

    /**
     * homepage associated with the theme. should only change wp.org url's.
     */
    themeHomepage: SlugOriginalUrlProvider;

    /**
     * screenshot files.
     */
    themeScreenshot: SlugOriginalLiveUrlProvider;

    /**
     * preview of the theme page.
     */
    themePreview: SlugOriginalLiveUrlProvider;
}

/** end of the line for standard prefix */
const Z_CODE_POINT: number = 'z'.codePointAt(0) ?? 122;

/**
 * Get the Unicode directory prefix.
 * @param prefixLength how long is the directory prefix.
 * @returns a name used for `other` aka unicode names.
 */
function unicodePrefix(ctx: MigrationContext, section: ArchiveGroupName): string {
    if (ctx.prefixLengths[section] > 0) {
        const zzzs = 'z'.repeat(ctx.prefixLengths[section]);
        return `${zzzs}${ctx.nonAsciiPrefixSuffix}`;
    }
    return '';
}

/**
 * Creates a directory name that may be split in order to
 * reduce the number of entries in any one directory.
 * With over 100k plugins, it is a performance hit to have
 * a directory with that many sub-directories. So, split the
 * name into a prefix of up-to some number of characters,
 * followed by the full name. Since there are not many
 * Unicode plugins/themes, we will put those all in a
 * single unicode prefix directory.
 * @param name slug used for a directory name.
 * @param prefixLength how many characters in the prefix, 0 = no split.
 * @returns directory name split at the prefix length.
 */
export function splitDirname(ctx: MigrationContext, section: ArchiveGroupName, name: string): string {
    if ((ctx.prefixLengths[section] > 0) && (name.length > 0)) {
        const nameFirst = name.codePointAt(0);
        if (nameFirst && (nameFirst > Z_CODE_POINT)) {
            return path.join(unicodePrefix(ctx, section), name);
        }
        const prefix = name.substring(0, ctx.prefixLengths[section]);
        return path.join(prefix, name);
    }
    return name;
}

/**
 * converts a provider result into a local pathname.
 * @param ctx bag of information used to convert urls.
 * @param provider result about a url.
 * @returns full pathname of the resource.
 */
export function toPathname(ctx: MigrationContext, provider: UrlProviderResult): string {
    if (!provider.host || !provider.relative) {
        throw new Deno.errors.BadResource(`both host and relative must be defined`);
    }
    const baseDirectory = ctx.hosts[provider.host]?.baseDirectory;
    if (!ctx.hosts[provider.host] || !baseDirectory) {
        throw new Deno.errors.BadResource(`host ${provider.host} is not configured for output`);
    }
    return path.join(baseDirectory, provider.relative);
}

/**
 * determine if the url is stored locally.
 * @param ctx bag of information used to convert urls.
 * @param provider result about a url.
 * @returns true if there is a local filename associated with the result.
 */
export function hasPathname(ctx: MigrationContext, provider: UrlProviderResult): boolean {
    if (!provider.host || !provider.relative) {
        return false;
    }
    const baseDirectory = ctx.hosts[provider.host]?.baseDirectory;
    if (!ctx.hosts[provider.host] || !baseDirectory) {
        return false;
    }
    return true;
}

/**
 * determine if the url should be copied to an s3 bucket.
 * @param ctx bag of information used to convert urls.
 * @param provider result about a url.
 * @returns true if there is/or should be a copy of the resource in an s3 bucket.
 */
export function hasS3Sink(ctx: MigrationContext, provider: UrlProviderResult): boolean {
    if (!provider.host || !provider.relative) {
        return false;
    }
    const s3sink = ctx.hosts[provider.host]?.s3sink;
    if (!ctx.hosts[provider.host] || !s3sink) {
        return false;
    }
    return true;
}
