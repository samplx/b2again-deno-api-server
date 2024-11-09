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

import { MigrationContext } from "./standards.ts";

/**
 * how to migrate an upstream resource (theme, plugin), to the
 * downstream version.
 */


/**
 * a field level migration function. used to handle the migration of a
 * field value from the upstream to the downstream. we keep the processing
 * as generic as possible.
 */
export type MigrationProvider<T> = (ctx: MigrationContext, upstream: unknown) => T;

/**
 * a generic structure migration provider.
 * each field in the parametric parameter (i.e. generic) structure type
 * has an optional migration provider that can be used to change the upstream
 * field value as part of the migration process.
 */
export type MigrationStructureProvider<Structure extends Record<string, unknown>> = {
    [Property in keyof Structure]?: MigrationProvider<Structure[Property]>;
}

/**
 * Generic structure migrations. Used to migrate data from upstream
 * into the downstream format. This is where URL's and hosts get mapped
 * from upstream versions into how we want to maintain them. The
 * policy of how to perform the migration is isolated into the migrator
 * provider structure. It has a field with the same name as the parent
 * structure that will migrate the upstream field to its downstream
 * value.
 * @param migrator injectable migrator provider.
 * @param ctx migration context. information used to migration urls.
 * @param upstream content to be migrated as delivered from upstream.
 * @returns
 */
export function migrateStructure<Structure extends Record<string, unknown>>(
    migrator: MigrationStructureProvider<Structure>,
    ctx: MigrationContext,
    upstream: Structure
): Structure {
    const clone = structuredClone(upstream) as Record<string, unknown>;
    for (const key in Object.keys(migrator)) {
        if ((key in clone) && clone[key] && (typeof key === 'string') && migrator[key]) {
            clone[key] = migrator[key](ctx, clone[key]);
        }
    }
    return clone as Structure;
}
