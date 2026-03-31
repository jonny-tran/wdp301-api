

export const FRANCHISE_STAFF_DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'pass123456789pass123456789';

/** Khớp user_status enum (Postgres) */
export const USER_STATUS_PENDING = 'pending';
export const USER_STATUS_ACTIVE = 'active';
export const USER_STATUS_REJECTED = 'rejected';
