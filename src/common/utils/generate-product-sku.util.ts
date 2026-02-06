export class SkuUtil {
  /**
   * Loại bỏ dấu tiếng Việt và ký tự đặc biệt, chuyển sang viết hoa
   */
  private static normalizeString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9 ]/g, '') // Loại bỏ ký tự đặc biệt
      .toUpperCase();
  }

  /**
   * Tạo chữ viết tắt từ tên sản phẩm
   * "Gà Rán Truyền Thống" -> "GRTT"
   */
  private static getNameAbbreviation(name: string): string {
    const normalized = this.normalizeString(name);
    const words = normalized.split(' ').filter((w) => w.length > 0);

    // Nếu tên có nhiều từ, lấy các chữ cái đầu
    if (words.length >= 2) {
      return words
        .map((w) => w[0])
        .join('')
        .slice(0, 4);
    }
    // Nếu chỉ có 1 từ, lấy 4 ký tự đầu
    return normalized.slice(0, 4);
  }

  /**
   * Tạo chuỗi ngẫu nhiên 6 ký tự để giảm tỷ lệ trùng lặp (Collision)
   * Không gian mã: 36^6 = 2,176,782,336 tổ hợp
   */
  private static generateRandomSuffix(length: number = 6): string {
    // .substring(2, 8) lấy từ vị trí thứ 2 đến vị trí thứ 7 (tổng 6 ký tự)
    return Math.random()
      .toString(36)
      .replace(/[^a-z0-9]/g, '')
      .substring(0, length)
      .toUpperCase();
  }

  /**
   * Hàm tạo SKU chính
   */
  static generateProductSku(
    productName: string | null,
    length: number = 6,
  ): string {
    const prefix = 'P';
    const namePart = this.getNameAbbreviation(productName || '');
    const suffix = this.generateRandomSuffix(length);

    return `${prefix}-${namePart}-${suffix}`;
  }
}
