/**
 * Changelog — update this file with every release.
 *
 * Rules:
 *  - Add a new entry at the TOP of the array for each version.
 *  - `version` must match the version string in package.json exactly.
 *  - `date` is display-only (Arabic or Gregorian, your choice).
 *  - Each item in `changes` is one bullet point shown in the modal.
 *  - `type` controls the bullet color: 'new' | 'fix' | 'improve'
 */

export interface ChangeEntry {
  type: 'new' | 'fix' | 'improve'
  text: string
}

export interface VersionLog {
  version: string
  date: string
  changes: ChangeEntry[]
}

export const CHANGELOG: VersionLog[] = [
  {
    version: '2.1.5',
    date: '13 يونيو 2026',
    changes: [
      { type: 'new',     text: 'إمكانية إضافة صنف بدون مكوّنات (بدون خصم مخزون عند الطلب)' },
      { type: 'new',     text: 'حفظ محتوى التابات تلقائيًا — البيانات المدخلة لا تُمسح عند التبديل بين التابات' },
    ]
  },
  // ── Add older versions below (newest first) ──────────────────────────────
  {
    version: '2.1.4',
    date: '1 يونيو 2026',
    changes: [
      { type: 'fix',     text: 'إصلاح مشكلة في حساب الضريبة على طلبات التوصيل' },
      { type: 'improve', text: 'تحسين سرعة تحميل صفحة الكاشير' },
    ]
  },
]
