/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-base-to-string */
import {
  AnyColumn,
  InferSelectModel,
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  lte,
  or,
} from 'drizzle-orm';
import { PgDatabase, PgTable } from 'drizzle-orm/pg-core';
import { PaginationParamsDto, SortOrder } from '../dto/pagination-params.dto';
import { PaginatedResponse } from '../interfaces/paginated.interface';

export type FilterOperator =
  | 'eq'
  | 'ilike'
  | 'gte'
  | 'lte'
  | 'gt'
  | 'lt'
  | 'in'
  | 'between';

export type FilterMap<T extends PgTable> = Record<
  string,
  {
    column: AnyColumn | AnyColumn[];
    operator: FilterOperator;
  }
>;

/**
 * Hàm phân trang và lọc dữ liệu chuẩn Type-safe cho Drizzle ORM
 */
export async function paginate<T extends PgTable>(
  db: PgDatabase<any, any, any>,
  table: T,
  dto: PaginationParamsDto & Record<string, unknown>,
  filterMap?: FilterMap<T>,
): Promise<PaginatedResponse<InferSelectModel<T>>> {
  const isPaginationDisabled = !dto.limit;

  const page = Number(dto.page) || 1;
  const limit = Number(dto.limit);
  const offset = (page - 1) * limit;

  // 1. Xử lý Filter
  const whereConditions: SQL[] = [];

  if (filterMap) {
    Object.keys(filterMap).forEach((key) => {
      const value = dto[key];

      if (value !== undefined && value !== null && value !== '') {
        const { column, operator } = filterMap[key];

        const columns = Array.isArray(column) ? column : [column];

        const subConditions = columns
          .map((col) => {
            switch (operator) {
              case 'eq':
                return eq(col, value);
              case 'ilike':
                return ilike(col, `%${String(value)}%`);
              case 'gte':
                return gte(col, value);
              case 'lte':
                return lte(col, value);
              case 'gt':
                return gte(col, value);
              case 'lt':
                return lte(col, value);
              case 'in': {
                const values =
                  typeof value === 'string'
                    ? value.split(',')
                    : (value as unknown[]);
                return inArray(col, values);
              }
              default:
                return undefined;
            }
          })
          .filter(Boolean) as SQL[];

        if (subConditions.length > 0) {
          const condition = or(...subConditions);
          if (condition) {
            whereConditions.push(condition);
          }
        }
      }
    });
  }

  // 2. Xử lý Sorting
  let orderBy: SQL | undefined;
  const columns = getTableColumns(table);

  if (dto.sortBy && columns[dto.sortBy]) {
    orderBy =
      dto.sortOrder === SortOrder.ASC
        ? asc(columns[dto.sortBy])
        : desc(columns[dto.sortBy]);
  } else {
    orderBy = columns['createdAt']
      ? desc(columns['createdAt'])
      : desc(columns['id']);
  }

  const baseQuery = db
    .select()
    .from(table as PgTable)
    .where(and(...whereConditions))
    .orderBy(orderBy);

  const itemsQuery = isPaginationDisabled
    ? baseQuery
    : baseQuery.limit(limit).offset(offset);

  // 3. Thực thi Query
  const [totalResult, items] = await Promise.all([
    db
      .select({ count: count() })
      .from(table as PgTable)
      .where(and(...whereConditions)),
    itemsQuery,
  ]);

  const totalItems = Number(totalResult[0]?.count || 0);

  return {
    items: items as InferSelectModel<T>[],
    meta: {
      totalItems,
      itemCount: items.length,
      itemsPerPage: isPaginationDisabled ? totalItems : limit,
      totalPages: isPaginationDisabled ? 1 : Math.ceil(totalItems / limit),
      currentPage: isPaginationDisabled ? 1 : page,
    },
  };
}
