/**
 * 请求错误判定工具。
 *
 * 「超时」与「失败」在用户眼里是两件事：超时通常意味着后端仍在处理，
 * 只是等待超过了前端耐心。把它们混为一谈会让人以为操作没生效而重复提交，
 * 所以这里单独识别超时，供调用方给出「已提交、正在排队」这类提示。
 */

/** 是否请求超时（axios 超时 / 浏览器中断 / 网关超时都算） */
export function isTimeoutError(error: any): boolean {
  if (!error) return false;
  // axios: code=ECONNABORTED，message 形如 "timeout of 120000ms exceeded"
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;
  if (error.response?.status === 504) return true;
  const msg = String(error.message ?? '').toLowerCase();
  return msg.includes('timeout') || msg.includes('超时');
}
