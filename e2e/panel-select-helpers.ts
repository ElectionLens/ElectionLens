import type { Locator, Page } from '@playwright/test';

/**
 * YearSelector: desktop renders `<select id={fieldId}>`, mobile uses `<button id={fieldId}>`
 * plus a hidden `<select id={`${fieldId}-proxy`}>`. Assertions and `selectOption` must target
 * the native `<select>` (desktop id or mobile `-proxy`).
 */
export function acPanelYearNative(scope: Page | Locator): Locator {
  return scope.locator('select#ac-panel-year-proxy, select#ac-panel-year');
}

export function pcPanelYearNative(scope: Page | Locator): Locator {
  return scope.locator('select#pc-panel-year-proxy, select#pc-panel-year');
}

export function acPanelViewNative(scope: Page | Locator): Locator {
  return scope.locator('select#ac-panel-view-proxy, select#ac-panel-view');
}

export function pcPanelViewNative(scope: Page | Locator): Locator {
  return scope.locator('select#pc-panel-view-proxy, select#pc-panel-view');
}
