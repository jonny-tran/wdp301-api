import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const VN_TZ = 'Asia/Ho_Chi_Minh';

export function nowVn(): dayjs.Dayjs {
  return dayjs().tz(VN_TZ);
}

export function parseToStartOfDayVn(value: string | Date): dayjs.Dayjs {
  return dayjs(value).tz(VN_TZ).startOf('day');
}

export function parseToEndOfDayVn(value: string | Date): dayjs.Dayjs {
  return dayjs(value).tz(VN_TZ).endOf('day');
}

export function isPastClosingTime(
  nowVn: dayjs.Dayjs,
  closingTimeStr: string | null | undefined,
): boolean {
  if (!closingTimeStr) return false;
  const parts = closingTimeStr.split(':');
  if (parts.length !== 2) return false;
  const closingHour = parseInt(parts[0], 10);
  const closingMinute = parseInt(parts[1], 10);
  if (Number.isNaN(closingHour) || Number.isNaN(closingMinute)) return false;
  const currentTotalMinutes = nowVn.hour() * 60 + nowVn.minute();
  const closingTotalMinutes = closingHour * 60 + closingMinute;
  return currentTotalMinutes >= closingTotalMinutes;
}

/** Lần chạy xe tiếp theo tại `timeStr` (HH:mm) theo lịch ngày VN */
export function nextTruckDeparture(nowVn: dayjs.Dayjs, timeStr: string): dayjs.Dayjs {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] ?? '0', 10) || 0;
  const m = parseInt(parts[1] ?? '0', 10) || 0;
  let dep = nowVn.startOf('day').hour(h).minute(m).second(0).millisecond(0);
  if (!dep.isAfter(nowVn)) {
    dep = dep.add(1, 'day');
  }
  return dep;
}
