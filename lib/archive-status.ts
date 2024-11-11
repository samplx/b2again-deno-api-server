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

import { ArchiveGroupName, ContentHostType } from './standards.ts';

/**
 * Classification of a download group or file.
 */
export type ArchiveFileStatus = 'unknown' | 'complete' | 'failed' | 'uninteresting';

/**
 * Describes an archive asset.
 */
export interface ArchiveFileSummary {
    /**
     * which logical host has the content.
     */
    host: ContentHostType;
    /**
     * relative pathname of the downloaded file.
     */
    filename: string;
    /**
     * current status.
     */
    status: ArchiveFileStatus;
    /**
     * true if the file is read-only on the file system.
     */
    is_readonly: boolean;
    /**
     * timestamp of when the status was defined.
     */
    when?: number;
    /**
     * optional SHA-256 message digest of the file contents as a hex string.
     * must be defined for a file to be marked 'complete'.
     */
    sha256?: string;
    /**
     * optional md5 message digest of the file contents as a hex string.
     */
    md5?: string;
    /**
     * optional SHA-1 message digest of the file contents as a hex string.
     */
    sha1?: string;
}

/**
 * Describes a group of downloaded files.
 */
export interface ArchiveGroupStatus {
    /**
     * abritrary name of the upstream source.
     */
    source_name: string;
    /**
     * what type of data is this about. core, plugins, themes.
     */
    section: ArchiveGroupName;
    /**
     * group id.
     */
    slug: string;
    /**
     * true if we have all the known files that we want.
     */
    is_complete: boolean;
    /**
     * timestamp of when the status was defined. timestamp of execution.
     */
    when: number;
    /**
     * timestamp from when the upstream item was updated - derived from upstream data.
     */
    updated?: string;
    /**
     * hash map of key=filename, value = file information
     */
    files: Record<string, ArchiveFileSummary>;
}

/**
 * Summary of information about a group, we remove the bulky `files` field.
 */
export type ArchiveGroupSummary = {
    [Property in keyof ArchiveGroupStatus as Exclude<Property, 'files'>]: ArchiveGroupStatus;
};
