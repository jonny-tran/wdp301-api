/**
 * Sinh phần local email: [tên không dấu][chữ cái đầu họ + đệm], ví dụ "Trần Thành Đạt" -> "dattt"
 */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function buildStaffEmailLocalBase(fullName: string): string {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return 'staff';
  }

  const parts = trimmed.split(' ');
  if (parts.length === 1) {
    return removeVietnameseTones(parts[0]).toLowerCase().replace(/[^a-z0-9]/g, '') || 'staff';
  }

  const given = parts[parts.length - 1];
  const rest = parts.slice(0, -1);
  const givenRoman = removeVietnameseTones(given)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const initials = rest
    .map((p) => {
      const t = removeVietnameseTones(p).toLowerCase();
      const c = t.match(/[a-z]/);
      return c ? c[0] : '';
    })
    .join('');

  const base = `${givenRoman}${initials}`.replace(/[^a-z0-9]/g, '');
  return base || 'staff';
}

const STAFF_EMAIL_DOMAIN = 'wdp@gmail.com';

export function formatStaffEmail(localBase: string, suffix: number): string {
  return `${localBase}${suffix}.${STAFF_EMAIL_DOMAIN}`;
}

/**
 * Chọn email {base}{1..maxSuffix}.wdp@gmail.com chưa tồn tại (kiểm tra qua callback).
 */
export async function pickUniqueStaffEmail(
  fullName: string,
  emailExists: (email: string) => Promise<boolean>,
  maxSuffix = 100,
): Promise<{ email: string; localBase: string; suffix: number }> {
  const rawBase = buildStaffEmailLocalBase(fullName);
  const localBase = rawBase.slice(0, 64);

  for (let suffix = 1; suffix <= maxSuffix; suffix++) {
    const email = formatStaffEmail(localBase, suffix);
    const taken = await emailExists(email);
    if (!taken) {
      return { email, localBase, suffix };
    }
  }

  throw new Error(
    `Không còn hậu tố email trống (1-${maxSuffix}) cho base "${localBase}"`,
  );
}
