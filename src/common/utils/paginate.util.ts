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
    column: AnyColumn;
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
  const page = Number(dto.page) || 1;
  const limit = Number(dto.limit) || 10;
  const offset = (page - 1) * limit;

  // 1. Xử lý Filter
  const whereConditions: SQL[] = [];

  if (filterMap) {
    Object.keys(filterMap).forEach((key) => {
      const value = dto[key];

      if (value !== undefined && value !== null && value !== '') {
        const { column, operator } = filterMap[key];

        switch (operator) {
          case 'eq':
            whereConditions.push(eq(column, value));
            break;
          case 'ilike':
            whereConditions.push(ilike(column, `%${String(value)}%`));
            break;
          case 'gte':
            whereConditions.push(gte(column, new Date(String(value))));
            break;
          case 'lte':
            whereConditions.push(lte(column, new Date(String(value))));
            break;
          case 'gt':
            whereConditions.push(gte(column, value));
            break;
          case 'lt':
            whereConditions.push(lte(column, value));
            break;
          case 'in': {
            const values =
              typeof value === 'string'
                ? value.split(',')
                : (value as unknown[]);
            whereConditions.push(inArray(column, values));
            break;
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

  // 3. Thực thi Query
  const [totalResult, items] = await Promise.all([
    db
      .select({ count: count() })
      .from(table as PgTable)
      .where(and(...whereConditions)),
    db
      .select()
      .from(table as PgTable)
      .where(and(...whereConditions))
      .limit(limit)
      .offset(offset)
      .orderBy(orderBy),
  ]);

  const totalItems = Number(totalResult[0]?.count || 0);
  const totalPages = Math.ceil(totalItems / limit);

  return {
    items: items as InferSelectModel<T>[],
    meta: {
      totalItems,
      itemCount: items.length,
      itemsPerPage: limit,
      totalPages,
      currentPage: page,
    },
  };
}
