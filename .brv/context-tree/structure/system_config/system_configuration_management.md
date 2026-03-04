## Raw Concept
**Task:**
Implement System Configuration Management with Caching

**Changes:**
- Created SystemConfigModule for managing system-wide settings
- Implemented SystemConfigService with an in-memory Map cache for performance
- Added SystemConfigRepository with onConflictDoUpdate for atomic upserts
- Created SystemConfigController restricted to ADMIN role

**Files:**
- src/module/system-config/system-config.controller.ts
- src/module/system-config/system-config.service.ts
- src/module/system-config/system-config.repository.ts
- src/module/system-config/dto/update-system-config.dto.ts

**Flow:**
Module Init -> Refresh Cache -> Service.getConfigValue (Cache Hit/Miss) -> Controller (Admin only update)

**Timestamp:** 2026-02-24

**Author:** ByteRover

## Narrative
### Structure
System configuration is managed in src/module/system-config. It provides a key-value store for system settings stored in the database.

### Dependencies
Integrated with AuthModule for RBAC protection (AtGuard, RolesGuard).

### Features
In-memory caching of configuration values for high performance. Cache is refreshed on module initialization and updated whenever a config value is changed.

### Rules
Rule 1: Only users with ADMIN role can view or update system configurations.
Rule 2: Configuration keys are unique and used for lookups.

### Examples
Fetching a config: service.getConfigValue("PAGE_SIZE"). Updating a config: PATCH /system-configs/:key with { value: "20" }.
