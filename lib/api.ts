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

/**
 * b2again CMS API
 *
 * A reverse engineered WordPress.org API.
 * Based upon the [Codex documentation](https://codex.wordpress.org/WordPress.org_API)
 */

/*
 * Secret Key
 *  `/secret-key/1.0/`
 *  `/secret-key/1.1/`
 *  `/secret-key/1.1/salt/`
 *      no input parameters.
 *      mime type is plain/text.
 */

/*
 * Stats
 */

/** value returned by `/stats/wordpress/1.0/` */
export type StatsWordPressResultV1_0 = Record<string, number>;

/** value returned by `/stats/php/1.0/` */
export type StatsPhpResultV1_0 = Record<string, number>;

/** value returned by `/stats/mysql/1.0/` */
export type StatsMysqlResultV1_0 = Record<string, number>;

/** value returned by `/stats/locale/1.0/` */
export type StatsLocaleResultV1_0 = Record<string, number>;

/** value returned by `/stats/plugin/1.0/downloads.php` */
export type StatsPluginDownloadsResultV1_0 = Record<string, string>;

/** value returned by `/stats/plugin/1.0/:slug` */
export type StatsPluginSlugResultV1_0 = Record<string, number>;

/*
 * Version Check
 */

/*
 * Version Stability (releases)
 */

/**
 * How WordPress.org characterizes a core release status.
 */
export type ReleaseStatus = 'latest' | 'outdated' | 'insecure';

/**
 * value returned by `/core/stable-check/1.0/`
 */
export type StableCheckResultV1_0 = Record<string, ReleaseStatus>;

/**
 * data in downstream `releases.json` file.
 */
export interface ReleasesResult {
    latest: string;
    outdated: Array<string>;
    insecure: Array<string>;
}

/*
 * Credits
 *  `/core/credits/1.1/`
 *      opaque JSON data right now
 */

/*
 * Translations
 */

/**
 * A single locale description for localization (l10n).
 */
export interface TranslationEntry {
    /** locale name. */
    language: string;
    /** version of the l10n package. */
    version: string;
    /** last update of package file. yyyy-mm-dd hh:mm:ss format. */
    updated: string;
    /** name of the locale in English. */
    english_name: string;
    /** name of the locale as it is in the native language. */
    native_name: string;
    /** URL of the l10n package file. */
    package: string;
    /** map of ISO codes for this locale. */
    iso: Record<string, string>;
    /** optional map of translations. usually just 'continue'. */
    strings?: Record<string, string>;
}

/**
 * A list of translations/localization packages available.
 *
 * result for:
 *  `/translations/core/1.0/?version=n.d.d`
 *  `/translations/plugins/1.0/?version=n.d.d&slug=XXXX`
 *  `/translations/themes/1.0/?version=n.d.d&slug=XXXX`
 */
export interface TranslationsResultV1_0 {
    translations: Array<TranslationEntry>;
}

/*
 * Themes
 */

/**
 * An "expanded" Author.
 */
export interface ThemeAuthor {
    user_nicename?: string;
    profile?: boolean | string;
    avatar?: boolean | string;
    display_name?: string;
    author?: boolean | string;
    author_url?: boolean | string;
}

/**
 * Description of a parent theme.
 */
export interface ThemeParent {
    slug?: string;
    name?: string;
    homepage?: string;
}

/**
 * Detailed information about a theme. This represents the
 * entire theme. Fields may be filtered out in responses as
 * part of the request.
 */
export interface ThemeDetails extends Record<string, unknown> {
    slug: string;
    name?: string;
    version?: string;
    preview_url?: string;
    author?: string | ThemeAuthor;
    screenshot_url?: string;
    ratings?: Record<string, number>;
    rating?: number;
    num_ratings?: number;
    reviews_url?: string;
    downloaded?: number;
    active_installs?: number;
    last_updated?: string;
    last_updated_time?: string;
    creation_time?: string;
    homepage?: string;
    description?: undefined | string;
    sections?: Record<string, string>;
    download_link?: string;
    tags?: Record<string, string>;
    versions?: Record<string, string>;
    template?: string;
    parent?: ThemeParent;
    requires?: boolean | string;
    requires_php?: boolean | string;
    is_commercial?: boolean;
    external_support_url?: boolean | string;
    is_community?: boolean;
    external_repository_url?: string;
}

/*
 * Plugins
 */

/**
 * Plugin contributor information.
 */
export interface ContributorInfo {
    profile?: string;
    avatar?: string;
    display_name?: string;
}

/**
 * Plugin screenshot information.
 */
