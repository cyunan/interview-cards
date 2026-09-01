export function validatePublicationPasswords(
  first: string,
  second: string,
): string {
  if ([...first].length < 16) {
    throw new Error("发布密码至少 16 个字符");
  }
  if (first !== second) {
    throw new Error("两次输入不一致");
  }
  return first;
}
