interface BatchLabelData {
  batchCode: string;
  sku: string;
  expiryDate: string;
  initialQuantity: string;
}

export const generateQrData = (batch: BatchLabelData) => {
  const qrPayload = {
    b: batch.batchCode,
    s: batch.sku,
    e: batch.expiryDate,
    q: Number(batch.initialQuantity),
  };
  return JSON.stringify(qrPayload);
};