export interface ScreenshotInfo {
    src?: string;
    caption?: string;
}

/**
 * Plugin banner information.
 * Since this is traditionally the result of PHP -> JSON translation,
 * a normally 'null' value comes accross as a `false` value.
 */
export interface BannersInfo {
    low?: boolean | string;
    high?: boolean | string;
}

/**
 *  Meta data about a single plugin.
 */
export interface PluginDetails extends Record<string, unknown> {
    slug: string;
    name?: string;
    version?: string;
    author?: string;
    author_profile?: string;
    contributors?: Record<string, ContributorInfo>;
    requires?: string;
    tested?: string;
    requires_php?: boolean | string;
    requires_plugins?: Array<string>;
    rating?: number;
    ratings?: Record<string, number>;
    num_ratings?: number;
    support_url?: string;
    support_threads?: number;
    support_threads_resolved?: number;
    active_installs?: number;
    last_updated?: string;
    added?: string;
    homepage?: string;
    sections?: Record<string, string | undefined>;
    download_link?: string;
    upgrade_notice?: Record<string, string>;
    screenshots?: Record<string, ScreenshotInfo>;
    tags?: Record<string, string>;
    versions?: Record<string, undefined | string>;
    business_model?: boolean | string;
    repository_url?: string;
    commercial_support_url?: string;
    donate_link?: string;
    banners?: Array<unknown> | BannersInfo;
    preview_link?: string;
}

/*
 * Block Patterns
 */

// FIXME

/*
 * Popular Import Plugin
 */

export interface ImporterItem {
    'name': string;
    'description': string;
    'plugin-slug': string;
    'importer-id': string;
}

/**
 * results for `/core/importers/1.1/`.
 */
export interface ImporterResultV1_1 {
    importers: Array<ImporterItem>;
    translated: boolean;
}

/*
 * Checksum
 */

/**
 *  results for `/core/checksums/1.0/?version=N.d.d&locale=nn_NN`
 */
export interface ChecksumResultV1_1 {
    checksums: Record<string, string>;
}

/*
 * Editor
 *  `/core/handbook/1.0/`
 *          response is either empty, or a redirect.
 */

/*
 * Events
 */

/**
 * Information about the location from the request as echoed in the repsonse.
 */
export interface EventResponseLocation {
    description?: false | string;
    latitude?: string;
    longitude?: string;
    country?: string;
}

/**
 * Information about a single event's location.
 */
export interface EventItemLocation {
    location?: string;
    country?: string;
    latitude?: string;
    longitude?: string;
}

/**
 * currently supported event type names.
 */
export type EventItemType = 'meetup' | 'wordcamp';

/**
 * Details about a single event.
 */
export interface EventItem {
    /** general event classication. */
    type?: EventItemType;
    /** text used to describe the event. */
    title?: string;
    /** URL for more information about the event. */
    url?: string;
    /** optional meetup series title. */
    meetup?: null | string;
    /** optional meetup series url. */
    mettup_url?: null | string;
    /** starting date-time in event's local timezone. */
    date?: string;
    /** ending date-time in event's local timezone. */
    end_date?: string;
    /** start time in seconds since the epoch. */
    start_unix_timestamp?: number;
    /** end time in seconds since the epoch. */
    end_unix_timestamp?: number;
    /** details about this event's location. */
    location?: EventItemLocation;
}

/**
 * result of a request to `/events/1.0/`.
 */
export interface EventsResponseV1_0 {
    /** true if operating in a sandbox. */
    sandboxed: boolean;
    /** any error in processing the request. */
    error: null | string;
    /**
     * either an empty array, or an location. This is an artifact of
     * PHP to JSON serialization. An empty PHP associative array
     * gets serialized as an empty array rather than as an empty object.
     */
    location: Array<never> | EventResponseLocation;
    /**
     * list of events that match the location filter.
     */
    events: Array<EventItem>;
}

/*
 * Browse Happy
 */

/**
 * results for `/core/browse-happy/1.1/` (POST)
 */
export interface BrowseHappyResultV1_1 {
    name: string;
    version: string;
    platform: string;
    update_url: string;
    img_src: string;
    img_src_ssl: string;
    current_version: string;
    upgrade: boolean;
    insecure: boolean;
    mobile: boolean;
}

/*
 * Serve Happy
 */

/**
 * results for `/core/serve-happy/1.0/`.
 */
export interface ServeHappyResultV1_0 {
    recommended_version: string;
    minimum_version: string;
    is_supported: boolean;
    is_secure: boolean;
    is_acceptable: boolean;
}
