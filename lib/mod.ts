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

export type { ArchiveGroupName, ContentHostType, MetaListSlug } from './standards.ts';

export {
    ARCHIVE_GROUP_NAMES,
    ARCHIVE_SOURCE_NAMES,
    isValidArchiveGroupName,
    isValidArchiveSourceName,
    isValidMetaListSlug,
    META_LIST_SLUG_VALUES,
} from './standards.ts';

export type {
    BannersInfo,
    BrowseHappyResultV1_1,
    ChecksumResultV1_1,
    ContributorInfo,
    EventItem,
    EventItemLocation,
    EventItemType,
    EventResponseLocation,
    EventsResponseV1_0,
    ImporterItem,
    ImporterResultV1_1,
    PluginDetails,
    ReleasesResult,
    ReleaseStatus,
    ScreenshotInfo,
    ServeHappyResultV1_0,
    StableCheckResultV1_0,
    StatsLocaleResultV1_0,
    StatsMysqlResultV1_0,
    StatsPhpResultV1_0,
    StatsPluginDownloadsResultV1_0,
    StatsPluginSlugResultV1_0,
    StatsWordPressResultV1_0,
    ThemeAuthor,
    ThemeDetails,
    ThemeParent,
    TranslationEntry,
    TranslationsResultV1_0,
} from './api.ts';

export type {
    ArchiveFileStatus,
    ArchiveFileSummary,
    ArchiveGroupStatus,
    ArchiveGroupSummary,
    LiveFileSummary,
} from './archive-status.ts';

export type { MigrationProvider, MigrationStructureProvider } from './migration.ts';

export { getLiveUrlFromProvider, getUrlFromProvider, migrateStructure } from './migration.ts';

export type { ConsoleReporter, JsonLogWriter, JsonReporter } from './reporter.ts';

export {
    DISABLED_CONSOLE_REPORTER,
    DISABLED_JSON_REPORTER,
    ENABLED_CONSOLE_REPORTER,
    ENABLED_JSON_REPORTER,
    getISOtimestamp,
    getJsonReporter,
} from './reporter.ts';
