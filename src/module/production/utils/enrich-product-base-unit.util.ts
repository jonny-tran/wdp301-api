/** Chuẩn hóa product từ Drizzle `with: { baseUnit: true }` → thêm `baseUnitName`, bỏ object lồng `baseUnit`. */

type ProductRow = Record<string, unknown> & {
  baseUnit?: { name?: string } | null;
};

export function mapProductWithBaseUnitName(
  product: ProductRow,
): Record<string, unknown> {
  const { baseUnit, ...rest } = product;
  return {
    ...rest,
    baseUnitName: baseUnit?.name ?? null,
  };
}

export function enrichRecipeForResponse(recipe: Record<string, unknown>) {
  const out = { ...recipe };
  if (out.outputProduct && typeof out.outputProduct === 'object') {
    out.outputProduct = mapProductWithBaseUnitName(
      out.outputProduct as ProductRow,
    );
  }
  if (Array.isArray(out.items)) {
    out.items = out.items.map((row: Record<string, unknown>) => ({
      ...row,
      ingredient:
        row.ingredient != null && typeof row.ingredient === 'object'
          ? mapProductWithBaseUnitName(row.ingredient as ProductRow)
          : row.ingredient,
    }));
  }
  return out;
}

/** Danh sách lệnh SX: đơn vị trên thành phẩm đầu ra của recipe. */
export function enrichRecipeOutputProductOnly(recipe: Record<string, unknown>) {
  const out = { ...recipe };
  if (out.outputProduct && typeof out.outputProduct === 'object') {
    out.outputProduct = mapProductWithBaseUnitName(
      out.outputProduct as ProductRow,
    );
  }
  return out;
}

export function enrichProductionOrderDetail(order: Record<string, unknown>) {
  const out = { ...order };
  if (out.recipe && typeof out.recipe === 'object') {
    out.recipe = enrichRecipeForResponse(out.recipe as Record<string, unknown>);
  }
  if (Array.isArray(out.reservations)) {
    out.reservations = out.reservations.map((r: Record<string, unknown>) => {
      const batch = r.batch as Record<string, unknown> | null | undefined;
      if (batch?.product && typeof batch.product === 'object') {
        return {
          ...r,
          batch: {
            ...batch,
            product: mapProductWithBaseUnitName(batch.product as ProductRow),
          },
        };
      }
      return r;
    });
  }
  if (Array.isArray(out.batchLineages)) {
    out.batchLineages = out.batchLineages.map((l: Record<string, unknown>) => {
      const next = { ...l };
      const pb = l.parentBatch as Record<string, unknown> | undefined;
      if (pb?.product && typeof pb.product === 'object') {
        next.parentBatch = {
          ...pb,
          product: mapProductWithBaseUnitName(pb.product as ProductRow),
        };
      }
      const cb = l.childBatch as Record<string, unknown> | undefined;
      if (cb?.product && typeof cb.product === 'object') {
        next.childBatch = {
          ...cb,
          product: mapProductWithBaseUnitName(cb.product as ProductRow),
        };
      }
      return next;
    });
  }
  return out;
}

export function enrichInventoryTransactionsWithProductBaseUnit(
  txs: Record<string, unknown>[],
) {
  return txs.map((tx) => {
    const batch = tx.batch as Record<string, unknown> | null | undefined;
    if (batch?.product && typeof batch.product === 'object') {
      return {
        ...tx,
        batch: {
          ...batch,
          product: mapProductWithBaseUnitName(batch.product as ProductRow),
        },
      };
    }
    return tx;
  });
}
