/**
 * 过滤规则 / 刷流规则 共享的"指定原始语言"可选项
 *
 * 与后端 FILTER_LANGUAGE_OPTIONS / language_dict 对齐：
 * - value 留空表示"全部语言"（不约束）
 * - "other" 表示"不在已知列表中的语言"
 * - 其余值取 TMDB original_language 代码前两位
 *
 * 后端契约参见后端仓库 src/app/core/constants.py::FILTER_LANGUAGE_OPTIONS
 * 与 src/app/services/filter_service.py::FilterRuleEngine.check_rules
 * 的 original_language 判断段。
 */
export const ORIGINAL_LANGUAGE_OPTIONS: Array<{
  label: string;
  value: string;
}> = [
  { label: '全部', value: '' },
  { label: '中文', value: 'zh' },
  { label: '英语', value: 'en' },
  { label: '日语', value: 'ja' },
  { label: '韩语', value: 'ko' },
  { label: '法语', value: 'fr' },
  { label: '德语', value: 'de' },
  { label: '俄语', value: 'ru' },
  { label: '印地语', value: 'hi' },
  { label: '其他', value: 'other' },
];

/** 根据语言代码获取展示用 label（找不到时回退为代码本身或"未知"）。 */
export function getOriginalLanguageLabel(code?: null | string): string {
  if (!code) {
    return '';
  }
  const hit = ORIGINAL_LANGUAGE_OPTIONS.find((o) => o.value === code);
  return hit ? hit.label : code;
}
