/**
 * Tiện ích cho Drizzle + node-pg: `.returning()` đôi khi được suy luận kiểu `T[] | QueryResult<never>`;
 * quan hệ `one()` đôi khi bị suy luận `T | T[]`.
 */
export function firstInsertedRow<T>(result: T[] | unknown): T | undefined {
  if (!Array.isArray(result)) return undefined;
  return result[0];
}

/**
 * Thu hẹp quan hệ one-to-one; Drizzle đôi khi suy luận `T | T[]` hoặc `{ [x: string]: any }`.
 * Tham số `unknown` để tránh lỗi gán kiểu khi truyền từ relational query.
 */
export function oneRelation<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value as T;
}
