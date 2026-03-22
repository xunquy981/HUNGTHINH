
/**
 * SINGLE SOURCE OF TRUTH FOR APP VERSIONS
 * 
 * APP_VERSION: Displayed in UI and exported metadata.
 * DB_SCHEMA_VERSION: Used by Dexie.js for migrations. 
 * 
 * RULE: Whenever you change the DB schema in services/db.ts, increment DB_SCHEMA_VERSION here.
 */

export const APP_VERSION = '2.0';
export const DB_SCHEMA_VERSION = 31; // Matches the latest version defined in db.ts
export const APP_NAME = 'Hưng Thịnh ERP Pro';
