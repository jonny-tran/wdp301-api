import {
  buildStaffEmailLocalBase,
  formatStaffEmail,
  pickUniqueStaffEmail,
  removeVietnameseTones,
} from './name-generator.util';

describe('name-generator.util', () => {
  it('removeVietnameseTones strips marks', () => {
    expect(removeVietnameseTones('Đạt')).toBe('Dat');
    expect(removeVietnameseTones('Trần')).toBe('Tran');
  });

  it('buildStaffEmailLocalBase matches họ-đệm + tên rule', () => {
    expect(buildStaffEmailLocalBase('Trần Thành Đạt')).toBe('dattt');
    expect(buildStaffEmailLocalBase('Nguyễn Văn A')).toBe('anv');
  });

  it('formatStaffEmail uses .wdp@gmail.com suffix', () => {
    expect(formatStaffEmail('dattt', 1)).toBe('dattt1.wdp@gmail.com');
  });

  it('pickUniqueStaffEmail picks first free suffix', async () => {
    const exists = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const r = await pickUniqueStaffEmail('Trần Thành Đạt', exists);
    expect(r.suffix).toBe(2);
    expect(r.email).toBe('dattt2.wdp@gmail.com');
    expect(exists).toHaveBeenCalledTimes(2);
  });
});
