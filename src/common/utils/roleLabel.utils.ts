import { UserRole } from 'src/module/auth/dto/create-user.dto';

export class roleLabelUtils {
  static getRoleLabel(role: UserRole): string {
    switch (role) {
      case UserRole.ADMIN:
        return 'Quản trị viên hệ thống';
      case UserRole.MANAGER:
        return 'Quản lý khu vực';
      case UserRole.SUPPLY_COORDINATOR:
        return 'Điều phối viên nguồn cung';
      case UserRole.CENTRAL_KITCHEN_STAFF:
        return 'Nhân viên bếp trung tâm';
      case UserRole.FRANCHISE_STORE_STAFF:
        return 'Nhân viên cửa hàng nhượng quyền';
      default:
        return role;
    }
  }
}
