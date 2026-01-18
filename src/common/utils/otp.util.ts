import { randomInt } from 'crypto';

export class OtpUtil {
  static generate(length: number = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length);

    return randomInt(min, max).toString();
  }
}
