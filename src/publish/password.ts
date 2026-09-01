export type WeakPublicationPasswordWarning = (
  codePointLength: number,
) => void;

export function formatWeakPublicationPasswordWarning(
  codePointLength: number,
): string {
  return `警告：发布密码长度为 ${codePointLength} 个 Unicode code point，低于建议的 16 个。`;
}

export function validatePublicationPasswords(
  first: string,
  second: string,
  onWeakPasswordWarning?: WeakPublicationPasswordWarning,
): string {
  const codePointLength = [...first].length;
  if (codePointLength < 8) {
    throw new Error("发布密码至少 8 个 Unicode code point");
  }
  if (first !== second) {
    throw new Error("两次输入不一致");
  }
  if (codePointLength < 16) {
    onWeakPasswordWarning?.(codePointLength);
  }
  return first;
}
